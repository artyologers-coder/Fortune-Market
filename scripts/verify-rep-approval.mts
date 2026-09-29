/**
 * Verifies the admin payment approval gate end to end against a dev branch.
 *
 * The thing under test is the property that matters: a producer can never
 * become approved without the money question being settled, and a commission
 * can never exist without a settled payment and a locked referral. Every other
 * combination must be refused, and the refusal must leave no partial state.
 *
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx scripts/verify-rep-approval.mts
 */
import "./db-target-guard.mts";

import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { withCodeInTransaction } from "../src/lib/representative-code";
import { approveApplication } from "../src/lib/representative-admin";
import { registerProducer } from "../src/lib/producer-registration";
import {
  approveProducerWithPayment,
  verifyRegistrationPayment,
  markPaymentUnderReview,
  waiveRegistrationPayment,
  markPaymentFailed,
  rejectProducerRegistration,
  refundRegistrationPayment,
  ApprovalStateError,
} from "../src/lib/producer-approval";
import { getSettings, updateSettings } from "../src/lib/representative-settings";
import { membershipIsActive } from "../src/lib/producer-membership";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

const PREFIX = "rep-approval-";
let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ok  ${label}`);
};

const admin = { id: "approval-verification-admin", role: "ADMIN" } as const;
let counter = 0;
const uniq = () => `${Date.now()}-${counter++}`;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const producers = await prisma.producer.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const producerIds = producers.map((p) => p.id);
  const reps = await prisma.representative.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const repIds = reps.map((r) => r.id);

  if (producerIds.length > 0) {
    await prisma.product.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.commissionPayoutItem.deleteMany({
      where: { commission: { producerId: { in: producerIds } } },
    });
    await prisma.representativeCommission.deleteMany({
      where: { producerId: { in: producerIds } },
    });
    await prisma.producerReferral.deleteMany({
      where: { OR: [{ producerId: { in: producerIds } }, { representativeId: { in: repIds } }] },
    });
    await prisma.producerRegistrationPayment.deleteMany({
      where: { producerId: { in: producerIds } },
    });
    await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  }

  await prisma.representativeApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representativeAuditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { representativeId: { in: repIds } }] },
  });
  await prisma.representativeLead.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.commissionPayout.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representative.deleteMany({ where: { id: { in: repIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function makeRep() {
  const approvedApp = await approveApplication(
    (
      await prisma.representativeApplication.create({
        data: {
          applicationCode: `FM-APP-TEST-${uniq()}`,
          user: {
            create: {
              email: `${PREFIX}rep-${uniq()}@test.local`,
              passwordHash: await bcrypt.hash("x", 4),
              role: "REPRESENTATIVE",
              name: "Approval Rep",
            },
          },
          fullName: "Approval Rep",
          email: `${PREFIX}repr-${uniq()}@test.local`,
          phone: "0771111111",
          district: "Colombo",
          agreedTerms: true,
          agreedCommission: true,
          agreedPrivacy: true,
          confirmedAccurate: true,
          agreementsAt: new Date(),
          status: "UNDER_REVIEW",
        },
        select: { id: true },
      })
    ).id,
    admin
  );
  const row = await prisma.representative.findUniqueOrThrow({
    where: { id: approvedApp.representativeId },
    select: { id: true, code: true, status: true },
  });
  return row;
}

/** Registers a referred producer and returns its payment row. */
async function referredProducer(rep: { id: string; code: string; status: string }) {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}prod-${uniq()}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      role: "PRODUCER",
      name: "Approval Producer",
    },
    select: { id: true },
  });
  const n = counter++;
  await registerProducer({
    userId: user.id,
    businessName: `Approval Cafe ${uniq()}`,
    location: "Colombo 07",
    district: "Colombo",
    phone: `+9477${String(6000000 + n).slice(0, 7)}`,
    email: null,
    referral: {
      id: rep.id,
      code: rep.code,
      fullName: "Approval Rep",
      district: "Colombo",
      status: rep.status,
      leadId: null,
      canConvert: true,
    },
  });
  const payment = await prisma.producerRegistrationPayment.findFirstOrThrow({
    where: { producer: { userId: user.id } },
    orderBy: { createdAt: "desc" },
  });
  return { userId: user.id, payment };
}

async function setGate(mode: "AUTO" | "FORCE_OPEN" | "FORCE_CLOSED") {
  await updateSettings({ feeEnforcementMode: mode }, admin, "approval verification");
}

const settings = await prisma.representativeSettings.findUniqueOrThrow({
  where: { id: "singleton" },
});
const EXPECTED_BASELINE_MODE = "FORCE_OPEN";

const originalMode = EXPECTED_BASELINE_MODE;
if (settings.feeEnforcementMode !== EXPECTED_BASELINE_MODE) {
  // These scripts move the shared fee gate around. If a previous run was
  // interrupted between flipping it and restoring it, blindly capturing the
  // current value as "original" would make every later run assert against the
  // wrong baseline and quietly pass. Refuse instead, and say how to fix it.
  console.error(
    `Refusing to run: the fee gate is ${settings.feeEnforcementMode}, but these ` +
      `scripts expect ${EXPECTED_BASELINE_MODE}. An earlier verification run was ` +
      `probably interrupted. Restore it with:\n` +
      `  npx tsx -e 'import { updateSettings } from "./src/lib/representative-settings"; ` +
      `updateSettings({ feeEnforcementMode: "${EXPECTED_BASELINE_MODE}" }, ` +
      `{ id: "verification-baseline-reset", role: "ADMIN" }, "reset after interrupted run")'`
  );
  process.exit(1);
}

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";
await cleanup();
await beginResidueGuard();
await setGate("FORCE_CLOSED");

// ---------------------------------------------------------------------------
console.log("\n[1] a referred producer cannot be approved while the fee is PENDING");
const rep = await makeRep();
const case1 = await referredProducer(rep);

assert.equal(case1.payment.status, "PENDING");
assert.equal(case1.payment.amount, 1200);
assert.equal(case1.payment.feeRequired, true);
ok("registration froze an owed Rs. 1200 fee as PENDING");

await assert.rejects(
  () => approveProducerWithPayment(case1.payment.id, admin),
  (e: unknown) => e instanceof ApprovalStateError && /not been verified/.test((e as Error).message)
);
const stillPending = await prisma.producer.findUniqueOrThrow({
  where: { id: case1.payment.producerId },
});
assert.equal(stillPending.verificationStatus, "PENDING", "the refusal must not approve");
assert.equal(stillPending.membershipId, null, "and must not grant a membership");
assert.equal(
  await prisma.representativeCommission.count({ where: { producerId: stillPending.id } }),
  0,
  "and must not create a commission"
);
ok("approval refused; no approval, no membership, no commission");

// ---------------------------------------------------------------------------
console.log("\n[2] verifying the payment alone does not approve anyone");
const verified = await verifyRegistrationPayment(case1.payment.id, admin, {
  reference: "SLIP-001",
});
assert.equal(verified.status, "PAID");
const afterVerify = await prisma.producer.findUniqueOrThrow({
  where: { id: case1.payment.producerId },
});
assert.equal(afterVerify.verificationStatus, "PENDING");
ok("payment is PAID, producer is still PENDING — approval is a separate decision");

// ---------------------------------------------------------------------------
console.log("\n[3] approval now grants membership and the commission atomically");
const approved = await approveProducerWithPayment(case1.payment.id, admin);
assert.equal(approved.alreadyApproved, false);
assert.equal(approved.paymentStatus, "PAID");
assert.ok(approved.membershipId, "membership must be granted");
assert.ok(approved.membershipExpiresAt, "with an expiry");
assert.ok(membershipIsActive(approved), "and it must be active");
ok(`producer approved with membership ${approved.membershipId} expiring ${approved.membershipExpiresAt?.toISOString().slice(0, 10)}`);

assert.equal(approved.commission.created, true, "a referred producer must earn a commission");
const commissionAmount = (approved.commission as { amount: number }).amount;
assert.equal(commissionAmount, 700, "commission is the snapshot Rs. 700, not the Rs. 1200 fee");
ok(`commission ${(approved.commission as { commissionCode: string }).commissionCode} created for Rs. ${commissionAmount}`);

const commissionRow = await prisma.representativeCommission.findUniqueOrThrow({
  where: { producerId_kind: { producerId: case1.payment.producerId, kind: "INITIAL" } },
  select: { amount: true, status: true, representativeId: true, registrationPaymentId: true },
});
assert.equal(commissionRow.amount, 700);
assert.equal(commissionRow.status, "ELIGIBLE");
assert.equal(commissionRow.representativeId, rep.id);
assert.equal(commissionRow.registrationPaymentId, case1.payment.id, "linked to the settled payment");
ok("commission row is ELIGIBLE, linked to the rep and to the payment");

// ---------------------------------------------------------------------------
console.log("\n[4] re-approving is idempotent: no second commission, no extension");
const firstMembershipExpiry = approved.membershipExpiresAt!;
await new Promise((r) => setTimeout(r, 1100));
const again = await approveProducerWithPayment(case1.payment.id, admin);
assert.equal(again.alreadyApproved, true);
assert.equal(again.membershipId, approved.membershipId);
assert.equal(
  again.membershipExpiresAt!.getTime(),
  firstMembershipExpiry.getTime(),
  "an active membership must not be pushed forward by a re-approval"
);
assert.equal(
  await prisma.representativeCommission.count({
    where: { producerId: case1.payment.producerId },
  }),
  1,
  "exactly one commission may ever exist for a producer's initial fee"
);
ok("second approve changed nothing: same membership date, still one commission");

// ---------------------------------------------------------------------------
console.log("\n[5] a free unreferred producer is approved without a commission");
// FORCE_OPEN is the gate being OPEN, which is what makes an unreferred
// registration free. FORCE_CLOSED is the opposite: the fee is owed.
await setGate("FORCE_OPEN");
const freeUser = await prisma.user.create({
  data: {
    email: `${PREFIX}free-${uniq()}@test.local`,
    passwordHash: await bcrypt.hash("x", 4),
    role: "PRODUCER",
    name: "Free Producer",
  },
  select: { id: true },
});
const n5 = counter++;
await registerProducer({
  userId: freeUser.id,
  businessName: `Free Stall ${uniq()}`,
  location: "Gampaha",
  district: "Gampaha",
  phone: `+9475${String(7000000 + n5).slice(0, 7)}`,
  email: null,
});
const freePayment = await prisma.producerRegistrationPayment.findFirstOrThrow({
  where: { producer: { userId: freeUser.id } },
});
assert.equal(freePayment.amount, 0);
assert.equal(freePayment.status, "WAIVED", "a zero-amount row is recorded, not omitted");
assert.equal(freePayment.waivedById, null, "system-generated, so no admin is named");
assert.equal(freePayment.feeRequired, false);
ok("open gate: free producer owes nothing, recorded as an explicit system WAIVED");

const freeApproved = await approveProducerWithPayment(freePayment.id, admin);
assert.ok(freeApproved.membershipId, "free approved producers still get the 365 days");
assert.equal(freeApproved.commission.created, false);
assert.equal((freeApproved.commission as { code: string }).code, "NO_REFERRAL");
ok("approved with a full membership and no commission (NO_REFERRAL)");

// ---------------------------------------------------------------------------
console.log("\n[6] a system waiver cannot clear a fee that was actually owed");
const rep2 = await makeRep();
const case6 = await referredProducer(rep2);
assert.equal(case6.payment.status, "PENDING");

// Forge the shape an unreferred free registration produces: WAIVED, no admin,
// but feeRequired still true because a referral was in play.
await prisma.producerRegistrationPayment.update({
  where: { id: case6.payment.id },
  data: { status: "WAIVED", waivedAt: new Date(), waivedById: null },
});
await assert.rejects(
  () => approveProducerWithPayment(case6.payment.id, admin),
  (e: unknown) => e instanceof ApprovalStateError && /system-generated/.test((e as Error).message)
);
ok("an owed fee with an unattributed waiver is refused");

// ---------------------------------------------------------------------------
console.log("\n[7] an explicit admin waiver clears it and preserves the commission");
const waived = await waiveRegistrationPayment(case6.payment.id, admin, "Repeat referrer, fee waived by agreement.");
assert.equal(waived.status, "WAIVED");
assert.equal(waived.waivedById, admin.id, "the waiver must be attributable");
const waivedApproved = await approveProducerWithPayment(case6.payment.id, admin);
assert.equal(waivedApproved.commission.created, true, "an admin waiver still pays the rep");
assert.equal((waivedApproved.commission as { amount: number }).amount, 700);
ok("admin waiver approves and keeps the rep's Rs. 700");

// ---------------------------------------------------------------------------
console.log("\n[8] a waiver always needs a real reason");
const rep3 = await makeRep();
const case8 = await referredProducer(rep3);
for (const bad of ["", "yes", "ok thanks"]) {
  await assert.rejects(
    () => waiveRegistrationPayment(case8.payment.id, admin, bad),
    (e: unknown) => e instanceof ApprovalStateError
  );
}
await assert.rejects(
  () => markPaymentFailed(case8.payment.id, admin, "nope"),
  (e: unknown) => e instanceof ApprovalStateError
);
await assert.rejects(
  () => refundRegistrationPayment(case8.payment.id, admin, "too short"),
  (e: unknown) => e instanceof ApprovalStateError
);
ok("waive, fail and refund all refuse a token reason");

// ---------------------------------------------------------------------------
console.log("\n[9] under review is a real state, and a failed payment blocks approval");
const case9 = await referredProducer(rep3);
await markPaymentUnderReview(case9.payment.id, admin, "Chased the applicant.");
assert.equal(
  (await prisma.producerRegistrationPayment.findUniqueOrThrow({ where: { id: case9.payment.id } })).status,
  "UNDER_REVIEW"
);
await assert.rejects(
  () => approveProducerWithPayment(case9.payment.id, admin),
  (e: unknown) => e instanceof ApprovalStateError && /under review/.test((e as Error).message)
);
ok("UNDER_REVIEW blocks approval");

await markPaymentFailed(case9.payment.id, admin, "No money ever arrived.");
await assert.rejects(
  () => approveProducerWithPayment(case9.payment.id, admin),
  (e: unknown) => e instanceof ApprovalStateError && /marked failed/.test((e as Error).message)
);
ok("FAILED blocks approval");

// ---------------------------------------------------------------------------
console.log("\n[10] refunding a settled payment neutralises the commission");
const case10 = await referredProducer(rep3);
await verifyRegistrationPayment(case10.payment.id, admin, { reference: "SLIP-010" });
await approveProducerWithPayment(case10.payment.id, admin);
const beforeRefund = await prisma.representativeCommission.findUniqueOrThrow({
  where: { producerId_kind: { producerId: case10.payment.producerId, kind: "INITIAL" } },
});
assert.equal(beforeRefund.status, "ELIGIBLE");

const refunded = await refundRegistrationPayment(
  case10.payment.id,
  admin,
  "Producer requested a refund after a duplicate bank transfer."
);
assert.equal(refunded.status, "REFUNDED");
const afterRefund = await prisma.representativeCommission.findUniqueOrThrow({
  where: { id: beforeRefund.id },
  select: { status: true, cancellationReason: true },
});
assert.equal(afterRefund.status, "CANCELLED", "the rep's balance must be corrected");
assert.ok(afterRefund.cancellationReason, "with the reason recorded");
ok("refund marks the payment REFUNDED and cancels the unpaid commission with a reason");

await assert.rejects(
  () => refundRegistrationPayment(case10.payment.id, admin, "again, with a long reason"),
  (e: unknown) => e instanceof ApprovalStateError && /Only a paid or waived/.test((e as Error).message)
);
ok("a refunded payment cannot be refunded twice");

// ---------------------------------------------------------------------------
console.log("\n[11] a rejected producer keeps their evidence trail");
const case11 = await referredProducer(rep3);
await rejectProducerRegistration(
  case11.payment.id,
  admin,
  "Business registration documents were forged."
);
const rejected = await prisma.producer.findUniqueOrThrow({
  where: { id: case11.payment.producerId },
  select: { verificationStatus: true, membershipId: true },
});
assert.equal(rejected.verificationStatus, "REJECTED");
assert.equal(rejected.membershipId, null, "a rejected producer must get no membership");
assert.equal(
  await prisma.representativeCommission.count({ where: { producerId: case11.payment.producerId } }),
  0
);
const keptPayment = await prisma.producerRegistrationPayment.findUniqueOrThrow({
  where: { id: case11.payment.id },
});
assert.equal(keptPayment.status, "PENDING", "the attempted payment is still visible to admins");
ok("producer REJECTED, no membership, no commission, payment row retained");

// ---------------------------------------------------------------------------
console.log("\n[12] every decision is audited against a named admin");
const audit = await prisma.representativeAuditLog.findMany({
  where: { actorId: admin.id },
  select: { action: true, entityType: true },
});
const actions = new Set(audit.map((a) => a.action));
for (const expected of [
  "PAYMENT_VERIFIED",
  "PAYMENT_WAIVED",
  "PAYMENT_FAILED",
  "PAYMENT_REFUNDED",
  "PRODUCER_APPROVED",
  "PRODUCER_REJECTED",
  "REPRESENTATIVE_SETTINGS_UPDATED",
]) {
  assert.ok(actions.has(expected), `missing audit action ${expected}`);
}
ok(`audited: ${[...actions].sort().join(", ")}`);

// ---------------------------------------------------------------------------
await setGate(originalMode);
await cleanup();
await purgeResidue();
await assertNoResidue("verify-rep-approval");
const final = await getSettings();
assert.equal(final.feeEnforcementMode, originalMode);
ok(`settings restored to ${originalMode}`);

console.log(`\n${passed} approval-gate checks passed against the dev database.`);
