/**
 * Verification of producer registration: referral attribution, the frozen fee
 * decision, duplicate and self-referral rejection, and atomicity.
 *
 * This is the path where money is decided, so it is checked against a real
 * database and through the real library entry point rather than a re-write of
 * the logic.
 *
 * Run against a dev branch only:
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx scripts/verify-rep-registration.mts
 */
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { createWithGeneratedCode } from "../src/lib/representative-code";
import { getSettings, updateSettings } from "../src/lib/representative-settings";
import {
  registerProducer,
  DuplicateProducerError,
  SelfReferralError,
  SelfRegistrationError,
} from "../src/lib/producer-registration";
import { resolveReferralCode } from "../src/lib/referral-cookie";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

const stamp = Date.now();
const PREFIX = "rep-reg-";
const FEE = 1200;

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
const adminActor = { id: "registration-verification-admin", role: "ADMIN" } as const;

let counter = 0;
async function makeUser(role: string, overrides: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `${PREFIX}${role.toLowerCase()}-${stamp}-${counter}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      phone: `+9477${String(1000000 + counter * 7 + Math.floor(Math.random() * 900)).padStart(7, "0")}`,
      phoneVerified: true,
      role,
      name: `Reg Verify ${role}`,
      ...overrides,
    },
  });
}

async function makeRepresentative(userId: string, status: string, email: string) {
  return createWithGeneratedCode("representative", (tx, code) =>
    tx.representative.create({
      data: {
        code,
        userId,
        fullName: "Reg Verify Rep",
        phone: `+9471${String(100000 + counter++).slice(0, 7)}`,
        // The Representative row carries its own contact fields, which are what
        // self-referral detection compares against, so it is set to the same
        // address as the owning user here.
        email,
        district: "Colombo",
        status,
      },
      select: { id: true, code: true, userId: true, status: true, email: true, phone: true },
    })
  );
}

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
  const representatives = await prisma.representative.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const representativeIds = representatives.map((r) => r.id);

  if (producerIds.length > 0) {
    await prisma.product.deleteMany({ where: { producerId: { in: producerIds } } });
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
}

const base = (userId: string, overrides: Record<string, unknown> = {}) => ({
  userId,
  businessName: `Reg Test Business ${stamp}-${counter}`,
  location: "Colombo 03",
  district: "Colombo",
  phone: `+9476${String(1000000 + counter++).padStart(7, "0")}`,
  ...overrides,
});

await cleanup();
await beginResidueGuard();
await updateSettings({ feeEnforcementMode: "FORCE_OPEN" }, adminActor, "verification run setup");

// ---------------------------------------------------------------------------
console.log("\n[1] unreferred producer with the gate open pays nothing");
const freeUser = await makeUser("PRODUCER");
const free = await registerProducer(base(freeUser.id));
assert.equal(free.fee.required, false);
assert.equal(free.fee.basis, null);
assert.equal(free.payment.amount, 0);
assert.equal(free.referral, null);
ok(`no fee, no referral, amount Rs. ${free.payment.amount}`);

const freePayment = await prisma.producerRegistrationPayment.findUniqueOrThrow({
  where: { id: free.payment.id },
});
assert.equal(freePayment.status, "WAIVED", "a no-fee registration still records why");
assert.equal(
  freePayment.waivedById,
  null,
  "a no-fee row must not carry an admin id, so it can never pay out a commission"
);
ok("the zero-amount row is WAIVED with no admin attached");

// ---------------------------------------------------------------------------
console.log("\n[2] the fee decision is frozen at registration");
await updateSettings({ feeEnforcementMode: "FORCE_CLOSED" }, adminActor, "verification: close the gate");
const reread = await prisma.producerRegistrationPayment.findUniqueOrThrow({
  where: { id: free.payment.id },
});
assert.equal(
  reread.feeRequired,
  false,
  "closing the gate must not retroactively charge a producer who registered while it was open"
);
assert.equal(reread.amount, 0);
ok("a gate closed after registration does not change the recorded fee");

// ---------------------------------------------------------------------------
console.log("\n[3] closing the gate does charge the next unreferred producer");
const closedUser = await makeUser("PRODUCER");
const closed = await registerProducer(base(closedUser.id));
assert.equal(closed.fee.required, true);
assert.equal(closed.fee.basis, "GATE_ENFORCED");
assert.equal(closed.payment.amount, FEE);
assert.equal(closed.referral, null, "an unreferred producer has no representative to pay");
ok(`gate-enforced fee Rs. ${closed.payment.amount}, basis GATE_ENFORCED`);

// ---------------------------------------------------------------------------
console.log("\n[4] a referred producer pays even while the gate is OPEN");
await updateSettings({ feeEnforcementMode: "FORCE_OPEN" }, adminActor, "verification: reopen the gate");
const repUser = await makeUser("REPRESENTATIVE");
// The Representative row carries its own contact email, which an admin may set
// to something other than the login address. That is the only way the
// email-based self-referral check can actually fire: two User rows can never
// share an email, so a producer cannot simply sign up with the rep's login
// address.
const repContactEmail = `${PREFIX}contact-${stamp}@test.local`;
const rep = await makeRepresentative(repUser.id, "ACTIVE", repContactEmail);
assert.notEqual(rep.email, repUser.email, "the contact email must differ from the login email");
ok("the representative's contact email differs from their login email");
const referredUser = await makeUser("PRODUCER");
const referral = await resolveReferralCode(rep.code);
assert.ok(referral, "the rep's own code must resolve");
assert.equal(referral!.canConvert, true);

const referred = await registerProducer(base(referredUser.id, { referral }));
assert.equal(
  referred.fee.required,
  true,
  "the commercial model is that a referred producer always pays, whatever the gate says"
);
assert.equal(referred.fee.basis, "REFERRAL");
assert.equal(referred.payment.amount, FEE);
ok("referred producer charged Rs. 1200 under REFERRAL with the gate open");

const referralRow = await prisma.producerReferral.findUniqueOrThrow({
  where: { producerId: referred.producer.id },
});
assert.equal(referralRow.representativeId, rep.id);
assert.equal(referralRow.status, "ACTIVE");
assert.ok(referralRow.lockedAt, "the referral must be locked at registration");
ok("the referral row is created ACTIVE and locked in the same transaction");

// ---------------------------------------------------------------------------
console.log("\n[5] a suspended representative's link earns nothing");
await prisma.representative.update({
  where: { id: rep.id },
  data: { status: "SUSPENDED", statusReason: "verification" },
});
const staleReferral = await resolveReferralCode(rep.code);
assert.ok(staleReferral, "the code still resolves, it just cannot convert");
assert.equal(staleReferral!.canConvert, false);

const suspendedUser = await makeUser("PRODUCER");
const viaSuspended = await registerProducer(base(suspendedUser.id, { referral: staleReferral }));
assert.equal(
  viaSuspended.referral,
  null,
  "a suspended rep's link must not create a referral, even though the cookie was valid"
);
assert.equal(viaSuspended.fee.required, false, "with no conversion there is no referral, so the open gate means free");
ok("suspended rep: no referral row, and no commission path exists");

await prisma.representative.update({ where: { id: rep.id }, data: { status: "ACTIVE" } });

// ---------------------------------------------------------------------------
console.log("\n[6] self-referral is refused");
// The rep's own phone on a producer account: same person, two roles.
const selfPhone = `+9477${String(5550000 + counter).slice(0, 7)}`;
await prisma.representative.update({ where: { id: rep.id }, data: { phone: selfPhone } });
const selfUser = await makeUser("PRODUCER");
const selfReferral = await resolveReferralCode(rep.code);
await assert.rejects(
  () => registerProducer(base(selfUser.id, { referral: selfReferral, phone: selfPhone })),
  (e: unknown) => e instanceof SelfReferralError
);
ok("a producer registering with the representative's own phone is refused");

const selfUser2 = await makeUser("PRODUCER", { email: rep.email });
const selfReferral2 = await resolveReferralCode(rep.code);
await assert.rejects(
  () => registerProducer(base(selfUser2.id, { referral: selfReferral2, email: rep.email })),
  (e: unknown) => e instanceof SelfReferralError
);
ok("a producer registering with the representative's own contact email is refused");

// ---------------------------------------------------------------------------
console.log("\n[7] a representative cannot also hold a Producer profile");
await assert.rejects(
  () => registerProducer(base(repUser.id, { referral: null })),
  (e: unknown) => e instanceof SelfRegistrationError
);
ok("a representative user is refused a Producer profile of their own");

// ---------------------------------------------------------------------------
console.log("\n[8] duplicates are refused, not silently merged");
// `free` registered in section 1, so it is the existing Producer here. Both
// attempts below must be refused rather than silently merged into it.
const dupUser = await makeUser("PRODUCER");
await assert.rejects(
  () => registerProducer(base(dupUser.id, { businessName: free.producer.businessName })),
  (e: unknown) => e instanceof DuplicateProducerError
);
ok("a second producer with the same business name is refused for admin review");

// The same business name written with different punctuation must still be
// caught. This is the case a naive `contains` pre-filter silently misses,
// because normalisation turns the punctuation into a space that is not present
// in the stored value.
const punctuationUser = await makeUser("PRODUCER");
const punctuated = free.producer.businessName.replace(/-/g, " - ");
await assert.rejects(
  () => registerProducer(base(punctuationUser.id, { businessName: punctuated })),
  (e: unknown) => e instanceof DuplicateProducerError
);
ok("the same name with different spacing/punctuation is still caught as a duplicate");

// A rejected duplicate must leave no partial record behind: the transaction
// rolled back, so there is no orphan Producer or payment row.
const orphanCount = await prisma.producer.count({
  where: { businessName: { in: [free.producer.businessName, punctuated] } },
});
assert.equal(orphanCount, 1, "only the original producer may exist after a refused duplicate");
ok("a refused duplicate leaves no partial Producer or payment row behind");

// ---------------------------------------------------------------------------
console.log("\n[9] the lead is closed by the system, not the representative");
const lead = await prisma.representativeLead.create({
  data: {
    leadCode: `LEAD-${stamp}-${counter++}`,
    representativeId: rep.id,
    contactName: "Lead Person",
    phone: `+9470${String(100000 + counter).slice(0, 7)}`,
    district: "Gampaha",
    status: "REGISTRATION_STARTED",
  },
  select: { id: true },
});
const leadUser = await makeUser("PRODUCER");
const leadReferral = await resolveReferralCode(rep.code, lead.id);
assert.equal(leadReferral!.leadId, lead.id);
const leadResult = await registerProducer(base(leadUser.id, { referral: leadReferral }));

const closedLead = await prisma.representativeLead.findUniqueOrThrow({ where: { id: lead.id } });
assert.equal(closedLead.status, "REGISTERED");
assert.equal(closedLead.producerId, leadResult.producer.id);
assert.equal(closedLead.statusLocked, true, "a rep must not be able to walk the lead back");
ok("the lead closes to REGISTERED and becomes system-locked");

// A crafted leadId belonging to another rep must not close their lead.
const otherRepUser = await makeUser("REPRESENTATIVE");
const otherRep = await makeRepresentative(otherRepUser.id, "ACTIVE", otherRepUser.email);
const otherLead = await prisma.representativeLead.create({
  data: {
    leadCode: `LEAD-${stamp}-${counter++}`,
    representativeId: otherRep.id,
    contactName: "Other Lead",
    phone: `+9470${String(200000 + counter).slice(0, 7)}`,
    district: "Kandy",
  },
  select: { id: true },
});
const stolenReferral = await resolveReferralCode(rep.code, otherLead.id);
const thiefUser = await makeUser("PRODUCER");
await registerProducer(base(thiefUser.id, { referral: stolenReferral }));
const untouched = await prisma.representativeLead.findUniqueOrThrow({ where: { id: otherLead.id } });
assert.equal(untouched.status, "NEW", "a lead id from another rep must be ignored");
assert.equal(untouched.producerId, null);
ok("a lead belonging to a different representative is left untouched");

// ---------------------------------------------------------------------------
console.log("\n[10] everything is written together, including the first product");
const category = await prisma.category.findFirst({ select: { id: true } });
assert.ok(category, "the dev branch must have at least one Category");
const atomicUser = await makeUser("PRODUCER");
const atomic = await registerProducer(
  base(atomicUser.id, {
    firstProduct: {
      name: "Verification Product",
      price: 250,
      stock: 3,
      categoryId: category!.id,
    },
  })
);
const [productCount, paymentCount, referralCount] = await Promise.all([
  prisma.product.count({ where: { producerId: atomic.producer.id } }),
  prisma.producerRegistrationPayment.count({ where: { producerId: atomic.producer.id } }),
  prisma.producerReferral.count({ where: { producerId: atomic.producer.id } }),
]);
assert.equal(productCount, 1);
assert.equal(paymentCount, 1);
assert.equal(referralCount, 0);
ok("producer, product and payment are all present and consistent");

// ---------------------------------------------------------------------------
console.log("\n[11] the representative is notified, addressed to their User id");
const repNotification = await prisma.notification.findFirst({
  where: { userId: repUser.id, type: "PRODUCER_REGISTERED" },
  orderBy: { createdAt: "desc" },
});
assert.ok(repNotification, "the referring rep must be notified");
ok("notification delivered to the representative's User, not a bare representative id");

// A notification addressed to the Representative id would violate the FK to
// User, so its mere existence proves the id used was correct.

// ---------------------------------------------------------------------------
console.log("\n[12] a producer cannot register twice");
const twice = await makeUser("PRODUCER");
await registerProducer(base(twice.id));
await assert.rejects(() => registerProducer(base(twice.id)), /Unique constraint/);
ok("a second profile for the same user is refused by the database");

// ---------------------------------------------------------------------------
// Restore shared state, then clean up. The settings row is shared with the rest
// of the dev branch, so it is put back before the test users are removed.
await updateSettings({ feeEnforcementMode: originalMode }, adminActor, "verification run: restore original gate");
await cleanup();
await purgeResidue();
await assertNoResidue("verify-rep-registration");

const final = await getSettings();
assert.equal(final.feeEnforcementMode, originalMode, "the shared settings row must be left as found");
ok(`settings restored to ${originalMode}`);

console.log(`\n${passed} registration checks passed against the dev database.`);
