/**
 * Lead-capture verification.
 *
 * Leads are the join between a representative's own record-keeping and the
 * attribution that pays them: `producer-registration` matches an arriving
 * producer against an existing lead by phone, so a bug here is a bug in who
 * gets credited with whose business. The property that matters most is
 * isolation — one representative must never be able to see or move another
 * representative's lead, and the payment flow's statuses must not be
 * reachable by hand.
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { approveApplication } from "../src/lib/representative-admin";
import {
  LeadValidationError,
  createLeadForRepresentative,
  getLeadCounts,
  updateLeadForRepresentative,
} from "../src/lib/representative-lead";
import { CODE_PREFIXES } from "../src/lib/representative-code";
import {
  assertNoResidue,
  beginResidueGuard,
  purgeResidue,
} from "./verification-residue.mts";

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";

const PREFIX = "rep-leads-";
let passed = 0;
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

function section(name: string) {
  console.log(`\n[${name}] ${name}`);
}
function ok(what: string) {
  passed++;
  console.log(`  ok ${what}`);
}

const admin = { id: "verify-rep-leads-admin", role: "ADMIN" } as const;

const repIds: string[] = [];
const userIds: string[] = [];
const producerIds: string[] = [];

async function cleanup() {
  const reps = await prisma.representative.findMany({
    where: { user: { email: { contains: PREFIX } } },
    select: { id: true },
  });
  const ids = reps.map((r) => r.id);
  repIds.push(...ids);

  const producers = await prisma.producer.findMany({
    where: { user: { email: { contains: PREFIX } } },
    select: { id: true },
  });
  producerIds.push(...producers.map((p) => p.id));

  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  userIds.push(...users.map((u) => u.id));

  await prisma.representativeLead.deleteMany({ where: { representativeId: { in: ids } } });
  await prisma.representativeApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.representativeAuditLog.deleteMany({ where: { actorId: "verify-rep-leads-admin" } });
  await prisma.producer.deleteMany({ where: { id: { in: producerIds } } });
  await prisma.representative.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

await cleanup();

await beginResidueGuard();
/** An approved, ACTIVE representative. */
async function makeRep(label: string) {
  const app = await prisma.representativeApplication.create({
    data: {
      applicationCode: `FM-APP-TEST-${uniq()}`,
      user: {
        create: {
          email: `${PREFIX}${label}-${uniq()}@test.local`,
          passwordHash: await bcrypt.hash("x", 4),
          role: "REPRESENTATIVE",
          name: `Lead Rep ${label}`,
        },
      },
      fullName: `Lead Rep ${label}`,
      email: `${PREFIX}${label}-r-${uniq()}@test.local`,
      phone: `077${Math.floor(1000000 + Math.random() * 8999999)}`,
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
  const approved = await approveApplication(app.id, admin);
  const rep = await prisma.representative.findUniqueOrThrow({
    where: { id: approved.representativeId },
    select: { id: true, code: true, status: true },
  });
  repIds.push(rep.id);
  return rep;
}

function phone() {
  return `077${Math.floor(1000000 + Math.random() * 8999999)}`;
}

try {
  // ---------------------------------------------------------------- valid lead
  section("a valid lead is recorded and given a code");
  const repA = await makeRep("a");
  const lead = await createLeadForRepresentative(repA.id, {
    contactName: "  Nimal Perera  ",
    phone: phone(),
    district: " Gampaha ",
    area: " Negombo ",
  });
  assert.ok(lead.leadCode.startsWith(CODE_PREFIXES.lead), "lead code uses the lead prefix");
  assert.equal(lead.contactName, "Nimal Perera", "name is trimmed");
  assert.equal(lead.district, "Gampaha", "district is trimmed");
  assert.equal(lead.duplicateSuspect, false, "a new number is not a duplicate");
  assert.equal(lead.status, "NEW", "a new lead starts as NEW");
  ok(`created ${lead.leadCode} against ${repA.code}`);

  // ---------------------------------------------------------------- validation
  section("bad input is rejected before anything is written");
  const before = await prisma.representativeLead.count();
  for (const [label, input, field] of [
    ["missing name", { contactName: "  ", phone: phone(), district: "Colombo" }, "contactName"],
    ["bad phone", { contactName: "Someone", phone: "123", district: "Colombo" }, "phone"],
    ["bad whatsapp", { contactName: "Someone", phone: phone(), district: "Colombo", whatsapp: "abc" }, "whatsapp"],
    ["missing district", { contactName: "Someone", phone: phone(), district: "" }, "district"],
  ] as const) {
    await assert.rejects(
      () => createLeadForRepresentative(repA.id, input as never),
      (e: unknown) => e instanceof LeadValidationError && e.field === field,
      `${label} must be refused on ${field}`
    );
  }
  assert.equal(
    await prisma.representativeLead.count(),
    before,
    "no partial lead is left behind by a rejected submission"
  );
  ok("name, phone, whatsapp and district are each validated");

  // ------------------------------------------------------- phone normalisation
  section("phone numbers normalise to one stored form");
  const raw = phone();
  const national = await createLeadForRepresentative(repA.id, {
    contactName: "Saman",
    phone: raw,
    district: "Colombo",
  });
  const intl = await createLeadForRepresentative(repA.id, {
    contactName: "Ruwan",
    phone: `+94${raw.slice(1)}`,
    district: "Colombo",
  });
  const spaced = await createLeadForRepresentative(repA.id, {
    contactName: "Kasun",
    phone: `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`,
    district: "Colombo",
  });
  const stored = [national, intl, spaced].map((l) => l.phone);
  assert.equal(new Set(stored).size, 1, "all three spellings of one number store identically");
  ok("07…, +94… and spaced input all collapse to the same stored number");

  // --------------------------------------------------------------- duplicates
  section("a lead matching an existing producer is flagged, not dropped");
  const dupPhone = phone();
  const owner = await prisma.user.create({
    data: {
      email: `${PREFIX}dup-${uniq()}@test.local`,
      passwordHash: await bcrypt.hash("x", 4),
      role: "PRODUCER",
      name: "Already Joined",
    },
    select: { id: true },
  });
  userIds.push(owner.id);
  const producer = await prisma.producer.create({
    data: {
      userId: owner.id,
      businessName: `Existing Shop ${uniq()}`,
      businessNameSi: "කරියාත්මක ගලක",
      description: "test",
      descriptionSi: "පරීක්ෂණ",
      location: "Colombo",
      district: "Colombo",
      phone: dupPhone,
      membershipId: `M-${uniq()}`,
    },
    select: { id: true },
  });
  producerIds.push(producer.id);

  const flagged = await createLeadForRepresentative(repA.id, {
    contactName: "Already Registered",
    phone: dupPhone,
    district: "Colombo",
  });
  assert.equal(flagged.duplicateSuspect, true, "a phone that is already a producer is a suspect");
  const flaggedRow = await prisma.representativeLead.findUniqueOrThrow({
    where: { id: flagged.id },
  });
  assert.equal(flaggedRow.duplicateOfProducerId, producer.id, "it points at the producer it collides with");
  assert.equal(flaggedRow.status, "NEW", "the lead still exists rather than being discarded");
  ok("flagged with the producer id, and still saved");

  section("a phone already held by another representative is flagged too");
  const repB = await makeRep("b");
  const clash = await createLeadForRepresentative(repB.id, {
    contactName: "Same Person",
    phone: phone(),
    district: "Colombo",
  });
  const again = await createLeadForRepresentative(repB.id, {
    contactName: "Same Person",
    phone: clash.phone,
    district: "Colombo",
  });
  assert.equal(again.duplicateSuspect, true, "the repeat is flagged");
  assert.ok(again.duplicateNote, "and carries a note saying why");
  ok("repeat entries are flagged, not silently merged");

  // -------------------------------------------------------------- status moves
  section("a representative can move their own lead along");
  const moved = await updateLeadForRepresentative(repA.id, lead.id, { status: "CONTACTED" });
  assert.equal(moved.status, "CONTACTED", "NEW became CONTACTED");
  const afterMove = await prisma.representativeLead.findUniqueOrThrow({ where: { id: lead.id } });
  assert.ok(afterMove.contactedAt, "the first contact is timestamped for admin response-time");
  assert.equal(afterMove.statusLocked, false, "hand-set statuses are not system-locked");

  await updateLeadForRepresentative(repA.id, lead.id, { notes: "  Wants to sell rice.  " });
  const noted = await prisma.representativeLead.findUniqueOrThrow({ where: { id: lead.id } });
  assert.equal(noted.notes, "Wants to sell rice.", "notes are trimmed");
  ok("status and notes both save, and contact is stamped once");

  // ------------------------------------------------ system-owned status guard
  section("a representative cannot hand-set a status the business owns");
  for (const forbidden of ["APPROVED", "REGISTERED", "PAYMENT_CONFIRMED", "PAYMENT_PENDING"]) {
    await assert.rejects(
      () => updateLeadForRepresentative(repA.id, lead.id, { status: forbidden }),
      (e: unknown) => e instanceof LeadValidationError,
      `${forbidden} must be refused`
    );
  }
  const stillContacted = await prisma.representativeLead.findUniqueOrThrow({ where: { id: lead.id } });
  assert.equal(stillContacted.status, "CONTACTED", "the status did not change on a refused update");
  ok("APPROVED, REGISTERED and the payment states are all unreachable by hand");

  // ---------------------------------------------------------------- isolation
  section("one representative cannot touch another's lead");
  await assert.rejects(
    () => updateLeadForRepresentative(repB.id, lead.id, { status: "INTERESTED" }),
    (e: unknown) => e instanceof LeadValidationError && e.field === "leadId",
    "a foreign lead id is reported as not found"
  );
  const untouched = await prisma.representativeLead.findUniqueOrThrow({ where: { id: lead.id } });
  assert.equal(untouched.status, "CONTACTED", "rep B's attempt changed nothing");
  const bSeesOnlyOwn = await prisma.representativeLead.findMany({
    where: { representativeId: repB.id },
    select: { id: true },
  });
  assert.ok(
    bSeesOnlyOwn.every((l) => l.id !== lead.id),
    "rep B's own listing excludes rep A's lead"
  );
  ok("a foreign lead id is refused and the lead is left alone");

  // ------------------------------------------------------------------- counts
  section("dashboard counts reflect the pipeline");
  const countsA = await getLeadCounts(repA.id);
  // Nimal, Saman, Ruwan, Kasun, plus the one that collided with a producer.
  assert.equal(countsA.total, 5, "rep A's five leads are counted");
  assert.equal(countsA.converted, 0, "none have converted yet");
  assert.ok(countsA.open >= 1, "the contacted lead counts as open");

  await prisma.representativeLead.update({
    where: { id: lead.id },
    data: { status: "REGISTERED", statusLocked: true },
  });
  const afterConvert = await getLeadCounts(repA.id);
  assert.equal(afterConvert.converted, 1, "a registered lead counts as converted");
  assert.equal(afterConvert.total, 5, "the total is unchanged by the status move");
  ok("converted and open totals both track the real statuses");

  // --------------------------------------------- a locked lead is not editable
  section("a lead the system has claimed cannot be moved afterwards");
  await assert.rejects(
    () => updateLeadForRepresentative(repA.id, lead.id, { status: "NOT_INTERESTED" }),
    (e: unknown) => e instanceof LeadValidationError,
    "a system-locked lead refuses a hand edit"
  );
  ok("statusLocked is respected, matching what the API reports to the UI");

  console.log(`\n${passed} lead-capture checks passed against the dev database.`);
} catch (error) {
  console.error("\nLEAD VERIFICATION FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  await purgeResidue();
  await assertNoResidue("verify-rep-leads");
  await prisma.$disconnect();
}
