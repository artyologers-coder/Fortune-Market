import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setReferralCookie } from "@/lib/referral-cookie";
import { canConvertReferrals } from "@/lib/representative-guard";
import { rateLimit } from "@/lib/rate-limit";
import { featureUnavailable } from "@/lib/feature-guard";

export const dynamic = "force-dynamic";

/**
 * Referral capture: the short link a representative shares.
 *
 *   /r/FM-REP-00012            -> sets the referral cookie, sends them to register
 *   /r/FM-REP-00012?lead=<id>  -> also ties the visit to a specific lead
 *
 * This is the only place the referral cookie is written from a link, which is
 * what makes the whole attribution flow reachable at all.
 *
 * Two deliberate choices:
 *
 *  - A dead, unknown or suspended link does NOT block registration. The visitor
 *    is sent through to the producer form with a flag explaining why there is no
 *    referral, because refusing to let someone register over a broken link would
 *    be punishing them for our bug and would lose a legitimate producer.
 *
 *  - A suspended or inactive representative gets NO cookie. The visit is
 *    recorded as unattributed rather than attributed to someone who is not
 *    allowed to earn, so the representative's link still works as a plain
 *    invitation without creating a commission path.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const unavailable = featureUnavailable("REPRESENTATIVE_SYSTEM");
  if (unavailable) return unavailable;

  // Rate limited per IP: this endpoint is unauthenticated and takes a guessable
  // sequential code, so without a limit it doubles as a code-enumeration oracle
  // and a way to hammer the database.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limited = await rateLimit(`referral-capture:${ip}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!limited.allowed) {
    return NextResponse.redirect(
      new URL("/producer/onboarding?ref=rate-limited", req.url),
      307
    );
  }

  const code = params.code?.trim().toUpperCase() ?? "";

  const representative = await prisma.representative.findUnique({
    where: { code },
    select: { id: true, code: true, status: true },
  });

  const onboarding = (ref: string) =>
    NextResponse.redirect(new URL(`/producer/onboarding?ref=${ref}`, req.url), 307);

  if (!representative) {
    return onboarding("invalid");
  }

  if (!canConvertReferrals(representative)) {
    return onboarding("inactive");
  }

  // A lead id is only honoured when it actually belongs to this representative.
  // Without that check, any visitor could name somebody else's lead id and have
  // it silently closed by the registration flow.
  const leadId = req.nextUrl.searchParams.get("lead");
  let validLeadId: string | null = null;
  if (leadId) {
    const lead = await prisma.representativeLead.findFirst({
      where: { id: leadId, representativeId: representative.id },
      select: { id: true },
    });
    validLeadId = lead?.id ?? null;
  }

  setReferralCookie(representative.code, { leadId: validLeadId });

  return onboarding(representative.code);
}
