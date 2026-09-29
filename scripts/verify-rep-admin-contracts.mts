/**
 * Admin API contract check.
 *
 * The admin UI is four React components that read JSON. A field name that does
 * not exist does not fail a build or a typecheck — the component renders
 * `undefined` and an admin looking at a payment queue sees blanks. This script
 * stands up real admin-scoped data, mints a genuine NextAuth JWT, and calls the
 * live routes over HTTP, then asserts that every field the components read is
 * actually present.
 *
 * It also checks the two authorisation properties that are easy to get wrong
 * and impossible to see in the UI: a non-admin gets nothing, and the roster
 * never carries an unmasked account number.
 */
import "./db-target-guard.mts";

import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import type { ResolvedReferral } from "../src/lib/referral-cookie";
import { prisma } from "../src/lib/prisma";
import { approveApplication } from "../src/lib/representative-admin";
import { registerProducer } from "../src/lib/producer-registration";
import { approveProducerWithPayment } from "../src/lib/producer-approval";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3100";
const PREFIX = "rep-admin-contract-";
let passed = 0;
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

const adminActor = { id: "verify-rep-admin-contract", role: "ADMIN" } as const;

function ok(what: string) {
  passed++;
  console.log(`  ok ${what}`);
}
function section(name: string) {
  console.log(`\n[${name}]`);
}

const userIds: string[] = [];
const repIds: string[] = [];
const producerIds: string[] = [];

// The guide tests deliberately hide and un-hide real seeded sections, so snapshot
// their visibility up front. Without this, an abort part-way through leaves the
// public guide empty, or (if the delete guard is ever bypassed) a section gone.
const guideSnapshot = await prisma.representativeGuideSection.findMany({
  select: { id: true, slug: true, visible: true },
});
const seededSlugs = new Set(guideSnapshot.map((s) => s.slug));

async function restoreSeededGuide() {
  const current = await prisma.representativeGuideSection.findMany({
    select: { slug: true, visible: true },
  });
  for (const s of current) {
    const wasSeeded = seededSlugs.has(s.slug);
    const before = guideSnapshot.find((g) => g.slug === s.slug)?.visible;
    if (wasSeeded && before !== undefined && before !== s.visible) {
      await prisma.representativeGuideSection.update({
        where: { slug: s.slug },
        data: { visible: before },
      });
    }
  }
  // Anything seeded that a test deleted outright gets put back by the seed script;
  // report it loudly rather than silently leaving the guide short.
  const now = new Set(current.map((s) => s.slug));
  const lost = [...seededSlugs].filter((slug) => !now.has(slug));
  if (lost.length > 0) {
    throw new Error(
      `guide sections were deleted and need re-seeding (npx tsx prisma/seed.ts): ${lost.join(", ")}`,
    );
  }
}

async function cleanup() {
  const reps = await prisma.representative.findMany({
    where: { user: { email: { contains: PREFIX } } },
    select: { id: true },
  });
  repIds.push(...reps.map((r) => r.id).filter(Boolean));
  const producers = await prisma.producer.findMany({
    where: { user: { email: { contains: PREFIX } } },
    select: { id: true },
  });
  producerIds.push(...producers.map((p) => p.id).filter(Boolean));
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  userIds.push(...users.map((u) => u.id).filter(Boolean));

  await prisma.commissionPayoutItem.deleteMany({ where: { payout: { representativeId: { in: repIds } } } });
  await prisma.commissionPayout.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.representativeLead.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.producerReferral.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.representativeCommission.deleteMany({ where: { representativeId: { in: repIds } } });
  await prisma.producerRegistrationPayment.deleteMany({ where: { producer: { userId: { in: userIds } } } });
  await prisma.representativeGuideSection.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await restoreSeededGuide();
  await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  await prisma.representativeApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representativeAuditLog.deleteMany({ where: { actorId: adminActor.id } });
  await prisma.representative.deleteMany({ where: { id: { in: repIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

await cleanup();

await beginResidueGuard();
/** A real NextAuth session cookie for a user with the given role. */
async function sessionFor(user: { id: string; email: string; name: string; role: string }) {
  return encode({
    // The JWT shape is wider than these tests need; the rest defaults at runtime.
    token: {
      sub: user.id, id: user.id, email: user.email, name: user.name, role: user.role,
    } as unknown as JWT,
    secret: process.env.NEXTAUTH_SECRET!,
  });
}

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie: `next-auth.session-token=${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body as Record<string, unknown> };
}

try {
  // ------------------------------------------------------------- fixtures
  section("standing up an approved representative with an approved producer");

  const adminUser = await prisma.user.create({
    data: {
      email: `${PREFIX}admin-${uniq()}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      role: "ADMIN",
      name: "Contract Admin",
    },
    select: { id: true, email: true, name: true, role: true },
  });
  userIds.push(adminUser.id);
  const adminToken = await sessionFor(adminUser);

  const app = await prisma.representativeApplication.create({
    data: {
      applicationCode: `FM-APP-TEST-${uniq()}`,
      user: {
        create: {
          email: `${PREFIX}rep-${uniq()}@test.local`,
          passwordHash: await bcrypt.hash("x", 4),
          role: "REPRESENTATIVE",
          name: "Contract Rep",
        },
      },
      fullName: "Contract Rep",
      email: `${PREFIX}repr-${uniq()}@test.local`,
      phone: `077${Math.floor(1000000 + Math.random() * 8999999)}`,
      district: "Colombo",
      bankName: "Bank of Ceylon",
      bankAccountName: "Contract Rep",
      // Deliberately a recognisable number so the masking check can prove it
      // never reaches the roster payload.
      bankAccountNumber: "1234567890",
      agreedTerms: true,
      agreedCommission: true,
      agreedPrivacy: true,
      confirmedAccurate: true,
      agreementsAt: new Date(),
      status: "UNDER_REVIEW",
    },
    select: { id: true },
  });
  const approved = await approveApplication(app.id, adminActor);
  const rep = await prisma.representative.findUniqueOrThrow({
    where: { id: approved.representativeId },
    select: { id: true, code: true, userId: true },
  });
  repIds.push(rep.id);

  const producerUser = await prisma.user.create({
    data: {
      email: `${PREFIX}prod-${uniq()}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      role: "PRODUCER",
      name: "Contract Producer",
    },
    select: { id: true },
  });
  userIds.push(producerUser.id);
  const registration = await registerProducer({
    userId: producerUser.id,
    businessName: `Contract Shop ${uniq()}`,
    businessNameSi: "කොන්ට්‍රාක්ට්",
    description: "test",
    descriptionSi: "පරීක්ෂණ",
    location: "Colombo",
    district: "Colombo",
    phone: `077${Math.floor(1000000 + Math.random() * 8999999)}`,
    email: `${PREFIX}prode-${uniq()}@test.local`,
    referral: { code: rep.code } as ResolvedReferral,
  });
  assert.ok(registration.producer?.id, "registerProducer must return producer.id");
  assert.ok(registration.payment?.id, "registerProducer must return payment.id");
  const producerId = registration.producer.id;
  const paymentId = registration.payment.id;
  producerIds.push(producerId);
  ok(`representative ${rep.code} and a referred producer exist`);

  // -------------------------------------------------- non-admin is refused
  section("a non-admin gets nothing from the admin routes");
  const repUser = await prisma.user.findUniqueOrThrow({
    where: { id: rep.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  assert.equal(repUser.role, "REPRESENTATIVE", "the fixture really is a representative");
  const repToken = await sessionFor(repUser);
  for (const path of [
    "/api/admin/representatives",
    "/api/admin/payouts",
    "/api/admin/representative-applications?status=PENDING,UNDER_REVIEW",
    "/api/admin/producer-registrations/queue?status=PENDING,UNDER_REVIEW",
  ]) {
    const r = await api(repToken, path);
    assert.equal(r.status, 401, `${path} must refuse a non-admin, got ${r.status}`);
  }
  ok("all four admin routes return 401 to a representative session");

  // ---------------------------------------------------- roster contract
  section("the roster returns every field the Representatives tab reads");
  const roster = await api(adminToken, `/api/admin/representatives?q=${encodeURIComponent(rep.code)}`);
  assert.equal(roster.status, 200, `roster returned ${roster.status}`);
  const rosterList = (roster.body as { representatives: Record<string, unknown>[] }).representatives;
  const row = rosterList.find((r) => r.id === rep.id);
  assert.ok(row, "the new representative is in the roster");

  for (const field of [
    "id", "code", "fullName", "email", "phone", "district", "status", "statusReason",
    "bankName", "bankAccountName", "bankAccountNumber", "bankBranch",
    "joinedAt", "approvedAt", "counts", "unpaidAmount",
  ]) {
    assert.ok(field in (row as object), `roster row is missing "${field}"`);
  }
  for (const sub of ["leads", "commissions", "referrals", "payouts"]) {
    assert.ok(sub in (row as { counts: object }).counts, `counts is missing "${sub}"`);
  }
  ok("every field and count the table renders is present");

  section("the roster masks the account number");
  const raw = String(row!.bankAccountNumber);
  assert.equal(raw, "****7890", `expected the last four digits only, got "${raw}"`);
  assert.ok(!JSON.stringify(roster.body).includes("1234567890"), "the full number appears nowhere in the roster payload");
  ok(`shown as ${raw}, and the full number is absent from the whole response`);

  // ------------------------------------------------- application queue contract
  section("the application queue returns what the Applications tab reads");
  const apps = await api(
    adminToken,
    "/api/admin/representative-applications?status=PENDING,UNDER_REVIEW"
  );
  assert.equal(apps.status, 200);
  const appList = (apps.body as { applications: Record<string, unknown>[] }).applications;
  assert.ok(Array.isArray(appList), "applications is an array");
  // This representative is approved, so their application is no longer pending;
  // the queue should therefore be empty but well-formed.
  for (const a of appList) {
    for (const field of [
      "id", "applicationCode", "status", "fullName", "email", "phone", "whatsapp",
      "district", "province", "preferredArea", "experience", "occupation",
      "agreedTerms", "agreedCommission", "agreedPrivacy", "confirmedAccurate",
      "agreementsAt", "reviewNotes", "infoRequestNote", "infoRequestedAt",
      "reviewedAt", "createdAt", "representativeId", "representative",
    ]) {
      assert.ok(field in a, `application row is missing "${field}"`);
    }
    assert.ok(!("bankAccountNumber" in a), "the queue must not carry a bank account number");
  }
  ok("every field the queue renders is present, and no bank account number is included");

  // ------------------------------------------------------ payment queue contract
  section("the payment queue returns what the Payments tab reads");
  const payments = await api(
    adminToken,
    "/api/admin/producer-registrations/queue?status=PENDING,UNDER_REVIEW,PAID,WAIVED"
  );
  assert.equal(payments.status, 200);
  const payList = (payments.body as { payments: Record<string, unknown>[] }).payments;
  const payment = payList.find((p) => (p.producer as { id: string }).id === producerId);
  assert.ok(payment, "the referred producer's payment is in the queue");

  for (const field of [
    "id", "kind", "amount", "currency", "status", "method", "feeRequired", "feeBasis",
    "reference", "notes", "paidAt", "waivedAt", "waiveReason", "verifiedAt", "createdAt",
    "producer", "commissions",
  ]) {
    assert.ok(field in payment!, `payment row is missing "${field}"`);
  }
  const p = payment!.producer as Record<string, unknown>;
  for (const field of [
    "id", "businessName", "location", "district", "phone", "businessRegistrationNo",
    "verificationStatus", "user", "referral",
  ]) {
    assert.ok(field in p, `payment.producer is missing "${field}"`);
  }
  assert.ok("id" in (p.user as object), "payment.producer.user is resolved, not a raw id");
  const ref = p.referral as { representative: { code: string } | null };
  assert.equal(ref.representative?.code, rep.code, "the referring representative is resolved");
  ok("every field the gate reads is present, with user and representative resolved");

  // ------------------------------------------- approve, then readiness contract
  section("a payment cannot be approved before it is verified");
  const premature = await api(
    adminToken,
    `/api/admin/producer-registrations/${paymentId}?action=approve`,
    { method: "POST", body: JSON.stringify({ notes: "should not work" }) }
  );
  assert.equal(premature.status, 409, `approving an unverified payment must be refused, got ${premature.status}`);
  ok("the gate refuses approval while the payment is still PENDING");

  section("verifying, then approving, unlocks a commission the payout tab can act on");
  const verify = await api(
    adminToken,
    `/api/admin/producer-registrations/${paymentId}?action=verify`,
    { method: "POST", body: JSON.stringify({ reference: "BANK-REF-0001" }) }
  );
  assert.equal(verify.status, 200, `verify: ${JSON.stringify(verify.body)}`);
  // The verify action answers with only { id, status, verifiedAt }, so the
  // reference is checked where it actually matters: persisted, and visible to
  // the tab on its next reload.
  const verifiedPayment = (verify.body as { payment: { id: string; status: string } }).payment;
  assert.equal(verifiedPayment.status, "PAID", "verification settles the payment as PAID");
  const stored = await prisma.producerRegistrationPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { reference: true, verifiedAt: true },
  });
  assert.equal(stored.reference, "BANK-REF-0001", "the bank reference is persisted");
  assert.ok(stored.verifiedAt, "verifiedAt is stamped");
  const reloaded = await api(
    adminToken,
    "/api/admin/producer-registrations/queue?status=PENDING,UNDER_REVIEW,PAID,WAIVED"
  );
  const reloadedPayment = (reloaded.body as { payments: Record<string, unknown>[] }).payments
    .find((x) => x.id === paymentId) as { reference: string; status: string } | undefined;
  assert.ok(reloadedPayment, "the verified payment stays in the queue");
  assert.equal(reloadedPayment.status, "PAID");
  assert.equal(reloadedPayment.reference, "BANK-REF-0001", "the tab sees the reference after reload");
  ok("payment verified, and the reference is persisted and returned to the tab");

  const approve = await api(
    adminToken,
    `/api/admin/producer-registrations/${paymentId}?action=approve`,
    { method: "POST", body: JSON.stringify({ notes: "contract check" }) }
  );
  assert.equal(approve.status, 200, `approve returned ${approve.status}: ${JSON.stringify(approve.body)}`);

  const commission = await prisma.representativeCommission.findFirstOrThrow({
    where: { representativeId: rep.id },
    select: { id: true, amount: true, status: true },
  });
  assert.equal(commission.status, "ELIGIBLE", "a new commission starts as ELIGIBLE");
  ok("commission created and eligible");

  const ready = await api(adminToken, `/api/admin/payouts?representativeId=${rep.id}`);
  assert.equal(ready.status, 200);
  const r = ready.body as Record<string, unknown>;
  for (const field of [
    "representative", "summary", "eligibleCount", "flaggedCommissions", "flaggedCount",
    "flaggedAmount", "approvedCount", "approvedAmount", "openPayout", "recentPayouts",
    "blockedReason",
  ]) {
    assert.ok(field in r, `readiness is missing "${field}"`);
  }
  assert.equal(r.eligibleCount, 1, "one eligible commission is counted");
  assert.ok(typeof r.approvedAmount === "number" && r.approvedAmount === 0, "nothing is approved yet");
  assert.ok(typeof r.blockedReason === "string", "a reason is given while nothing is payable");
  ok("readiness carries every field the payout tab reads");

  section("readiness is the one place the full account number is exposed");
  const readyRep = r.representative as { bankAccountNumber: string };
  assert.equal(readyRep.bankAccountNumber, "1234567890", "the transfer screen shows the real number");
  ok("the full number is available for the transfer, unlike the roster");

  // ------------------------------------------------------ approve-all + create
  section("approving commissions and creating a payout works over HTTP");
  const approveAll = await api(
    adminToken,
    "/api/admin/payouts?action=approve-all",
    { method: "POST", body: JSON.stringify({ representativeId: rep.id }) }
  );
  assert.equal(approveAll.status, 200, `approve-all: ${JSON.stringify(approveAll.body)}`);

  const create = await api(
    adminToken,
    "/api/admin/payouts?action=create",
    { method: "POST", body: JSON.stringify({ representativeId: rep.id, method: "BANK_TRANSFER" }) }
  );
  assert.equal(create.status, 200, `create: ${JSON.stringify(create.body)}`);
  const payout = (create.body as { payout: { id: string; amount: number; status: string } }).payout;
  assert.equal(payout.amount, commission.amount, "the payout total is the commission total");
  assert.equal(payout.status, "PENDING", "a new payout is pending");
  ok(`payout ${payout.amount} created and pending`);

  const all = await api(adminToken, "/api/admin/payouts");
  assert.equal(all.status, 200);
  const list = (all.body as { payouts: Record<string, unknown>[] }).payouts;
  const listed = list.find((x) => x.id === payout.id);
  assert.ok(listed, "the payout appears in the list the tab renders");
  for (const field of [
    "id", "payoutCode", "amount", "currency", "status", "method", "reference",
    "note", "paidAt", "createdAt", "representative", "items",
  ]) {
    assert.ok(field in listed!, `payout row is missing "${field}"`);
  }
  const listedRep = listed!.representative as Record<string, unknown>;
  for (const field of ["id", "code", "fullName", "status", "bankAccountName"]) {
    assert.ok(field in listedRep, `payout.representative is missing "${field}"`);
  }
  ok("the payout list carries the representative and items the tab renders");

  // ------------------------------------------------------ settings contract
  section("settings are readable and only change with a reason");
  const readSettings = await api(adminToken, "/api/admin/representative-settings");
  assert.equal(readSettings.status, 200);
  const before = (readSettings.body as { settings: Record<string, unknown> }).settings;
  for (const field of [
    "producerAnnualRegistrationFee", "representativeInitialCommission",
    "fortuneMarketInitialAllocation", "renewalCommissionEnabled", "renewalCommissionAmount",
    "feeEnforcementMode", "initialProducerTarget", "currency", "updatedAt",
  ]) {
    assert.ok(field in before, `settings response is missing "${field}"`);
  }
  assert.ok(Array.isArray((readSettings.body as { modes: string[] }).modes), "the gate modes are offered");
  ok("every field the settings form reads is present");

  const originalFee = before.producerAnnualRegistrationFee as number;
  const originalCommission = before.representativeInitialCommission as number;
  const originalAllocation = before.fortuneMarketInitialAllocation as number;

  // No reason: refused. Every settings change is written to the audit trail with
  // a before and after, and the reason cannot be reconstructed later.
  const noReason = await api(adminToken, "/api/admin/representative-settings", {
    method: "PATCH",
    body: JSON.stringify({ representativeInitialCommission: 750 }),
  });
  assert.equal(noReason.status, 400, "a change without a reason must be refused");
  ok("a change with no reason is refused");

  // A split that does not add up must never persist.
  const badSplit = await api(adminToken, "/api/admin/representative-settings", {
    method: "PATCH",
    body: JSON.stringify({ reason: "contract check", representativeInitialCommission: 999 }),
  });
  assert.equal(badSplit.status, 400, "a split that does not add up must be refused");
  const afterBad = await prisma.representativeSettings.findFirstOrThrow({
    select: { representativeInitialCommission: true },
  });
  assert.equal(afterBad.representativeInitialCommission, originalCommission, "the bad split did not persist");
  ok("a split that does not add up is refused and nothing is written");

  // A valid change goes through and is recorded.
  const valid = await api(adminToken, "/api/admin/representative-settings", {
    method: "PATCH",
    body: JSON.stringify({
      reason: "contract check: restore after a no-op cycle",
      representativeInitialCommission: originalCommission,
    }),
  });
  assert.equal(valid.status, 200, `a valid change failed: ${JSON.stringify(valid.body)}`);
  const revision = await prisma.representativeSettingsRevision.findFirst({
    orderBy: { createdAt: "desc" },
    select: { reason: true },
  });
  assert.ok(revision?.reason?.includes("contract check"), "the change is recorded with its reason");
  ok("a valid change saves and is recorded with a reason");

  // Non-admins cannot touch money settings.
  const repSettings = await api(repToken, "/api/admin/representative-settings");
  assert.equal(repSettings.status, 401, "a representative must not read settings");
  const repWrite = await api(repToken, "/api/admin/representative-settings", {
    method: "PATCH",
    body: JSON.stringify({ reason: "not allowed", representativeInitialCommission: 1 }),
  });
  assert.equal(repWrite.status, 401);
  ok("a representative can neither read nor change settings");

  // The gate is refused in production regardless of who asks.
  const currentMode = (await prisma.representativeSettings.findFirstOrThrow({
    select: { feeEnforcementMode: true },
  })).feeEnforcementMode;
  const altMode = currentMode === "FORCE_OPEN" ? "FORCE_CLOSED" : "FORCE_OPEN";
  const gateAttempt = await api(adminToken, "/api/admin/representative-settings", {
    method: "PATCH",
    body: JSON.stringify({ reason: "contract check", feeEnforcementMode: altMode }),
  });
  assert.equal(gateAttempt.status, 409, "the gate must not be changeable over the API in production");
  const afterGate = await prisma.representativeSettings.findFirstOrThrow({
    select: { feeEnforcementMode: true },
  });
  assert.equal(afterGate.feeEnforcementMode, currentMode, "the gate is untouched");
  ok(`the fee gate is refused in production and stays ${currentMode}`);

  // ------------------------------------------------------------ CSV export
  section("the CSV export carries the roster and no account numbers");
  const csvRes = await fetch(`${BASE}/api/admin/representatives/export`, {
    headers: { cookie: `next-auth.session-token=${adminToken}` },
  });
  assert.equal(csvRes.status, 200, `export returned ${csvRes.status}`);
  assert.ok(
    (csvRes.headers.get("content-type") ?? "").includes("text/csv"),
    "the export must be a CSV"
  );
  assert.ok(
    (csvRes.headers.get("content-disposition") ?? "").includes("attachment"),
    "the export must download rather than render"
  );
  const csv = await csvRes.text();
  assert.ok(csv.includes(rep.code), "the representative is in the export");
  assert.ok(csv.includes("Code"), "the header row is present");
  assert.ok(csv.includes("Unpaid amount"), "money columns are labelled");
  // The single most important assertion in this file: a roster export is the
  // easiest way to leak a full set of bank details.
  assert.ok(!csv.includes("1234567890"), "a full account number must never appear in the export");
  assert.ok(!/bankAccountNumber/i.test(csv), "the export has no account number column at all");
  ok("the export is a CSV download with no bank account number anywhere");

  const repCsv = await fetch(`${BASE}/api/admin/representatives/export`, {
    headers: { cookie: `next-auth.session-token=${repToken}` },
  });
  assert.equal(repCsv.status, 401, "a representative must not export the roster");
  ok("a representative cannot export the roster");

  // ------------------------------------------------------- notifications
  section("notifications are the signed-in user's own, and only");
  const producerUserId = await prisma.user.findFirstOrThrow({
    where: { id: { in: userIds }, role: "PRODUCER" },
    select: { id: true },
  });

  // Earlier sections legitimately notified this representative (approval, payout),
  // so the assertion is on the delta, not on an absolute count.
  const unreadBaseline = await prisma.notification.count({
    where: { userId: rep.userId, readAt: null },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: rep.userId,
        type: "COMMISSION_PAID",
        title: "Rep notification A",
        link: "/representative/earnings",
      },
      {
        userId: rep.userId,
        type: "COMMISSION_APPROVED",
        title: "Rep notification B",
        link: "/representative/earnings",
      },
      {
        userId: producerUserId.id,
        type: "PAYMENT_CONFIRMED",
        title: "Producer notification",
        link: "/producer/dashboard",
      },
    ],
  });

  const mine = await api(repToken, "/api/notifications");
  assert.equal(mine.status, 200);
  const mineBody = mine.body as { notifications: { title: string; id: string }[]; unread: number };
  assert.equal(
    mineBody.unread,
    unreadBaseline + 2,
    "the badge counts the two new notifications on top of what was already there"
  );
  // Earlier sections also notified this rep, so presence of my two is checked
  // directly and the real safety property is that nobody else's row appears.
  const mineTitles = mineBody.notifications.map((n) => n.title);
  assert.ok(mineTitles.includes("Rep notification A"), "the representative sees their own new notification");
  assert.ok(mineTitles.includes("Rep notification B"), "and the second one");
  assert.ok(!mineTitles.includes("Producer notification"), "no cross-user leak");
  ok("a user sees only their own notifications, with an unread count");

  // Marking read must be scoped: passing somebody else's id changes nothing.
  const otherNotification = await prisma.notification.findFirstOrThrow({
    where: { userId: producerUserId.id },
    select: { id: true },
  });
  const steal = await api(repToken, "/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ ids: [otherNotification.id] }),
  });
  assert.equal(steal.status, 200);
  const stillUnread = await prisma.notification.findUniqueOrThrow({
    where: { id: otherNotification.id },
    select: { readAt: true },
  });
  assert.equal(stillUnread.readAt, null, "one user cannot mark another's notification read");
  ok("marking read is scoped to the session user");

  const target = mineBody.notifications[0].id;
  const markOne = await api(repToken, "/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ ids: [target] }),
  });
  assert.equal(markOne.status, 200);
  assert.equal((markOne.body as { updated: number }).updated, 1, "exactly one is marked read");

  const markAll = await api(repToken, "/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ all: true }),
  });
  assert.equal(markAll.status, 200);
  const afterAll = await api(repToken, "/api/notifications");
  assert.equal((afterAll.body as { unread: number }).unread, 0, "the badge is clear after mark-all");
  ok("mark one and mark all both work and clear the badge");

  const anon = await fetch(`${BASE}/api/notifications`);
  assert.equal(anon.status, 401, "an anonymous caller gets nothing");
  ok("an anonymous caller is refused");

  // ------------------------------------------------------------- guide CRUD
  section("the guide is editable by an admin, public, and audited");
  const gAdmin = await api(adminToken, "/api/admin/representative-guide");
  assert.equal(gAdmin.status, 200, "an admin can read the guide");
  const seeded = (gAdmin.body as { sections: { slug: string }[] }).sections;
  assert.ok(seeded.length >= 6, "the seeded guide sections are all there");
  assert.ok(seeded.some((s) => s.slug === "commission-rules"), "the commission rules are present");

  // A representative must not be able to rewrite the programme's own terms.
  const gRep = await api(repToken, "/api/admin/representative-guide");
  assert.equal(gRep.status, 401, "a representative must not reach the guide editor");
  const gRepWrite = await api(repToken, "/api/admin/representative-guide", {
    method: "POST",
    body: JSON.stringify({ slug: `${PREFIX}sneaky`, title: "x", body: "y", sortOrder: 99 }),
  });
  assert.equal(gRepWrite.status, 401, "a representative must not create a section");
  ok("a representative can neither read nor write the guide");

  // Hidden drafts must not reach the public.
  const createdHidden = await api(adminToken, "/api/admin/representative-guide", {
    method: "POST",
    body: JSON.stringify({
      slug: `${PREFIX}hidden-draft`,
      title: "Hidden draft",
      body: "This must never be public.",
      sortOrder: 900,
      visible: false,
    }),
  });
  assert.equal(createdHidden.status, 201, `create failed: ${JSON.stringify(createdHidden.body)}`);

  const publicGuide = await fetch(`${BASE}/api/representative/guide`);
  assert.equal(publicGuide.status, 200, "the guide is public");
  const publicText = await publicGuide.text();
  assert.ok(!publicText.includes("This must never be public."), "a hidden section must not be public");
  ok("hidden sections are excluded from the public guide");

  // The guide is public, so an anonymous caller gets it.
  const anonGuide = await fetch(`${BASE}/api/representative/guide`);
  assert.equal(anonGuide.status, 200, "an anonymous visitor can read the guide");
  ok("the public guide is readable without signing in");

  // Bad input is refused rather than stored.
  const badSlug = await api(adminToken, "/api/admin/representative-guide", {
    method: "POST",
    body: JSON.stringify({ slug: "Not A Slug!", title: "x", body: "y", sortOrder: 1 }),
  });
  assert.equal(badSlug.status, 400, "a malformed slug must be refused");

  const emptyBody = await api(adminToken, "/api/admin/representative-guide", {
    method: "POST",
    body: JSON.stringify({ slug: `${PREFIX}empty`, title: "x", body: "   ", sortOrder: 1 }),
  });
  assert.equal(emptyBody.status, 400, "a blank body must be refused");

  const dupSlug = await api(adminToken, "/api/admin/representative-guide", {
    method: "POST",
    body: JSON.stringify({ slug: "commission-rules", title: "x", body: "y", sortOrder: 1 }),
  });
  assert.equal(dupSlug.status, 400, "a duplicate slug must be refused");
  ok("malformed slugs, blank bodies and duplicate slugs are all refused");

  // Editing a real section is audited, and hiding it is not the same as deleting it.
  const faqSection = (await prisma.representativeGuideSection.findFirstOrThrow({
    where: { slug: "faq" },
    select: { id: true, title: true },
  }));
  const hideIt = await api(adminToken, `/api/admin/representative-guide/${faqSection.id}`, {
    method: "PATCH",
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(hideIt.status, 200);
  const stillThere = await prisma.representativeGuideSection.findUnique({
    where: { id: faqSection.id },
    select: { visible: true },
  });
  assert.equal(stillThere?.visible, false, "the section is hidden");
  const audit = await prisma.representativeAuditLog.findFirst({
    where: { action: "GUIDE_SECTION_UPDATED", entityId: faqSection.id },
    orderBy: { createdAt: "desc" },
    select: { previousValue: true, newValue: true },
  });
  assert.ok(audit, "a guide change is audited");
  assert.ok(String(audit!.previousValue).includes("true"), "the audit records the previous visibility");
  assert.ok(String(audit!.newValue).includes("false"), "and the new one");
  ok("a guide edit is applied and audited with before and after values");

  // Put it back, then prove the last-visible-section guard.
  await api(adminToken, `/api/admin/representative-guide/${faqSection.id}`, {
    method: "PATCH",
    body: JSON.stringify({ visible: true }),
  });
  const allSections = await prisma.representativeGuideSection.findMany({
    select: { id: true, visible: true },
  });
  // Hide every section *except* the one we then try to delete. Hiding the target
  // too would leave nothing visible, and deleting a hidden section is allowed.
  // faqSection is the one just restored to visible, so it is a deterministic choice.
  const lastOne = { id: faqSection.id };
  for (const s of allSections) {
    if (s.visible && s.id !== lastOne.id) {
      await api(adminToken, `/api/admin/representative-guide/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visible: false }),
      });
    }
  }
  const stillVisible = await prisma.representativeGuideSection.findUnique({
    where: { id: lastOne.id },
    select: { visible: true },
  });
  assert.equal(stillVisible?.visible, true, "the target is the one remaining visible section");
  const deleteLast = await api(adminToken, `/api/admin/representative-guide/${lastOne.id}`, {
    method: "DELETE",
  });
  assert.equal(deleteLast.status, 400, "the last visible section must not be deletable");
  const guideIntact = await prisma.representativeGuideSection.count();
  assert.ok(guideIntact > 0, "no section was lost");
  for (const s of allSections) {
    await api(adminToken, `/api/admin/representative-guide/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visible: true }),
    });
  }
  const restored = await prisma.representativeGuideSection.count({ where: { visible: true } });
  assert.equal(restored, allSections.length, "every section is visible again");
  ok("the last visible section cannot be deleted, and the guide is restored");

  console.log(`\n${passed} admin-contract checks passed against the running server.`);
} catch (error) {
  console.error("\nADMIN CONTRACT VERIFICATION FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  await purgeResidue();
  await assertNoResidue("verify-rep-admin-contracts");
  await prisma.$disconnect();
}
