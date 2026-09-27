import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getEarningSummary, listPayableCommissions } from "@/lib/commission";
import { listPayoutsForRepresentative } from "@/lib/payout";
import { prisma } from "@/lib/prisma";

/**
 * A representative's own earnings view.
 *
 * There is no id in the path and no id in the query: the representative is read
 * from the session, so one signed-in representative cannot read another's
 * figures by editing a URL.
 */
export async function GET() {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "REPRESENTATIVE" || !session.user.representativeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rep = await prisma.representative.findUnique({
      where: { id: session.user.representativeId },
      select: {
        id: true,
        code: true,
        fullName: true,
        status: true,
        bankName: true,
        bankAccountName: true,
        // Masked: the representative can see which account it is, not the number.
        bankAccountNumber: true,
        bankBranch: true,
      },
    });
    if (!rep) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [summary, payable, payouts, commissions] = await Promise.all([
      getEarningSummary(rep.id),
      listPayableCommissions(rep.id),
      listPayoutsForRepresentative(rep.id),
      // The representative's own commission history. Without this the page can
      // only show how many are pending, and the rep has no way to tell which
      // producer a figure relates to. Scoped to their own id, as above.
      prisma.representativeCommission.findMany({
        where: { representativeId: rep.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          commissionCode: true,
          amount: true,
          currency: true,
          kind: true,
          status: true,
          flagged: true,
          flagReason: true,
          eligibleAt: true,
          approvedAt: true,
          createdAt: true,
          producer: { select: { businessName: true, district: true } },
        },
      }),
    ]);

    const maskAccount = (value: string | null | undefined) => {
      if (!value || value.length < 4) return null;
      return `****${value.slice(-4)}`;
    };

    return NextResponse.json({
      representative: {
        ...rep,
        bankAccountNumber: maskAccount(rep.bankAccountNumber),
      },
      summary,
      awaitingPayoutCount: payable.length,
      commissions,
      payouts,
    });
  } catch (error) {
    console.error("Representative earnings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
