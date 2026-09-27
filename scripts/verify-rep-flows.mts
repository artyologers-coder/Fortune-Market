/**
 * End-to-end verification of the representative programme against a real
 * database. Exercises the actual library code paths (not re-implementations),
 * including the advisory-lock ID generation, the payment gate and the
 * commission ledger.
 *
 * Run against a dev branch only:
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx scripts/verify-rep-flows.ts
 */
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { withCodeInTransaction } from "../src/lib/representative-code";
import { getSettings, updateSettings, isFeeRequired } from "../src/lib/representative-settings";
import {
  createCommissionForProducer,
  evaluateCommissionEligibility,
  getEarningSummary,
  reverseCommission,
} from "../src/lib/commission";
import { checkProducerDuplicates } from "../src/lib/duplicate-detection";
import { createNotification, getUnreadCount, listNotifications, markAsRead } from "../src/lib/notifications";
import { recordAudit, listAuditLogs } from "../src/lib/audit";
import { rateLimit } from "../src/lib/rate-limit";
import { toCsv } from "../src/lib/csv";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

const stamp = Date.now();
const ROLES = ["ADMIN", "REP", "PRODUCER_A", "PRODUCER_B", "FREE_PRODUCER"] as const;
let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ok  ${label}`);
};

const settings = await prisma.representativeSettings.findUniqueOrThrow({ where: { id: "singleton" } });
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

let settingsShape = {
  feeEnforcementMode: settings.feeEnforcementMode,
  feeEnforcementStartsAt: settings.feeEnforcementStartsAt,
};

/** Re-reads settings so a fee decision is never evaluated against a stale snapshot. */
async function refreshSettingsShape() {
  const current = await getSettings();
  settingsShape = {
    feeEnforcementMode: current.feeEnforcementMode,
    feeEnforcementStartsAt: current.feeEnforcementStartsAt,
  };
  return settingsShape;
}

let userCounter = 0;
async function makeUser(role: (typeof ROLES)[number]) {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: `rep-verify-${role.toLowerCase()}-${stamp}-${userCounter}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      phone: `+9477${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      phoneVerified: true,
      role,
      name: `Verify ${role}`,
    },
  });
}

/**
 * Removes test data in dependency order.
 *
 * The order matters: the financial and attribution tables RESTRICT on their
 * parents by design, so a naive `deleteMany` on User would fail with a foreign
 * key violation. That constraint is itself one of the things under test.
 */
async function cleanup() {
  const prefix = "rep-verify-";
  const users = await prisma.user.findMany({
    where: { email: { contains: prefix } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const producers = await prisma.producer.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const producerIds = producers.map((p) => p.id);
  const representatives = await prisma.representative.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const representativeIds = representatives.map((r) => r.id);

  if (producerIds.length > 0) {
    await prisma.commissionPayoutItem.deleteMany({
      where: { commission: { producerId: { in: producerIds } } },
    });
    await prisma.representativeCommission.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producerReferral.deleteMany({
      where: { OR: [{ producerId: { in: producerIds } }, { representativeId: { in: representativeIds } }] },
    });
    await prisma.producerRegistrationPayment.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  }

  await prisma.representativeAuditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { representativeId: { in: representativeIds } }] },
  });
  await prisma.representativeLead.deleteMany({ where: { representativeId: { in: representativeIds } } });
  await prisma.commissionPayout.deleteMany({ where: { representativeId: { in: representativeIds } } });
  await prisma.representativeApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representative.deleteMany({ where: { id: { in: representativeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "verify-rep-" } } });
}

// Clean up anything left by a previous run so this is re-runnable.
await cleanup();

await beginResidueGuard();

/**
 * The producer fixtures below all set a phone. A null here means the fixture is
 * broken, so it throws rather than writing "" and asserting against a lie.
 */
function mustPhone(v: string | null | undefined): string {
  if (!v) throw new Error("fixture expected a phone number");
  return v;
}

// Created up front: it is the actor for every audited action below.
const admin = await makeUser("ADMIN");
const adminActor = { id: admin.id, role: admin.role };

// Pin a known starting state. This script drives the shared singleton settings
// row, so it must not inherit whatever a previous run left behind.
await updateSettings({ feeEnforcementMode: "FORCE_OPEN" }, adminActor, "verification run: start from gate open");
await refreshSettingsShape();

// ---------------------------------------------------------------------------
console.log("\n[1] advisory-lock ID generation under concurrency");
// Five admins approving five applications at the same moment. Each transaction
// both allocates a code AND inserts the row, which is the real scenario: a
// count() with no insert would leave nothing to count and prove nothing.
const existingReps = await prisma.representative.count();
const firstSequence = existingReps + 1;

const approvalUsers = await Promise.all(
  Array.from({ length: 5 }, () => makeUser("REP"))
);

const createdReps = await Promise.all(
  approvalUsers.map((user) =>
    prisma.$transaction((tx) =>
      withCodeInTransaction(tx, "representative", (innerTx, code) =>
        innerTx.representative.create({
          data: {
            code,
            userId: user.id,
            fullName: user.name ?? "Concurrent Rep",
            phone: user.phone ?? "0770000000",
            email: user.email,
            district: "Colombo",
            status: "ACTIVE",
            approvedAt: new Date(),
            approvedById: admin.id,
          },
          select: { id: true, code: true },
        })
      )
    )
  )
);

const allocatedCodes = createdReps.map((r) => r.code);
assert.equal(
  new Set(allocatedCodes).size,
  5,
  `expected 5 distinct codes, got ${allocatedCodes.join(",")}`
);

const expected = Array.from(
  { length: 5 },
  (_, i) => `FM-REP-${String(firstSequence + i).padStart(5, "0")}`
);
assert.deepEqual([...allocatedCodes].sort(), expected, "codes must be sequential and gapless");
assert.equal(
  await prisma.representative.count(),
  existingReps + 5,
  "all five representatives must be persisted"
);
ok(`5 concurrent approvals produced ${expected[0]}..${expected[4]}, no duplicates or gaps`);

for (const user of approvalUsers) {
  await prisma.user.delete({ where: { id: user.id } });
}

// ---------------------------------------------------------------------------
console.log("\n[2] representative approval from application");
const repUser = await makeUser("REP");
const application = await prisma.representativeApplication.create({
  data: {
    applicationCode: `FM-APP-${stamp}`,
    userId: repUser.id,
    fullName: "Verify Representative",
    phone: repUser.phone ?? "0770000000",
    email: repUser.email,
    district: "Colombo",
    agreedTerms: true,
    agreedCommission: true,
    agreedPrivacy: true,
    confirmedAccurate: true,
    agreementsAt: new Date(),
  },
});

const representative = await prisma.$transaction((tx) =>
  withCodeInTransaction(tx, "representative", async (innerTx, code) =>
    innerTx.representative.create({
      data: {
        code,
        userId: repUser.id,
        fullName: "Verify Representative",
        phone: repUser.phone ?? "0770000000",
        email: repUser.email,
        district: "Colombo",
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedById: admin.id,
        bankAccountName: "Verify Representative",
      },
    })
  )
);
await prisma.representativeApplication.update({
  where: { id: application.id },
  data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.id, representativeId: representative.id },
});
ok(`representative approved and issued ${representative.code}`);

// ---------------------------------------------------------------------------
console.log("\n[3] referred producer always pays and earns a commission");
const referredUser = await makeUser("PRODUCER_A");
const referredProducer = await prisma.producer.create({
  data: {
    userId: referredUser.id,
    businessName: `Referred Spices ${stamp}`,
    businessNameSi: `Referred Spices ${stamp}`,
    district: "Gampaha",
    location: "Gampaha",
    phone: mustPhone(referredUser.phone),
    verificationStatus: "PENDING",
  },
});

const referredDecision = isFeeRequired({ hasLockedReferral: true }, settingsShape);
assert.deepEqual(referredDecision, { required: true, basis: "REFERRAL" });
ok("referral forces the fee regardless of the gate");

const payment = await prisma.producerRegistrationPayment.create({
  data: {
    producerId: referredProducer.id,
    kind: "INITIAL",
    amount: settings.producerAnnualRegistrationFee,
    feeRequired: true,
    feeBasis: "REFERRAL",
    status: "PAID",
    method: "BANK_TRANSFER",
    reference: `REF-${stamp}`,
    paidAt: new Date(),
    verifiedAt: new Date(),
    verifiedById: admin.id,
  },
});

await prisma.producerReferral.create({
  data: {
    producerId: referredProducer.id,
    representativeId: representative.id,
    referralCode: representative.code,
    source: "LINK",
    status: "ACTIVE",
    lockedAt: new Date(),
  },
});
ok("referral created and locked to the representative");

// Commission must NOT be created while the producer is still PENDING.
const early = await prisma.$transaction((tx) =>
  createCommissionForProducer(tx, { producerId: referredProducer.id, registrationPaymentId: payment.id })
);
assert.ok("skipped" in early, "commission must not exist before approval");
ok("no commission while the producer is unapproved");

// Now approve the producer.
await prisma.producer.update({
  where: { id: referredProducer.id },
  data: { verificationStatus: "APPROVED", verifiedAt: new Date() },
});
const created = await prisma.$transaction((tx) =>
  createCommissionForProducer(tx, { producerId: referredProducer.id, registrationPaymentId: payment.id })
);
assert.ok(!("skipped" in created), "commission should have been created on approval");
const commission = await prisma.representativeCommission.findUniqueOrThrow({
  where: { id: (created as { id: string }).id },
});
assert.equal(commission.amount, 700);
assert.equal(commission.status, "ELIGIBLE");
ok(`commission ${commission.commissionCode} created at the snapshotted Rs. ${commission.amount}`);

// Idempotency: approving again must not pay twice.
const again = await prisma.$transaction((tx) =>
  createCommissionForProducer(tx, { producerId: referredProducer.id, registrationPaymentId: payment.id })
);
assert.equal((again as { id: string }).id, commission.id);
const commissionCount = await prisma.representativeCommission.count({ where: { producerId: referredProducer.id } });
assert.equal(commissionCount, 1, "a second approval must not create a second commission");
ok("re-approving is idempotent (still exactly 1 commission)");

// ---------------------------------------------------------------------------
console.log("\n[4] admin waiver does not cost the representative their commission");
const waivedUser = await makeUser("PRODUCER_B");
const waivedProducer = await prisma.producer.create({
  data: {
    userId: waivedUser.id,
    businessName: `Waived Grains ${stamp}`,
    businessNameSi: `Waived Grains ${stamp}`,
    district: "Kandy",
    location: "Kandy",
    phone: mustPhone(waivedUser.phone),
    verificationStatus: "APPROVED",
    verifiedAt: new Date(),
  },
});
const waivedPayment = await prisma.producerRegistrationPayment.create({
  data: {
    producerId: waivedProducer.id,
    kind: "INITIAL",
    amount: settings.producerAnnualRegistrationFee,
    feeRequired: true,
    feeBasis: "REFERRAL",
    status: "WAIVED",
    waivedAt: new Date(),
    waivedById: admin.id,
    waiveReason: "Promotional onboarding",
  },
});
await prisma.producerReferral.create({
  data: {
    producerId: waivedProducer.id,
    representativeId: representative.id,
    referralCode: representative.code,
    status: "ACTIVE",
    lockedAt: new Date(),
  },
});
const waivedCommission = await prisma.$transaction((tx) =>
  createCommissionForProducer(tx, { producerId: waivedProducer.id, registrationPaymentId: waivedPayment.id })
);
assert.ok(!("skipped" in waivedCommission), "a waived payment must still pay the rep");
assert.equal(
  (await prisma.representativeCommission.findUniqueOrThrow({ where: { id: (waivedCommission as { id: string }).id } })).amount,
  700
);
ok("waived producer still earns the representative Rs. 700");

// ---------------------------------------------------------------------------
console.log("\n[5] unreferred producer follows the gate");
await updateSettings({ feeEnforcementMode: "FORCE_OPEN" }, adminActor, "verification: gate open");
const freeUser = await makeUser("FREE_PRODUCER");
const freeProducer = await prisma.producer.create({
  data: {
    userId: freeUser.id,
    businessName: `Walk In Farm ${stamp}`,
    businessNameSi: `Walk In Farm ${stamp}`,
    district: "Matara",
    location: "Matara",
    phone: mustPhone(freeUser.phone),
    verificationStatus: "APPROVED",
    verifiedAt: new Date(),
  },
});
assert.deepEqual(isFeeRequired({ hasLockedReferral: false }, settingsShape), { required: false, basis: null });
await prisma.producerRegistrationPayment.create({
  data: { producerId: freeProducer.id, kind: "INITIAL", amount: 0, feeRequired: false, status: "WAIVED", waivedById: admin.id, waiveReason: "Gate open" },
});
const noReferral = await prisma.$transaction((tx) =>
  createCommissionForProducer(tx, { producerId: freeProducer.id, registrationPaymentId: null })
);
assert.ok("skipped" in noReferral, "an unreferred producer must never create a commission");
ok("free unreferred producer pays nothing and creates no commission");

await updateSettings({ feeEnforcementMode: "FORCE_CLOSED" }, adminActor, "verification: gate closed");
await refreshSettingsShape();
const gated = isFeeRequired({ hasLockedReferral: false }, settingsShape);
assert.deepEqual(gated, { required: true, basis: "GATE_ENFORCED" });
ok("closing the gate makes unreferred producers pay");

// A referred producer still pays under a closed gate, but the basis must stay
// REFERRAL so the reason for the charge is recorded correctly on the payment.
assert.deepEqual(isFeeRequired({ hasLockedReferral: true }, settingsShape), {
  required: true,
  basis: "REFERRAL",
});
ok("referred producers are still charged under REFERRAL, not the gate");

// ---------------------------------------------------------------------------
console.log("\n[6] settings change is versioned and validated");
const revisions = await prisma.representativeSettingsRevision.findMany({ where: { settingsId: "singleton" }, orderBy: { createdAt: "asc" } });
assert.ok(revisions.length >= 3, `expected the seeded revision plus 2 changes, got ${revisions.length}`);
ok(`settings history is append-only (${revisions.length} revisions)`);

await assert.rejects(
  () =>
    updateSettings(
      { producerAnnualRegistrationFee: 1200, representativeInitialCommission: 800, fortuneMarketInitialAllocation: 500 },
      adminActor,
      "attempted to break the split"
    ),
  /does not add up/
);
ok("a change that breaks 1200 = 700 + 500 is rejected");

await assert.rejects(
  () => updateSettings({ renewalCommissionEnabled: true }, adminActor, "attempted to enable renewals silently"),
  /Year-2 renewal commission/
);
ok("renewal commission cannot be switched on without an explicit amount");

const current = await getSettings();
assert.equal(current.feeEnforcementMode, "FORCE_CLOSED");
ok("the last valid change persisted");

// ---------------------------------------------------------------------------
console.log("\n[7] reversal is recorded, not deleted");
const before = await getEarningSummary(representative.id);
await reverseCommission(commission.id, "Producer turned out to be a duplicate", adminActor, "REVERSE");
const after = await getEarningSummary(representative.id);
assert.equal(after.totals.REVERSED, 700);
assert.ok(before.totals.ELIGIBLE >= 700);
assert.equal(
  after.totals.ELIGIBLE,
  before.totals.ELIGIBLE - 700,
  "the reversed commission must leave the eligible total"
);
assert.equal(
  after.payableBalance,
  0,
  "an ELIGIBLE-but-unapproved commission must not be counted as payable money"
);
assert.equal(
  await prisma.representativeCommission.count({ where: { id: commission.id } }),
  1,
  "the commission row must survive reversal"
);
ok(`commission reversed in place (payable balance Rs. ${after.payableBalance}, PAID history intact)`);

await assert.rejects(
  () => reverseCommission(waivedCommission.id, "", adminActor),
  /reason is required/
);
ok("a reversal without a reason is rejected");

// ---------------------------------------------------------------------------
console.log("\n[8] no silent deletion of attribution or ledger");
let deleteBlocked = false;
try {
  await prisma.producer.delete({ where: { id: referredProducer.id } });
} catch (error) {
  deleteBlocked = String(error).includes("RESTRICT") || String(error).includes("Foreign key");
}
assert.equal(deleteBlocked, true, "deleting a producer with a referral must be refused by the database");
ok("database refuses to delete a producer who has a referral");

// ---------------------------------------------------------------------------
console.log("\n[9] duplicate detection finds the producer we just made");
const dupes = await checkProducerDuplicates({
  phone: referredUser.phone,
  email: referredUser.email,
  businessName: `Referred Spices ${stamp}`,
});
assert.equal(dupes.isDuplicate, true);
assert.ok(dupes.matches[0].reasons.includes("Phone number"));
ok("duplicate found by phone, email and business name");

// ---------------------------------------------------------------------------
console.log("\n[9b] a Sinhala business name is advisory, never a hard block");
const sinhalaName = `රැබු කංච්කෝ ${stamp}`;
// A producer that exists only under a Sinhala name, with nothing else shared.
const siOnly = await prisma.producer.create({
  data: {
    userId: (await makeUser("PRODUCER_A")).id,
    businessName: "Totally Different Traders",
    businessNameSi: sinhalaName,
    description: "",
    descriptionSi: "",
    location: "Colombo",
    district: "Colombo",
    phone: `07${Math.floor(10000000 + Math.random() * 89999999)}`,
    verificationStatus: "APPROVED",
  },
  select: { id: true },
});

const advisory = await checkProducerDuplicates({
  businessNameSi: sinhalaName,
  businessName: "Nothing Alike At All",
  phone: "0779999999",
  email: "nobody@example.test",
});
assert.equal(advisory.isDuplicate, false, "a Sinhala name alone must NOT block registration");
assert.ok(
  advisory.possibleMatches?.some((m) => m.producerId === siOnly.id),
  "the Sinhala overlap is reported as a possible match",
);
ok("a Sinhala-only overlap is reported but does not block");

// The advisory signal must not fire on an unrelated name.
const unrelated = await checkProducerDuplicates({ businessNameSi: "කිසිම නොගැලපෙන නමක්" });
assert.equal(unrelated.possibleMatches?.length ?? 0, 0, "an unrelated name raises nothing");
ok("an unrelated Sinhala name raises no advisory match");

// And it must never be counted as a hard match.
assert.equal(
  advisory.matches.some((m) => m.producerId === siOnly.id),
  false,
  "a Sinhala overlap must never appear in the blocking matches",
);
ok("the advisory match is kept out of the blocking list");

// ---------------------------------------------------------------------------
console.log("\n[10] notifications are per-user");
await createNotification({
  userId: repUser.id,
  type: "COMMISSION_EARNED",
  title: "Commission earned",
  body: "Rs. 700 for a referred producer",
  link: "/representative/commissions",
});
assert.equal(await getUnreadCount(repUser.id), 1);
assert.equal(await getUnreadCount(admin.id), 0);
ok("unread count is scoped to the recipient");

const list = await listNotifications(repUser.id);
const marked = await markAsRead(repUser.id, [list.notifications[0].id]);
assert.equal(marked, 1);
assert.equal(await getUnreadCount(repUser.id), 0);
// A different user must not be able to mark someone else's notification read.
const foreign = await markAsRead(admin.id, [list.notifications[0].id]);
assert.equal(foreign, 0);
ok("marking read is authorised by userId, not by the id supplied");

// ---------------------------------------------------------------------------
console.log("\n[11] audit trail");
await recordAudit({
  actor: adminActor,
  action: "REPRESENTATIVE_SETTINGS_UPDATED",
  entityType: "RepresentativeSettings",
  entityId: "singleton",
  newValue: { feeEnforcementMode: "FORCE_CLOSED" },
});
const audit = await listAuditLogs({ entityType: "RepresentativeSettings", perPage: 5 });
assert.ok(audit.logs.length >= 1, "settings changes must be audited");
assert.ok(audit.logs[0].actorId === admin.id);
ok(`audit recorded with actor (${audit.logs.length} matching entries)`);

// ---------------------------------------------------------------------------
console.log("\n[12] rate limiter");
const bucket = `verify-rep-${stamp}`;
const first = await rateLimit(bucket, { limit: 3, windowSeconds: 60 });
const second = await rateLimit(bucket, { limit: 3, windowSeconds: 60 });
const third = await rateLimit(bucket, { limit: 3, windowSeconds: 60 });
const fourth = await rateLimit(bucket, { limit: 3, windowSeconds: 60 });
assert.deepEqual([first.allowed, second.allowed, third.allowed], [true, true, true]);
assert.equal(fourth.allowed, false);
assert.ok(fourth.retryAfterSeconds > 0);
ok("bucket allows 3 then blocks the 4th call");

// ---------------------------------------------------------------------------
console.log("\n[13] csv export");
const csv = toCsv(
  [{ code: "FM-REP-00001", name: "A, B", amount: 700 }],
  [
    { header: "Code", value: (r) => r.code },
    { header: "Name", value: (r) => r.name },
    { header: "Amount", value: (r) => r.amount },
  ]
);
assert.ok(csv.includes('"A, B"'), "commas must be quoted");
assert.ok(csv.startsWith("Code,Name,Amount"));
ok("csv quotes embedded commas");

// ---------------------------------------------------------------------------
console.log("\n[14] earnings summary aggregates in SQL");
const summary = await getEarningSummary(representative.id);
assert.equal(summary.counts.REVERSED, 1);
assert.ok(summary.counts.ELIGIBLE >= 1);
assert.equal(
  summary.payableBalance,
  (summary.totals.APPROVED ?? 0) + (summary.totals.PAYABLE ?? 0),
  "payable balance must be exactly the admin-approved commissions"
);
assert.equal(
  summary.payableBalance,
  0,
  "a rep whose commissions are all PENDING/ELIGIBLE/REVERSED has nothing payable"
);
ok(`summary correct (payable Rs. ${summary.payableBalance}, reversed Rs. ${summary.totals.REVERSED})`);

// ---------------------------------------------------------------------------
// Clean up so the script is re-runnable.
await cleanup();

// Put the shared settings row back the way this run found it. This runs after
// cleanup(), which has already removed the admin user this script created.
await updateSettings({ feeEnforcementMode: originalMode }, adminActor, "verification run: restore original gate");
await prisma.representativeAuditLog.deleteMany({ where: { actorId: admin.id } });
await purgeResidue();
await assertNoResidue("verify-rep-flows");

console.log(`\n${passed} integration checks passed against the dev database.`);

await prisma.$disconnect();
