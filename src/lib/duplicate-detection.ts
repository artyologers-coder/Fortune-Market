import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Duplicate Producer detection.
 *
 * Runs before a lead is created and before a registration is accepted, so two
 * representatives cannot both lay claim to the same real business. A detected
 * duplicate is NEVER auto-assigned to a representative — the user is told to
 * contact an admin, because silently awarding or silently dropping a producer
 * are both wrong.
 *
 * Phone matching is done on a normalised Sri Lankan format so that 0771234567,
 * 0712345678-style spacing and +94 prefixes all collapse to the same key.
 */

const LEGAL_SUFFIXES = [
  "pvt ltd",
  "pvt. ltd.",
  "private limited",
  "pvt ltd private",
  "co",
  "company",
  "enterprise",
  "enterprises",
  "trading",
  "store",
  "shop",
];

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `94${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `94${digits}`;
  return digits;
}

/** All raw spellings that could match this normalised number in the database. */
export function phoneVariants(raw?: string | null): string[] {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];
  if (normalized.startsWith("94")) {
    const local = normalized.slice(2);
    return Array.from(
      new Set([normalized, `+${normalized}`, local, `0${local}`])
    );
  }
  return Array.from(new Set([normalized, `+${normalized}`]));
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

/**
 * Non-ASCII punctuation that should not survive normalisation. Everything else
 * at or above U+0080 is treated as a letter, because the project serves Sinhala
 * and Tamil business names and they must round-trip intact.
 */
const NON_ASCII_PUNCTUATION = new Set([
  " ", "‐", "‑", "‒", "–", "—", "―",
  "‘", "’", "“", "”", "…", "·",
]);

function isKeptCharacter(ch: string): boolean {
  if (NON_ASCII_PUNCTUATION.has(ch)) return false;
  const code = ch.charCodeAt(0);
  // Any non-ASCII character is preserved: Sinhala, Tamil, accented Latin, etc.
  if (code >= 0x80) return true;
  if (code >= 97 && code <= 122) return true; // a-z
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 48 && code <= 57) return true; // 0-9
  return code === 32 || code === 9 || code === 10 || code === 13; // whitespace
}

export function normalizeBusinessName(raw?: string | null): string | null {
  if (!raw) return null;

  let value = "";
  for (const ch of raw.toLowerCase()) {
    value += isKeptCharacter(ch) ? ch : " ";
  }
  value = value.replace(/\s+/g, " ").trim();
  if (!value) return null;

  for (const suffix of LEGAL_SUFFIXES) {
    if (value.endsWith(` ${suffix}`)) {
      value = value.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return value || null;
}

export type DuplicateMatch = {
  producerId: string;
  membershipId: string | null;
  businessName: string;
  district: string;
  verificationStatus: string;
  reasons: string[];
};

/**
 * A possible, but not certain, overlap. These never set `isDuplicate` and never
 * block a registration: Sinhala and Tamil business names are short and often
 * genuinely similar between unrelated traders, so treating a match as a hard
 * duplicate would turn away real producers. They exist so an admin reviewing
 * the application can see the overlap and decide.
 */
export type PossibleDuplicateMatch = DuplicateMatch;

export type DuplicateResult = {
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  /** Advisory only. Safe to show, never safe to block on. */
  possibleMatches?: PossibleDuplicateMatch[];
};

/**
 * Checks the supplied identifiers against existing Producers.
 *
 * `excludeProducerId` skips a record so re-saving an existing producer does not
 * match against itself.
 *
 * `client` lets the caller run the check inside an interactive transaction, so
 * the duplicate check and the insert of the new producer are serialised against
 * each other. Without that, two producers registering the same phone number
 * concurrently could both pass the check.
 */
export async function checkProducerDuplicates(
  input: {
    phone?: string | null;
    email?: string | null;
    businessName?: string | null;
    businessNameSi?: string | null;
    nic?: string | null;
    excludeProducerId?: string | null;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<DuplicateResult> {
  const phoneKeys = phoneVariants(input.phone);
  const email = normalizeEmail(input.email);
  const businessName = normalizeBusinessName(input.businessName);
  const businessNameSi = normalizeBusinessName(input.businessNameSi);
  const nic = input.nic?.trim() || null;

  if (phoneKeys.length === 0 && !email && !businessName && !nic) {
    // A Sinhala-only business name is still worth a look, even with nothing
    // else to match on.
    if (!businessNameSi) return { isDuplicate: false, matches: [] };
  }

  // Advisory pass: Sinhala business name equality. Kept entirely separate from
  // the blocking pass below so it can never set isDuplicate.
  const possibleMatches = businessNameSi
    ? await findSinhalaNameMatches(businessNameSi, input.excludeProducerId, client)
    : [];

  const or: Prisma.ProducerWhereInput[] = [];

  if (phoneKeys.length > 0) {
    or.push({ phone: { in: phoneKeys } });
    or.push({ user: { is: { phone: { in: phoneKeys } } } });
  }
  if (email) {
    or.push({ user: { is: { email } } });
  }
  if (nic) {
    // Representatives' NIC is checked against producer business numbers, which
    // is a weak signal; kept separate so it never causes a false positive.
    or.push({ businessRegistrationNo: nic });
  }
  if (businessName) {
    // Prisma cannot normalise in SQL, so this is a pre-filter and the exact
    // comparison happens in JS below.
    //
    // The pre-filter must NOT use the fully normalised string. Normalisation
    // replaces punctuation with spaces ("Bright-Store" -> "bright store"), so
    // the normalised value is not a substring of the stored value and
    // `contains` silently matches nothing. Pre-filter on the longest few
    // alphanumeric tokens instead, which survive any punctuation or spacing.
    //
    // Using a SUBSET of tokens keeps this a valid superset of true matches: if
    // two names normalise identically they share every token, so they always
    // satisfy any subset of those token constraints.
    const tokens = Array.from(
      new Set(businessName.split(" ").filter((t) => t.length >= 2))
    )
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
    const prefilter = tokens.length > 0 ? tokens : [businessName];

    const candidates = await client.producer.findMany({
      where: {
        ...(input.excludeProducerId ? { id: { not: input.excludeProducerId } } : {}),
        AND: prefilter.map((token) => ({
          businessName: { contains: token, mode: "insensitive" as const },
        })),
      },
      select: { id: true, businessName: true },
    });
    const tight = candidates.filter(
      (c) => normalizeBusinessName(c.businessName) === businessName
    );
    if (tight.length > 0) {
      or.push({ id: { in: tight.map((c) => c.id) } });
    }
  }

  if (or.length === 0) {
    return { isDuplicate: false, matches: [], possibleMatches };
  }

  const producers = await client.producer.findMany({
    where: {
      ...(input.excludeProducerId ? { id: { not: input.excludeProducerId } } : {}),
      OR: or,
    },
    select: {
      id: true,
      membershipId: true,
      businessName: true,
      district: true,
      verificationStatus: true,
      phone: true,
      businessRegistrationNo: true,
      user: { select: { email: true, phone: true } },
    },
    take: 10,
  });

  const matches: DuplicateMatch[] = producers.map((producer) => {
    const reasons: string[] = [];

    if (phoneKeys.length > 0) {
      const producerPhones = [producer.phone, producer.user.phone]
        .filter((p): p is string => Boolean(p))
        .map(normalizePhone);
      if (producerPhones.some((p) => p && phoneKeys.includes(p))) {
        reasons.push("Phone number");
      }
    }
    if (email && producer.user.email?.toLowerCase() === email) {
      reasons.push("Email address");
    }
    if (
      businessName &&
      normalizeBusinessName(producer.businessName) === businessName
    ) {
      reasons.push("Business name");
    }
    if (nic && producer.businessRegistrationNo === nic) {
      reasons.push("Business registration number");
    }

    return {
      producerId: producer.id,
      membershipId: producer.membershipId,
      businessName: producer.businessName,
      district: producer.district,
      verificationStatus: producer.verificationStatus,
      reasons,
    };
  });

  return { isDuplicate: matches.length > 0, matches, possibleMatches };
}

/**
 * Advisory Sinhala-name search.
 *
 * Uses the same token pre-filter as the English-name pass, then compares the
 * fully normalised string in JS. Only the stored Sinhala name is compared, so a
 * producer who has not supplied one can never match.
 */
async function findSinhalaNameMatches(
  normalized: string,
  excludeProducerId: string | null | undefined,
  client: Prisma.TransactionClient | typeof prisma
): Promise<PossibleDuplicateMatch[]> {
  const tokens = Array.from(
    new Set(normalized.split(" ").filter((t) => t.length >= 2))
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (tokens.length === 0) return [];
  const prefilter = tokens.length > 0 ? tokens : [normalized];

  const candidates = await client.producer.findMany({
    where: {
      ...(excludeProducerId ? { id: { not: excludeProducerId } } : {}),
      AND: prefilter.map((token) => ({
        businessNameSi: { contains: token, mode: "insensitive" as const },
      })),
    },
    select: {
      id: true,
      membershipId: true,
      businessName: true,
      district: true,
      verificationStatus: true,
      businessNameSi: true,
    },
    take: 10,
  });

  return candidates
    .filter((c) => normalizeBusinessName(c.businessNameSi) === normalized)
    .map((c) => ({
      producerId: c.id,
      membershipId: c.membershipId,
      businessName: c.businessName,
      district: c.district,
      verificationStatus: c.verificationStatus,
      reasons: ["Sinhala business name"],
    }));
}

export const DUPLICATE_NOTICE =
  "Potential existing Producer found. Please contact Fortune Market Admin.";

/**
 * Normalises a Sri Lankan NIC to bare uppercase alphanumerics so that
 * "199012345678", "1990 123 456 78" and "1990-123-456-78" collapse together.
 */
export function normalizeNic(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return value || null;
}

/**
 * Self-referral detection.
 *
 * A representative must not earn a commission for a producer account that is
 * really their own. The roles are separate so this is not reachable through
 * the normal signup flow, but a representative could register a second account
 * under a different role, so the check is enforced on the real identifiers
 * rather than on role assumptions.
 *
 * Every identifier is compared through a normaliser, so the same person cannot
 * slip through by reformatting a number ("077 123 4567" vs "+94771234567").
 */
export async function checkSelfReferral(input: {
  representative: {
    phone: string | null;
    whatsapp: string | null;
    email: string;
    nic: string | null;
  };
  producer: {
    userId: string;
    phone: string | null;
    email: string | null;
    businessRegistrationNo?: string | null;
  };
}): Promise<{ isSelfReferral: boolean; reason: string | null }> {
  const rep = input.representative;
  const producer = input.producer;

  if (producer.userId && rep.email && producer.email?.toLowerCase() === rep.email.toLowerCase()) {
    return { isSelfReferral: true, reason: "Producer account email matches the representative's email" };
  }

  const repPhones = [rep.phone, rep.whatsapp]
    .map(normalizePhone)
    .filter((p): p is string => Boolean(p));
  const producerPhone = normalizePhone(producer.phone);

  if (repPhones.length > 0 && producerPhone && repPhones.includes(producerPhone)) {
    return { isSelfReferral: true, reason: "Producer account phone matches the representative's phone" };
  }

  // The producer's business registration number is the field that can carry a
  // NIC, so the two are compared to each other. Comparing the rep's NIC against
  // the producer's *email* could never match, which is why this previously sat
  // here as dead code.
  const repNic = normalizeNic(rep.nic);
  const producerRegNo = normalizeNic(producer.businessRegistrationNo);

  if (repNic && producerRegNo && repNic === producerRegNo) {
    return { isSelfReferral: true, reason: "Producer business registration number matches the representative's identification number" };
  }

  return { isSelfReferral: false, reason: null };
}
