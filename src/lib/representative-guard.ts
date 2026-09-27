import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

/**
 * Server-side authorisation for the representative surface.
 *
 * The representative is ALWAYS resolved from the authenticated session and
 * never from a request body, query string or route parameter. That is what
 * makes IDOR structurally impossible here rather than merely unlikely: there
 * is no code path where a caller can nominate whose data they are asking for.
 */

export class RepresentativeGuardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RepresentativeGuardError";
    this.status = status;
  }
}

export function representativeGuardErrorResponse(e: unknown) {
  if (e instanceof RepresentativeGuardError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("Representative guard error:", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export type GuardedRepresentative = NonNullable<
  Awaited<ReturnType<typeof prisma.representative.findUnique>>
>;

/**
 * Resolves the representative for the current session. Throws unless the caller
 * is an authenticated representative — any status.
 *
 * Use for read-only surfaces: a suspended or deactivated representative keeps
 * access to their own history, per the status policy.
 */
export async function requireRepresentative(): Promise<GuardedRepresentative> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId || role !== "REPRESENTATIVE") {
    throw new RepresentativeGuardError(401, "Unauthorized");
  }

  const representative = await prisma.representative.findUnique({
    where: { userId },
  });

  if (!representative) {
    throw new RepresentativeGuardError(
      403,
      "Your representative account is not active yet. Please contact Fortune Market Admin."
    );
  }

  return representative;
}

/**
 * As above, but additionally requires status ACTIVE.
 *
 * Use for anything that creates data or acquires producers: creating leads,
 * and anything that depends on the referral link still converting. A suspended
 * representative can see what they earned but cannot add to it.
 */
export async function requireActiveRepresentative(): Promise<GuardedRepresentative> {
  const representative = await requireRepresentative();

  if (representative.status !== "ACTIVE") {
    throw new RepresentativeGuardError(
      403,
      representative.status === "SUSPENDED"
        ? "Your representative account is suspended, so you cannot create new leads or use your referral link. Your existing records and commission history are still available. Please contact Fortune Market Admin."
        : "Your representative account is inactive. Please contact Fortune Market Admin."
    );
  }

  return representative;
}

/**
 * True when the representative may still convert a referral — i.e. the code in
 * a link is real and the account can still acquire producers. Used when
 * resolving a referral code on a public page.
 */
export function canConvertReferrals(representative: {
  status: string;
}): boolean {
  return representative.status === "ACTIVE";
}
