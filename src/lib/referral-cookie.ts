import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { canConvertReferrals } from "@/lib/representative-guard";

/**
 * Referral attribution.
 *
 * When a producer lands on /register/producer?ref=FM-REP-00001 the code is
 * stashed in a signed, HttpOnly cookie. Registration then reads the cookie
 * inside the same transaction that creates the Producer and writes a locked
 * `ProducerReferral`.
 *
 * The signature matters: without it, a visitor could edit the cookie to name
 * any representative code they liked and claim the commission. The cookie is
 * signed with NEXTAUTH_SECRET, which is already required to be present and
 * secret, so no additional key management is introduced.
 *
 * Note the cookie is HttpOnly on purpose — a referral is an acquisition
 * channel, not something a visitor is meant to read or share. The rep's own
 * dashboard renders the link server-side for them to copy or print as a QR.
 */

export const REFERRAL_COOKIE = "fm_referral";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type ReferralPayload = {
  /** Representative public code, e.g. FM-REP-00001. */
  code: string;
  /** Lead that produced this visit, when known. Enables funnel attribution. */
  leadId?: string | null;
  issuedAt: number;
};

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error(
      "NEXTAUTH_SECRET is not set; referral cookies cannot be signed or verified."
    );
  }
  return value;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function encodeReferralPayload(payload: ReferralPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Returns the decoded payload, or null for anything that is not a payload we
 * signed. Never throws on malformed input — a bad cookie is simply treated as
 * no referral, which is the safe direction (the producer registers unreferred
 * and, if the gate is closed, is correctly charged).
 */
export function decodeReferralCookie(raw?: string | null): ReferralPayload | null {
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as ReferralPayload).code !== "string" ||
    typeof (payload as ReferralPayload).issuedAt !== "number"
  ) {
    return null;
  }

  const typed = payload as ReferralPayload;
  if (Date.now() / 1000 - typed.issuedAt > MAX_AGE_SECONDS) {
    return null;
  }

  return typed;
}

export function setReferralCookie(
  code: string,
  options: { leadId?: string | null } = {}
): void {
  const payload: ReferralPayload = {
    code,
    leadId: options.leadId ?? null,
    issuedAt: Math.floor(Date.now() / 1000),
  };

  cookies().set(REFERRAL_COOKIE, encodeReferralPayload(payload), {
    httpOnly: true,
    // Lax rather than Strict: the producer commonly arrives from a rep's
    // WhatsApp message in another app, and Strict would drop the cookie on
    // that cross-site top-level navigation.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearReferralCookie(): void {
  cookies().set(REFERRAL_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getReferralPayload(): ReferralPayload | null {
  return decodeReferralCookie(cookies().get(REFERRAL_COOKIE)?.value);
}

export type ResolvedReferral = {
  id: string;
  code: string;
  fullName: string;
  district: string;
  status: string;
  leadId: string | null;
  /** False for suspended/inactive reps: the visit is recorded, no attribution. */
  canConvert: boolean;
};

export async function resolveReferralCode(
  code: string | null | undefined,
  leadId?: string | null
): Promise<ResolvedReferral | null> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;

  const representative = await prisma.representative.findUnique({
    where: { code: normalized },
    select: { id: true, code: true, fullName: true, district: true, status: true },
  });

  if (!representative) return null;

  return { ...representative, leadId: leadId ?? null, canConvert: canConvertReferrals(representative) };
}

/**
 * Reads and resolves the referral cookie in one step. This is the function the
 * producer signup transaction calls.
 */
export async function getResolvedReferralFromCookies(): Promise<ResolvedReferral | null> {
  const payload = getReferralPayload();
  if (!payload) return null;
  return resolveReferralCode(payload.code, payload.leadId);
}
