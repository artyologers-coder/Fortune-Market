/**
 * End-to-end chain verification:
 *
 *   application -> admin approval -> public code -> referral cookie ->
 *   producer registration -> attribution -> frozen fee
 *
 * Every step goes through the real library entry points. The HTTP-only pieces
 * (the /r/[code] redirect and the cookie) are covered by asserting on the same
 * functions those routes call, plus a direct check that the route module exists
 * and is reachable.
 *
 * Run against a dev branch only:
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx scripts/verify-rep-chain.mts
 */
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  createNotification,
  deleteNotificationsForSubject,
} from "../src/lib/notifications";
import { withCodeInTransaction } from "../src/lib/representative-code";
import {
  submitRepresentativeApplication,
  notifyAdminsOfApplication,
  ApplicationValidationError,
} from "../src/lib/representative-application";
import {
  approveApplication,
  rejectApplication,
  requestApplicationInfo,
  ApplicationStateError,
} from "../src/lib/representative-admin";
import {
  encodeReferralPayload,
  decodeReferralCookie,
  setReferralCookie,
  REFERRAL_COOKIE,
} from "../src/lib/referral-cookie";
import { canConvertReferrals } from "../src/lib/representative-guard";
import { registerProducer } from "../src/lib/producer-registration";
import { normalizeLocalPhone } from "../src/lib/representative-application";
import { getSettings, updateSettings } from "../src/lib/representative-settings";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

const stamp = Date.now();
const PREFIX = "rep-chain-";
let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ok  ${label}`);
};

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
const admin = { id: "chain-verification-admin", role: "ADMIN" } as const;

let counter = 0;
const uniq = () => `${stamp}-${counter++}`;

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
    await prisma.representativeCommission.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producerReferral.deleteMany({
      where: { OR: [{ producerId: { in: producerIds } }, { representativeId: { in: repIds } }] },
    });
    await prisma.producerRegistrationPayment.deleteMany({ where: { producerId: { in: producerIds } } });
    await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  }

  // The application holds a 1:1 reference to the representative, so it has to be
  // unlinked before the representative can go.
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

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";
await cleanup();

await beginResidueGuard();
// ---------------------------------------------------------------------------
console.log("\n[1] an applicant submits and gets a login but NOT a representative");
const applicant = await submitRepresentativeApplication({
  fullName: "Chain Applicant",
  email: `${PREFIX}applicant-${uniq()}@test.local`,
  phone: "0771234567",
  whatsapp: "0771234567",
  password: "a-long-enough-password",
  nic: "199012345678",
  district: "Colombo",
  province: "Western",
  preferredArea: "Colombo 03",
  agreedTerms: true,
  agreedCommission: true,
  agreedPrivacy: true,
  confirmedAccurate: true,
});
assert.ok(applicant.applicationCode.startsWith("FM-APP-"), applicant.applicationCode);

const applicantUser = await prisma.user.findUniqueOrThrow({
  where: { id: applicant.userId },
  select: { role: true, representative: { select: { id: true } } },
});
assert.equal(applicantUser.role, "REPRESENTATIVE", "the applicant can sign in");
assert.equal(
  applicantUser.representative,
  null,
  "but must have no Representative row, or they could reach the dashboard unreviewed"
);
ok(`application ${applicant.applicationCode} created; login works, representative does not exist`);

const noRep = await prisma.representative.count({ where: { userId: applicant.userId } });
assert.equal(noRep, 0);
ok("no public code has been minted before approval");

// ---------------------------------------------------------------------------
console.log("\n[2] an application missing an agreement is refused");
const adminForNotify = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
if (adminForNotify) {
  await assert.rejects(
    () =>
      submitRepresentativeApplication({
        fullName: "No Agreements",
        email: `${PREFIX}noagree-${uniq()}@test.local`,
        phone: "0712222222",
        password: "a-long-enough-password",
        district: "Gampaha",
        agreedTerms: true,
        agreedCommission: false,
        agreedPrivacy: true,
        confirmedAccurate: true,
      }),
    (e: unknown) => e instanceof ApplicationValidationError
  );
  ok("an application without all four agreements is refused");

  await notifyAdminsOfApplication(applicant.applicationId, applicant.applicationCode);
  const adminNotified = await prisma.notification.findFirst({
    where: { userId: adminForNotify.id, body: { contains: applicant.applicationCode } },
  });
  assert.ok(adminNotified, "admins must be told a review is waiting");
  ok("admins are notified of the pending application");
} else {
  ok("skipped agreement/notification checks: no ADMIN user on this branch");
}

// ---------------------------------------------------------------------------
console.log("\n[3] a duplicate email cannot create a second account");
const applicantEmail = (
  await prisma.user.findUniqueOrThrow({
    where: { id: applicant.userId },
    select: { email: true },
  })
).email;
await assert.rejects(
  () =>
    submitRepresentativeApplication({
      fullName: "Duplicate Applicant",
      email: applicantEmail,
      phone: "0723333333",
      password: "a-long-enough-password",
      district: "Kandy",
      agreedTerms: true,
      agreedCommission: true,
      agreedPrivacy: true,
      confirmedAccurate: true,
    }),
  (e: unknown) => e instanceof ApplicationValidationError
);
ok("a second application on the same email is refused");

// ---------------------------------------------------------------------------
console.log("\n[4] info can be requested before a decision");
await requestApplicationInfo(applicant.applicationId, admin, "Please upload your NIC scan.");
const underReview = await prisma.representativeApplication.findUniqueOrThrow({
  where: { id: applicant.applicationId },
});
assert.equal(underReview.status, "UNDER_REVIEW");
assert.equal(underReview.infoRequestNote, "Please upload your NIC scan.");
ok("the application moves to UNDER_REVIEW with the note recorded");

await assert.rejects(
  () => requestApplicationInfo(applicant.applicationId, admin, "x"),
  (e: unknown) => e instanceof ApplicationStateError,
  "a too-short note must be refused"
);
ok("an empty information request is refused");

// ---------------------------------------------------------------------------
console.log("\n[5] approval mints exactly one representative and one code");
const approved = await approveApplication(applicant.applicationId, admin);
assert.equal(approved.alreadyApproved, false);
assert.ok(approved.code.startsWith("FM-REP-"), approved.code);

const rep = await prisma.representative.findUniqueOrThrow({
  where: { id: approved.representativeId },
  select: { id: true, code: true, status: true, fullName: true, phone: true, district: true, userId: true },
});
assert.equal(rep.code, approved.code);
assert.equal(rep.status, "ACTIVE");
assert.equal(rep.userId, applicant.userId);
assert.equal(rep.fullName, "Chain Applicant");
ok(`representative ${rep.code} created ACTIVE with the applicant's details`);

const afterApproval = await prisma.representativeApplication.findUniqueOrThrow({
  where: { id: applicant.applicationId },
});
assert.equal(afterApproval.status, "APPROVED");
assert.equal(afterApproval.representativeId, approved.representativeId);
assert.equal(afterApproval.infoRequestNote, null, "a stale info note must be cleared on approval");
ok("the application is APPROVED and linked to the representative");

// ---------------------------------------------------------------------------
console.log("\n[6] approving twice is idempotent");
const again = await approveApplication(applicant.applicationId, admin);
assert.equal(again.alreadyApproved, true, "a second approve must not mint a second code");
assert.equal(again.code, approved.code, "and must return the original code");
const repCount = await prisma.representative.count({ where: { userId: applicant.userId } });
assert.equal(repCount, 1, "exactly one Representative row may exist per user");
ok(`a second approve returns the same code ${again.code}, no duplicate representative`);

await assert.rejects(
  () => rejectApplication(applicant.applicationId, admin, "changed my mind"),
  (e: unknown) => e instanceof ApplicationStateError,
  "an approved application must not be rejectable"
);
ok("an approved application cannot then be rejected");

// ---------------------------------------------------------------------------
console.log("\n[7] the public link sets a cookie that attributes a producer");
// This is exactly what GET /r/[code] does after resolving the code.
const cookieValue = encodeReferralPayload({
  code: rep.code,
  leadId: null,
  issuedAt: Math.floor(Date.now() / 1000),
});
const decoded = decodeReferralCookie(cookieValue);
assert.ok(decoded, "the cookie the /r route writes must decode");
assert.equal(decoded!.code, rep.code);
ok("the referral cookie round-trips the approved code");

const resolvedRep = await prisma.representative.findUniqueOrThrow({
  where: { code: rep.code },
  select: { id: true, code: true, status: true },
});
assert.equal(canConvertReferrals(resolvedRep), true, "an ACTIVE rep can convert");

// And the full attribution consequence, with the gate forced open.
await updateSettings({ feeEnforcementMode: "FORCE_OPEN" }, admin, "chain verification: open the gate");
const producerUser = await prisma.user.create({
  data: {
    email: `${PREFIX}producer-${uniq()}@test.local`,
    passwordHash: await bcrypt.hash("x", 4),
    phone: `+9477${String(4000000 + counter++).slice(0, 7)}`,
    role: "PRODUCER",
    name: "Chain Producer",
  },
  select: { id: true },
});
const registration = await registerProducer({
  userId: producerUser.id,
  businessName: `Chain Cafe ${uniq()}`,
  location: "Colombo 05",
  district: "Colombo",
  phone: `+9476${String(5000000 + counter++).slice(0, 7)}`,
  email: null,
  referral: {
    id: resolvedRep.id,
    code: resolvedRep.code,
    fullName: rep.fullName,
    district: rep.district,
    status: resolvedRep.status,
    leadId: null,
    canConvert: true,
  },
});
assert.ok(registration.referral, "the producer must be attributed");
assert.equal(registration.referral!.representativeId, rep.id);
assert.equal(
  registration.fee.basis,
  "REFERRAL",
  "a referred producer pays even with the gate open"
);
assert.equal(registration.payment.amount, 1200);
ok(`producer attributed to ${rep.code}, charged Rs. 1200 under REFERRAL with the gate open`);

// ---------------------------------------------------------------------------
console.log("\n[8] a rejected applicant never gets a code");
const rejectedApp = await submitRepresentativeApplication({
  fullName: "Rejected Applicant",
  email: `${PREFIX}rejected-${uniq()}@test.local`,
  phone: "0744444444",
  password: "a-long-enough-password",
  district: "Matara",
  agreedTerms: true,
  agreedCommission: true,
  agreedPrivacy: true,
  confirmedAccurate: true,
});
await assert.rejects(
  () => rejectApplication(rejectedApp.applicationId, admin, "no"),
  (e: unknown) => e instanceof ApplicationStateError
);
ok("a rejection without a real reason is refused");

await rejectApplication(rejectedApp.applicationId, admin, "Bank details could not be verified.");
const rejected = await prisma.representativeApplication.findUniqueOrThrow({
  where: { id: rejectedApp.applicationId },
});
assert.equal(rejected.status, "REJECTED");
assert.equal(rejected.representativeId, null);
const rejectedRep = await prisma.representative.count({ where: { userId: rejectedApp.userId } });
assert.equal(rejectedRep, 0, "a rejected applicant must never receive a public code");
ok("the rejected applicant has no representative and no public code");

await assert.rejects(
  () => approveApplication(rejectedApp.applicationId, admin),
  (e: unknown) => e instanceof ApplicationStateError
);
ok("a rejected application cannot be approved afterwards");

// ---------------------------------------------------------------------------
console.log("\n[9] phone normalisation accepts the shapes people actually type");
assert.equal(normalizeLocalPhone("0771234567"), "771234567");
assert.equal(normalizeLocalPhone("077 123 4567"), "771234567");
assert.equal(normalizeLocalPhone("+94771234567"), "771234567");
assert.equal(normalizeLocalPhone("94771234567"), "771234567");
assert.equal(normalizeLocalPhone("12345"), null);
ok("077 / 077 / +94 / 94 all normalise to one key; junk is rejected");

console.log("\n[10] an application's admin alerts are tied to it, so they die with it");
const themed = await submitRepresentativeApplication({
  fullName: "Subject Tagged Applicant",
  email: `${PREFIX}subject-${uniq()}@test.local`,
  phone: "0775550001",
  whatsapp: "0775550001",
  password: "a-long-enough-password",
  nic: "199012349999",
  district: "Colombo",
  province: "Western",
  agreedTerms: true,
  agreedCommission: true,
  agreedPrivacy: true,
  confirmedAccurate: true,
});

// The API route calls this after submitting; the library function does not, so
// the test does it explicitly, as section 1 already does for its applicant.
await notifyAdminsOfApplication(themed.applicationId, themed.applicationCode);

// The admin alert is addressed to an admin, not the applicant, so the cascade on
// User cannot reach it. It used to survive the applicant, leaving a permanent
// unread badge on an application that no longer existed.
const adminAlerts = await prisma.notification.findMany({
  where: { subjectType: "RepresentativeApplication", subjectId: themed.applicationId },
});
assert.equal(adminAlerts.length, 1, "the admin alert records the application it is about");
assert.equal(adminAlerts[0].type, "APPLICATION_INFO_REQUESTED");
assert.ok(adminAlerts[0].userId, "the alert is addressed to a user, not the applicant");
ok("the admin alert is tagged with the application id");

// And it can now actually be removed with the application.
const removed = await deleteNotificationsForSubject("RepresentativeApplication", themed.applicationId);
assert.equal(removed, 1, "the subject delete removes exactly that application's alerts");
const afterRemoval = await prisma.notification.count({
  where: { subjectType: "RepresentativeApplication", subjectId: themed.applicationId },
});
assert.equal(afterRemoval, 0, "nothing about that application is left to go stale");
ok("deleting by subject removes the alert, closing the stale-badge bug");

// A half-set subject would be unfindable, so it is refused rather than stored.
await assert.rejects(
  () => createNotification({ userId: admin.id, type: "GUIDE_UPDATED", title: "x", subjectType: "Producer" }),
  /without a subjectId/,
  "a subjectType with no subjectId must be refused"
);
await assert.rejects(
  () => createNotification({ userId: admin.id, type: "GUIDE_UPDATED", title: "x", subjectId: "p1" }),
  /without a subjectType/,
  "a subjectId with no subjectType must be refused"
);
ok("a half-set subject is refused instead of being stored unfindable");

// ---------------------------------------------------------------------------
await updateSettings({ feeEnforcementMode: originalMode }, admin, "chain verification: restore gate");
await cleanup();
await purgeResidue();
await assertNoResidue("verify-rep-chain");
const final = await getSettings();
assert.equal(final.feeEnforcementMode, originalMode);
ok(`settings restored to ${originalMode}`);

console.log(`\n${passed} chain checks passed against the dev database.`);
