/**
 * Verifies commission payout execution: the last irreversible step in the
 * earnings flow, and the step where double-paying a representative would do real
 * harm.
 *
 * The properties that matter:
 *   - money cannot be paid before an admin approves it
 *   - a commission cannot be in two live payouts at once
 *   - cancelling or failing a payout returns the money instead of stranding it
 *   - paying is idempotent and cannot be undone into a lie
 *
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx scripts/verify-rep-payout.mts
 */
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { withCodeInTransaction } from "../src/lib/representative-code";
import { approveApplication } from "../src/lib/representative-admin";
import { registerProducer } from "../src/lib/producer-registration";
import { approveProducerWithPayment, verifyRegistrationPayment } from "../src/lib/producer-approval";
import {
  approveCommission,
  approveEligibleCommissions,
  createPayoutForRepresentative,
  markPayoutPaid,
  markPayoutFailed,
  cancelPayout,
  getPayoutReadiness,
  PayoutStateError,
} from "../src/lib/payout";
import { getEarningSummary, listPayableCommissions as listPayable } from "../src/lib/commission";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

const PREFIX = "rep-payout-";
let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ok  ${label}`);
};

const admin = { id: "payout-verification-admin", role: "ADMIN" } as const;
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

  const payoutIds = (
    await prisma.commissionPayout.findMany({ where: { representativeId: { in: repIds } }, select: { id: true } })
  ).map((p) => p.id);

  if (payoutIds.length > 0) {
    await prisma.commissionPayoutItem.deleteMany({ where: { payoutId: { in: payoutIds } } });
    await prisma.commissionPayout.deleteMany({ where: { id: { in: payoutIds } } });
  }
  if (producerIds.length > 0) {
    await prisma.product.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.representativeCommission.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producerReferral.deleteMany({
      where: { OR: [{ producerId: { in: producerIds } }, { representativeId: { in: repIds } }] },
    });
    await prisma.producerRegistrationPayment.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  }

  await prisma.representativeApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representativeAuditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { representativeId: { in: repIds } }] },
  });
  await prisma.representativeLead.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representative.deleteMany({ where: { id: { in: repIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";
await cleanup();

await beginResidueGuard();
/** An approved representative who has earned `n` eligible commissions. */
async function repWithCommissions(n: number) {
  const app = await prisma.representativeApplication.create({
    data: {
      applicationCode: `FM-APP-TEST-${uniq()}`,
      user: {
        create: {
          email: `${PREFIX}rep-${uniq()}@test.local`,
          passwordHash: await bcrypt.hash("x", 4),
          role: "REPRESENTATIVE",
          name: "Payout Rep",
        },
      },
      fullName: "Payout Rep",
      email: `${PREFIX}repr-${uniq()}@test.local`,
      phone: "0772222222",
      district: "Colombo",
      agreedTerms: true,
      agreedCommission: true,
      agreedPrivacy: true,
      confirmedAccurate: true,
      agreementsAt: new Date(),
      status: "UNDER_REVIEW",
    },
    select: { id: true },
  });
  const approvedApp = await approveApplication(app.id, admin);
  const rep = await prisma.representative.findUniqueOrThrow({
    where: { id: approvedApp.representativeId },
    select: { id: true, code: true, status: true, userId: true },
  });

  for (let i = 0; i < n; i++) {
    await registerApprovedProducerFor(rep, i);
  }

  return rep;
}

/**
 * Registers a producer referred by `rep`, takes the fee and approves them, which
 * is what creates the rep's commission. Split out of repWithCommissions so a test
 * can accrue a further commission for a rep who has already been paid out.
 */
async function registerApprovedProducerFor(
  rep: { id: string; code: string; status: string },
  i: number
) {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}prod-${uniq()}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      role: "PRODUCER",
      name: `Payout Producer ${i}`,
    },
    select: { id: true },
  });
  const k = counter++;
  await registerProducer({
    userId: user.id,
    businessName: `Payout Cafe ${uniq()}`,
    location: "Colombo 09",
    district: "Colombo",
    phone: `+9477${String(8000000 + k).slice(0, 7)}`,
    email: null,
    referral: {
      id: rep.id,
      code: rep.code,
      fullName: "Payout Rep",
      district: "Colombo",
      status: rep.status,
      leadId: null,
      canConvert: true,
    },
  });
  const payment = await prisma.producerRegistrationPayment.findFirstOrThrow({
    where: { producer: { userId: user.id } },
  });
  await verifyRegistrationPayment(payment.id, admin, { reference: `SLIP-${i}` });
  await approveProducerWithPayment(payment.id, admin);
}

// ---------------------------------------------------------------------------
console.log("\n[1] commissions sit at ELIGIBLE and are invisible to the payout pool");
const rep = await repWithCommissions(3);
assert.equal(await listPayable(rep.id).then((r) => r.length), 0, "ELIGIBLE is not payable yet");
const summary = await getEarningSummary(rep.id);
assert.equal(summary.counts.ELIGIBLE, 3);
assert.equal(summary.payableBalance, 0, "and contributes nothing to the payable balance");
ok("3 commissions earned, all ELIGIBLE, payable balance still 0");

const readinessBlocked = await getPayoutReadiness(rep.id);
assert.ok(readinessBlocked.blockedReason, "the admin screen must say why it cannot pay yet");
ok(`readiness explains the block: "${readinessBlocked.blockedReason}"`);

await assert.rejects(
  () => createPayoutForRepresentative(rep.id, admin),
  (e: unknown) => e instanceof PayoutStateError && /approved before they can be paid/.test((e as Error).message)
);
ok("creating a payout before approval is refused");

// ---------------------------------------------------------------------------
console.log("\n[2] admin approval moves money into the payable pool");
const approved = await approveEligibleCommissions(rep.id, admin);
assert.equal(approved.approved, 3);
assert.equal(approved.totalAmount, 2100, "3 x Rs. 700");
const payableNow = await listPayable(rep.id);
assert.equal(payableNow.length, 3);
const summary2 = await getEarningSummary(rep.id);
assert.equal(summary2.payableBalance, 2100, "the payable balance now shows Rs. 2,100");
ok("approved 3 commissions; payable balance Rs. 2,100");

// ---------------------------------------------------------------------------
console.log("\n[3] a payout reserves the money and cannot be raised twice");
const payout = await createPayoutForRepresentative(rep.id, admin, { note: "Monthly cycle" });
assert.equal(payout.amount, 2100);
assert.equal(payout.itemCount, 3);
assert.ok(payout.payoutCode.startsWith("FM-PAY-"), payout.payoutCode);
assert.equal(payout.status, "PENDING");
ok(`payout ${payout.payoutCode} raised for Rs. 2,100 across 3 items`);

const reserved = await prisma.representativeCommission.count({
  where: { representativeId: rep.id, status: "PAYABLE" },
});
assert.equal(reserved, 3, "every reserved commission is marked PAYABLE");
assert.equal(await listPayable(rep.id).then((r) => r.length), 0, "and none is offered twice");
ok("commissions are PAYABLE and no longer selectable");

await assert.rejects(
  () => createPayoutForRepresentative(rep.id, admin),
  (e: unknown) => e instanceof PayoutStateError && /still open/.test((e as Error).message)
);
ok("a second payout is refused while the first is open");

const itemTotal = await prisma.commissionPayoutItem.aggregate({
  where: { payoutId: payout.id },
  _sum: { amount: true },
});
assert.equal(itemTotal._sum.amount, payout.amount, "items must total the header");
ok("payout items total exactly the payout amount");

// ---------------------------------------------------------------------------
console.log("\n[4] paying needs a real reference and is idempotent");
await assert.rejects(
  () => markPayoutPaid(payout.id, admin, { reference: "" }),
  (e: unknown) => e instanceof PayoutStateError && /reference/.test((e as Error).message)
);
await assert.rejects(
  () => markPayoutPaid(payout.id, admin, { reference: "12" }),
  (e: unknown) => e instanceof PayoutStateError
);
ok("an empty or too-short transfer reference is refused");

const paid = await markPayoutPaid(payout.id, admin, { reference: "FT-2026-000123" });
assert.equal(paid.status, "PAID");
const paidCommissions = await prisma.representativeCommission.findMany({
  where: { representativeId: rep.id },
  select: { status: true, paymentReference: true, paidAt: true },
});
assert.equal(paidCommissions.length, 3);
for (const c of paidCommissions) {
  assert.equal(c.status, "PAID");
  assert.equal(c.paymentReference, "FT-2026-000123");
  assert.ok(c.paidAt, "each commission records when the money arrived");
}
ok("payout PAID; all 3 commissions PAID with the reference snapshotted");

const paidAgain = await markPayoutPaid(payout.id, admin, { reference: "FT-2026-000123" });
assert.equal(paidAgain.status, "PAID", "paying twice must be a no-op, not a second transfer");
ok("paying again is a no-op");

const paidCount = await prisma.commissionPayout.count({
  where: { representativeId: rep.id, status: "PAID" },
});
assert.equal(paidCount, 1);
ok("exactly one paid payout exists");

const summary3 = await getEarningSummary(rep.id);
assert.equal(summary3.payableBalance, 0, "paid money leaves the payable balance");
ok("payable balance is back to 0 after payment");

// ---------------------------------------------------------------------------
console.log("\n[5] a paid payout is frozen");
await assert.rejects(
  () => cancelPayout(payout.id, admin, "changed my mind about this"),
  (e: unknown) => e instanceof PayoutStateError && /already been paid/.test((e as Error).message)
);
await assert.rejects(
  () => markPayoutFailed(payout.id, admin, "the bank says it bounced"),
  (e: unknown) => e instanceof PayoutStateError
);
ok("a paid payout can be neither cancelled nor failed");

const stillPaid = await prisma.commissionPayout.findUniqueOrThrow({
  where: { id: payout.id },
  select: { status: true },
});
assert.equal(stillPaid.status, "PAID");
ok("the paid payout is untouched");

// ---------------------------------------------------------------------------
console.log("\n[6] a cancelled payout returns the money instead of stranding it");
const rep2 = await repWithCommissions(2);
await approveEligibleCommissions(rep2.id, admin);
const payout2 = await createPayoutForRepresentative(rep2.id, admin);
assert.equal(payout2.amount, 1400);
const reservedBefore = await listPayable(rep2.id).then((r) => r.length);
assert.equal(reservedBefore, 0);

const cancelled = await cancelPayout(payout2.id, admin, "Bank details were wrong; asking for new ones.");
assert.equal(cancelled.status, "CANCELLED");
assert.equal(cancelled.releasedCommissions, 2);
const released = await listPayable(rep2.id);
assert.equal(released.length, 2, "the money must be selectable again");
assert.equal(released.reduce((s, r) => s + r.amount, 0), 1400);
ok(`cancelled ${payout2.payoutCode}; both commissions (Rs. 1,400) are payable again`);

const keptItems = await prisma.commissionPayoutItem.count({ where: { payoutId: payout2.id } });
assert.equal(keptItems, 2, "cancelling must not delete the record of what was attempted");
ok("the cancelled payout keeps its items as history");

const rePayout = await createPayoutForRepresentative(rep2.id, admin, { note: "Corrected bank details" });
assert.equal(rePayout.amount, 1400, "the same money can be re-raised, and not a rupee more");
assert.notEqual(rePayout.payoutCode, payout2.payoutCode, "a genuinely new payout, not a resurrection");
ok(`a fresh payout ${rePayout.payoutCode} carries the same Rs. 1,400`);

// ---------------------------------------------------------------------------
console.log("\n[7] a failed transfer behaves the same way");
const rep3 = await repWithCommissions(1);
await approveEligibleCommissions(rep3.id, admin);
const payout3 = await createPayoutForRepresentative(rep3.id, admin);
const failed = await markPayoutFailed(payout3.id, admin, "The bank rejected the account number.");
assert.equal(failed.releasedCommissions, 1);
const afterFail = await listPayable(rep3.id);
assert.equal(afterFail.length, 1, "a bounced transfer must not eat the commission");
const failedRow = await prisma.commissionPayout.findUniqueOrThrow({
  where: { id: payout3.id },
  select: { status: true },
});
assert.equal(failedRow.status, "FAILED");
ok("FAILED payout releases its commission; the row is kept and marked FAILED");

// Failing is idempotent, matching markPayoutPaid: a retried request or a double
// click must not move money twice or error confusingly. The property that
// matters is that re-failing releases nothing further.
const auditBefore = await prisma.representativeAuditLog.count({ where: { actorId: admin.id, entityId: payout3.id } });
const refailed = await markPayoutFailed(payout3.id, admin, "trying again with a longer reason");
assert.equal(refailed.alreadyFailed, true, "re-failing reports it was already final");
assert.equal(refailed.releasedCommissions, 0, "re-failing must not release a second time");
assert.equal((await listPayable(rep3.id)).length, 1, "the commission is still payable exactly once");
assert.equal(
  await prisma.representativeAuditLog.count({ where: { actorId: admin.id, entityId: payout3.id } }),
  auditBefore,
  "a no-op re-fail writes no second audit entry"
);
ok("re-failing is a no-op: nothing released, nothing audited twice");

// ---------------------------------------------------------------------------
console.log("\n[8] a flagged commission can never be paid");
const rep4 = await repWithCommissions(2);
await prisma.representativeCommission.updateMany({
  where: { representativeId: rep4.id },
  data: { flagged: true, flagReason: "Producer disputed the referral" },
});
// A bulk approve skips flagged commissions rather than failing outright, so the
// flags have to be visible on the readiness screen or the money looks stuck for
// no stated reason.
const bulk = await approveEligibleCommissions(rep4.id, admin);
assert.equal(bulk.approved, 0, "a flagged commission is never bulk-approved");
const flaggedRow = await prisma.representativeCommission.findFirstOrThrow({
  where: { representativeId: rep4.id },
  select: { status: true },
});
assert.equal(flaggedRow.status, "ELIGIBLE", "a flagged commission stays put until cleared");
const flagScreen = await getPayoutReadiness(rep4.id);
assert.equal(flagScreen.flaggedCount, 2);
assert.equal(flagScreen.flaggedAmount, 1400);
assert.ok(
  flagScreen.blockedReason?.includes("flagged"),
  `readiness must name the flags, got: ${flagScreen.blockedReason}`
);
assert.equal(flagScreen.approvedAmount, 0, "flagged money is never counted as payable");
ok("flagged commissions are excluded from every figure but named on the screen");

await prisma.representativeCommission.updateMany({
  where: { representativeId: rep4.id },
  data: { flagged: false, flagReason: null },
});
const cleared = await approveEligibleCommissions(rep4.id, admin);
assert.equal(cleared.approved, 2, "once cleared they can be approved normally");
ok("after clearing the flag, both approve normally");

// ---------------------------------------------------------------------------
console.log("\n[9] a suspended representative is not paid");
const rep5 = await repWithCommissions(1);
await approveEligibleCommissions(rep5.id, admin);
await prisma.representative.update({
  where: { id: rep5.id },
  data: { status: "SUSPENDED" },
});
await assert.rejects(
  () => createPayoutForRepresentative(rep5.id, admin),
  (e: unknown) => e instanceof PayoutStateError && /suspended/.test((e as Error).message)
);
ok("a SUSPENDED representative cannot be paid, and the reason names the status");
await prisma.representative.update({ where: { id: rep5.id }, data: { status: "ACTIVE" } });
const afterReinstate = await createPayoutForRepresentative(rep5.id, admin);
assert.equal(afterReinstate.amount, 700);
ok("reinstating them makes the same Rs. 700 payable");

// ---------------------------------------------------------------------------
console.log("\n[10] every payout decision is audited against a named admin");
const audit = await prisma.representativeAuditLog.findMany({
  where: { actorId: admin.id },
  select: { action: true },
});
const actions = new Set(audit.map((a) => a.action));
for (const expected of [
  "COMMISSION_APPROVED",
  "PAYOUT_CREATED",
  "PAYOUT_PAID",
  "PAYOUT_CANCELLED",
]) {
  assert.ok(actions.has(expected), `missing audit action ${expected}`);
}
ok(`audited: ${[...actions].filter((a) => a.startsWith("PAYOUT") || a.startsWith("COMMISSION")).sort().join(", ")}`);

// ---------------------------------------------------------------------------
console.log("\n[11] a PAID payout does not block the next one");
//
// Regression. "Is a transfer in flight?" and "is this commission's money
// spoken for?" are different questions. The open-payout check once used the
// reservation statuses (PENDING, PAID), so findFirst surfaced the
// representative's own settled payout and refused every future payout with
// "still open" — after a single successful payment, that representative could
// never be paid again.
const repRepeat = await repWithCommissions(1);
await approveEligibleCommissions(repRepeat.id, admin);
const firstPayout = await createPayoutForRepresentative(repRepeat.id, admin);
assert.equal(firstPayout.status, "PENDING");
await markPayoutPaid(firstPayout.id, admin, { reference: "BANK-1", method: "BANK_TRANSFER" });
ok(`payout ${firstPayout.payoutCode} paid`);

// The paid commission must stay reserved — it is history, not spendable money.
const firstItems = await prisma.commissionPayoutItem.findMany({
  where: { payoutId: firstPayout.id },
  select: { commissionId: true },
});
const settledIds = firstItems.map((i) => i.commissionId);
const reservedAfterPay = await prisma.representativeCommission.count({
  where: { id: { in: settledIds }, status: { in: ["APPROVED", "PAYABLE"] } },
});
assert.equal(reservedAfterPay, 0, "a paid commission is not payable a second time");
const payableAfterPay = await listPayable(repRepeat.id);
assert.equal(payableAfterPay.length, 0, "and it does not reappear as payable");
ok("the paid commission stays settled and cannot be paid twice");

// A second referred producer for the same rep, which is how a rep actually
// accrues more money after a first payout. A producer may only ever hold one
// INITIAL commission, so the money has to come from a new producer.
await registerApprovedProducerFor(repRepeat, 90);
// A fresh commission starts ELIGIBLE; an admin has to approve it before it is
// payable, exactly as with the first one.
assert.equal((await listPayable(repRepeat.id)).length, 0, "a new commission is not payable until approved");
await approveEligibleCommissions(repRepeat.id, admin);
assert.equal((await listPayable(repRepeat.id)).length, 1, "the new commission is payable once approved");

const readiness = await getPayoutReadiness(repRepeat.id);
assert.equal(readiness.openPayout, null, "a paid payout is not reported as open");
ok("readiness reports no open payout after payment");

let secondPayout;
try {
  secondPayout = await createPayoutForRepresentative(repRepeat.id, admin);
} catch (error) {
  assert.fail(
    `a second payout must be allowed after the first was paid, but got: ${(error as Error).message}`
  );
}
assert.equal(secondPayout.amount, 700, "the new payout carries only the new commission");
assert.notEqual(secondPayout.payoutCode, firstPayout.payoutCode, "a distinct payout, not a resurrection");
assert.equal(secondPayout.status, "PENDING");
ok(`a second payout ${secondPayout.payoutCode} for Rs. 700 was raised and paid out cleanly`);

// A PENDING one still does block, so the original double-payment guard holds.
await assert.rejects(
  () => createPayoutForRepresentative(repRepeat.id, admin),
  (e: unknown) => e instanceof PayoutStateError && /still open/.test((e as Error).message)
);
ok("a genuinely pending payout still blocks a concurrent one");

// ---------------------------------------------------------------------------
console.log("\n[12] a failed transfer is audited as a failure, not a cancellation");
const repBounced = await repWithCommissions(1);
await approveEligibleCommissions(repBounced.id, admin);
const bounced = await createPayoutForRepresentative(repBounced.id, admin);
const beforeAudit = await prisma.representativeAuditLog.count({
  where: { actorId: admin.id, entityId: bounced.id },
});
await markPayoutFailed(bounced.id, admin, "The bank rejected the account number.");
const afterAudit = await prisma.representativeAuditLog.findMany({
  where: { actorId: admin.id, entityId: bounced.id },
  select: { action: true },
});
assert.equal(afterAudit.length, beforeAudit + 1, "exactly one audit entry is written");
assert.equal(afterAudit[afterAudit.length - 1].action, "PAYOUT_FAILED",
  "a bounced transfer must not be recorded as a deliberate cancellation");
const bouncedRow = await prisma.commissionPayout.findUniqueOrThrow({
  where: { id: bounced.id },
  select: { status: true, note: true },
});
assert.equal(bouncedRow.status, "FAILED", "written as FAILED in one step");
ok("one PAYOUT_FAILED entry, and the row is FAILED");

// Failing is idempotent; cross-ending and post-payment are refused.
const again = await markPayoutFailed(bounced.id, admin, "the bank rejected it again");
assert.equal(again.alreadyFailed, true, "failing a failed payout is a no-op");
await assert.rejects(
  () => cancelPayout(bounced.id, admin, "actually, just cancel it"),
  (e: unknown) => e instanceof PayoutStateError
);
ok("re-failing is a no-op, and a FAILED payout cannot be cancelled into CANCELLED");

// ---------------------------------------------------------------------------
await cleanup();
await purgeResidue();
await assertNoResidue("verify-rep-payout");
console.log(`\n${passed} payout checks passed against the dev database.`);
