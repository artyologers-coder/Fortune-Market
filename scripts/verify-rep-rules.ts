/**
 * Throwaway verification of the pure representative business rules.
 * Run: npx tsx scripts/verify-rep-rules.ts
 */
import assert from "node:assert";
import {
  assertValidSplit,
  isFeeEnforced,
  isFeeRequired,
  type FeeEnforcementMode,
} from "../src/lib/representative-settings";
import {
  evaluateCommissionEligibility,
  PAYABLE_COMMISSION_STATUSES,
} from "../src/lib/commission";
import {
  encodeReferralPayload,
  decodeReferralCookie,
} from "../src/lib/referral-cookie";
import {
  normalizePhone,
  phoneVariants,
  normalizeBusinessName,
  normalizeNic,
  checkSelfReferral,
} from "../src/lib/duplicate-detection";

process.env.NEXTAUTH_SECRET ||= "test-secret-for-verification-only";
let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ok  ${label}`);
};

// ---------- financial split ----------
console.log("\n[split] 1200 = 700 + 500");
assertValidSplit({
  producerAnnualRegistrationFee: 1200,
  representativeInitialCommission: 700,
  fortuneMarketInitialAllocation: 500,
});
ok("valid split accepted");

assert.throws(() =>
  assertValidSplit({
    producerAnnualRegistrationFee: 1200,
    representativeInitialCommission: 600,
    fortuneMarketInitialAllocation: 500,
  })
);
ok("mismatched split rejected (1100 != 1200)");

assert.throws(() =>
  assertValidSplit({
    producerAnnualRegistrationFee: 1200.5,
    representativeInitialCommission: 700,
    fortuneMarketInitialAllocation: 500.5,
  })
);
ok("fractional rupees rejected");

// ---------- fee gate ----------
console.log("\n[gate] referred always pays, unreferred follows the gate");
const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2027-01-01T00:00:00Z");
const now = new Date("2026-06-01T00:00:00Z");

const autoPast: { feeEnforcementMode: string; feeEnforcementStartsAt: Date | null } = {
  feeEnforcementMode: "AUTO",
  feeEnforcementStartsAt: past,
};
const autoFuture = { feeEnforcementMode: "AUTO", feeEnforcementStartsAt: future };
const forceOpen = { feeEnforcementMode: "FORCE_OPEN" as FeeEnforcementMode, feeEnforcementStartsAt: past };
const forceClosed = { feeEnforcementMode: "FORCE_CLOSED" as FeeEnforcementMode, feeEnforcementStartsAt: future };

assert.equal(isFeeEnforced(autoPast, now), true);
assert.equal(isFeeEnforced(autoFuture, now), false);
ok("AUTO follows the closing date");
assert.equal(isFeeEnforced(forceOpen, now), false, "FORCE_OPEN must beat a past date");
ok("FORCE_OPEN overrides a passed closing date");
assert.equal(isFeeEnforced(forceClosed, now), true, "FORCE_CLOSED must beat a future date");
ok("FORCE_CLOSED overrides a future closing date");

// referred producer always pays, in every mode
for (const [label, s] of [
  ["AUTO past", autoPast],
  ["AUTO future", autoFuture],
  ["FORCE_OPEN", forceOpen],
  ["FORCE_CLOSED", forceClosed],
] as const) {
  const r = isFeeRequired({ hasLockedReferral: true }, s, now);
  assert.equal(r.required, true, `referred must pay under ${label}`);
  assert.equal(r.basis, "REFERRAL");
}
ok("referred producer always pays, under every mode");

// unreferred producer
assert.deepEqual(isFeeRequired({ hasLockedReferral: false }, forceOpen, now), {
  required: false,
  basis: null,
});
ok("unreferred producer is free while the gate is open");
assert.deepEqual(isFeeRequired({ hasLockedReferral: false }, forceClosed, now), {
  required: true,
  basis: "GATE_ENFORCED",
});
ok("unreferred producer pays once the gate is closed");

// ---------- commission eligibility ----------
console.log("\n[commission] locked referral + APPROVED + settled payment");
const settings = { representativeInitialCommission: 700 };
const activeRef = {
  status: "ACTIVE",
  lockedAt: new Date(),
  representative: { id: "rep1", status: "ACTIVE" },
};
const approvedProducer = { verificationStatus: "APPROVED" };

const paid = evaluateCommissionEligibility({
  referral: activeRef,
  producer: approvedProducer,
  payment: { status: "PAID", waivedById: null },
  settings,
});
assert.deepEqual(paid, { eligible: true, amount: 700, basis: "PAID" });
ok("PAID referred producer earns the snapshotted commission");

const waived = evaluateCommissionEligibility({
  referral: activeRef,
  producer: approvedProducer,
  payment: { status: "WAIVED", waivedById: "admin1" },
  settings,
});
assert.equal(waived.eligible, true, "an admin waiver must not cost the rep the commission");
ok("admin waiver still pays the representative");

const waivedWithNoAdmin = evaluateCommissionEligibility({
  referral: activeRef,
  producer: approvedProducer,
  payment: { status: "WAIVED", waivedById: null },
  settings,
});
assert.equal(
  waivedWithNoAdmin.eligible,
  false,
  "a WAIVED row with no admin recorded against it is not an explicit admin decision and must not pay a rep"
);
ok("WAIVED without a recorded admin does not pay the representative");

// PENDING/ELIGIBLE must never be sweepable into a payout before an admin
// approves. Asserted against the whole list rather than by filtering, so the
// expectation is exact: only these two statuses are payout-eligible.
assert.deepEqual(
  [...PAYABLE_COMMISSION_STATUSES],
  ["APPROVED", "PAYABLE"],
  "only APPROVED/PAYABLE commissions may be paid out"
);
ok("only APPROVED/PAYABLE commissions are payout-eligible");

const noRef = evaluateCommissionEligibility({
  referral: null,
  producer: approvedProducer,
  payment: { status: "PAID", waivedById: null },
  settings,
});
assert.equal(noRef.eligible, false);
ok("no referral means no commission (even if the producer paid)");

const pending = evaluateCommissionEligibility({
  referral: activeRef,
  producer: approvedProducer,
  payment: { status: "PENDING", waivedById: null },
  settings,
});
assert.equal(pending.eligible, false);
ok("PENDING payment earns nothing yet");

const notApproved = evaluateCommissionEligibility({
  referral: activeRef,
  producer: { verificationStatus: "PENDING" },
  payment: { status: "PAID", waivedById: null },
  settings,
});
assert.equal(notApproved.eligible, false);
ok("unapproved producer earns nothing");

const unlocked = evaluateCommissionEligibility({
  referral: { ...activeRef, lockedAt: null },
  producer: approvedProducer,
  payment: { status: "PAID", waivedById: null },
  settings,
});
assert.equal(unlocked.eligible, false);
ok("unlocked referral earns nothing");

const suspendedRep = evaluateCommissionEligibility({
  referral: { ...activeRef, representative: { id: "rep1", status: "SUSPENDED" } },
  producer: approvedProducer,
  payment: { status: "PAID", waivedById: null },
  settings,
});
assert.equal(suspendedRep.eligible, false);
ok("suspended rep cannot accrue new commission");

// ---------- referral cookie signing ----------
console.log("\n[referral] HMAC-signed cookie");
const signed = encodeReferralPayload({ code: "FM-REP-00042", issuedAt: Math.floor(Date.now() / 1000) });
assert.equal(decodeReferralCookie(signed)?.code, "FM-REP-00042");
ok("a payload we signed round-trips");

assert.equal(decodeReferralCookie(`${signed}tampered`), null);
ok("a mutated signature is rejected");
assert.equal(decodeReferralCookie("not-a-cookie"), null);
ok("garbage is rejected safely");
assert.equal(decodeReferralCookie(null), null);
ok("absent cookie is null, not a crash");

// forge a payload with a valid-looking but unsigned shape
const forged = Buffer.from(JSON.stringify({ code: "FM-REP-00001", issuedAt: Math.floor(Date.now() / 1000) })).toString("base64url");
assert.equal(decodeReferralCookie(`${forged}.aaaa`), null);
ok("an unsigned payload claiming a rep code is rejected");

const expired = encodeReferralPayload({ code: "FM-REP-00042", issuedAt: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 31 });
assert.equal(decodeReferralCookie(expired), null);
ok("a 31-day-old cookie is rejected");

// ---------- duplicate detection normalisation ----------
console.log("\n[dedupe] normalisation");
assert.equal(normalizePhone("0771234567"), "94771234567");
assert.equal(normalizePhone("+94771234567"), "94771234567");
assert.equal(normalizePhone("94771234567"), "94771234567");
ok("077 / +94 / 94 all collapse to one key");

const variants = phoneVariants("0771234567");
assert.ok(variants.includes("94771234567") && variants.includes("0771234567") && variants.includes("+94771234567"));
ok("variants cover every stored spelling");

assert.equal(normalizeBusinessName("Sunrise Foods (Pvt) Ltd"), "sunrise foods");
assert.equal(normalizeBusinessName("SUNRISE  FOODS"), "sunrise foods");
assert.equal(normalizeBusinessName("Sunrise Foods (Pvt) Ltd."), "sunrise foods");
ok("legal suffixes and spacing normalised");

assert.equal(normalizeBusinessName("සිංහල ආභරණය"), "සිංහල ආභරණය");
ok("non-Latin business names survive normalisation");

assert.equal(normalizeNic("1990 123 456 78"), "199012345678");
assert.equal(normalizeNic("1990-123-456-78"), "199012345678");
ok("NICs normalise across spacing and dashes");

// checkSelfReferral touches the DB to resolve producers, so it runs inside an
// async IIFE (this file compiles to CJS, where top-level await is unavailable).
void (async () => {
  const selfRef = await checkSelfReferral({
    representative: { phone: "0771234567", whatsapp: null, email: "rep@x.com", nic: null },
    producer: { userId: "u2", phone: "0771234567", email: "other@x.com" },
  });
  assert.equal(selfRef.isSelfReferral, true);
  ok("self-referral by phone is caught");

  const notSelf = await checkSelfReferral({
    representative: { phone: "0771234567", whatsapp: null, email: "rep@x.com", nic: null },
    producer: { userId: "u2", phone: "0719999999", email: "other@x.com" },
  });
  assert.equal(notSelf.isSelfReferral, false);
  ok("a different phone is not a self-referral");

  // The NIC must be compared against the producer's business registration
  // number. Comparing it against the producer's email can never match, which is
  // how this check used to sit in the code as dead code.
  const selfByNic = await checkSelfReferral({
    representative: { phone: "0771234567", whatsapp: null, email: "rep@x.com", nic: "199012345678" },
    producer: { userId: "u2", phone: "0719999999", email: "other@x.com", businessRegistrationNo: "1990 123 456 78" },
  });
  assert.equal(selfByNic.isSelfReferral, true, "a rep must not be credited for their own NIC");
  ok("self-referral by NIC vs business registration number is caught");

  const nicOnlyInEmail = await checkSelfReferral({
    representative: { phone: "0771234567", whatsapp: null, email: "rep@x.com", nic: "199012345678" },
    producer: { userId: "u2", phone: "0719999999", email: "other@x.com", businessRegistrationNo: null },
  });
  assert.equal(nicOnlyInEmail.isSelfReferral, false, "a matching NIC with no reg number is not a self-referral");
  ok("NIC alone does not flag a self-referral without a matching reg number");

  console.log(`\n${passed} checks passed.`);
})();
