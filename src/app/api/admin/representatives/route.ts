import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id, role: session.user.role };
}

/**
 * The representative roster.
 *
 * Account numbers are masked here. An admin making a transfer opens one
 * representative's readiness view, which is the single place the full number is
 * shown; a list of every representative's bank details is not needed to run the
 * programme and is a much larger leak if it ever gets screenshotted.
 */
function maskAccount(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\s/g, "");
  return digits.length <= 4 ? "****" : `****${digits.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const search = (req.nextUrl.searchParams.get("q") ?? "").trim();

    const reps = await prisma.representative.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        phone: true,
        district: true,
        status: true,
        statusReason: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankBranch: true,
        joinedAt: true,
        approvedAt: true,
        _count: { select: { leads: true, commissions: true, referrals: true, payouts: true } },
        // Unpaid balances, so an admin can sort out who is owed money without
        // opening each one. Only ever APPROVED/PAYABLE and never already inside
        // an active payout, which is the same rule the payout builder uses.
        commissions: {
          where: { status: { in: ["APPROVED", "PAYABLE"] } },
          select: { amount: true, status: true, flagged: true },
        },
      },
    });

    return NextResponse.json({
      representatives: reps.map((r) => {
        const unpaid = r.commissions
          .filter((c) => !c.flagged)
          // A commission in a PENDING or PAID payout is already spoken for, so
          // it must not be counted as still owed.
          .filter((c) => c.status === "APPROVED")
          .reduce((sum, c) => sum + c.amount, 0);

        return {
          id: r.id,
          code: r.code,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          district: r.district,
          status: r.status,
          statusReason: r.statusReason,
          bankName: r.bankName,
          bankAccountName: r.bankAccountName,
          bankAccountNumber: maskAccount(r.bankAccountNumber),
          bankBranch: r.bankBranch,
          joinedAt: r.joinedAt,
          approvedAt: r.approvedAt,
          counts: {
            leads: r._count.leads,
            commissions: r._count.commissions,
            referrals: r._count.referrals,
            payouts: r._count.payouts,
          },
          unpaidAmount: unpaid,
        };
      }),
    });
  } catch (error) {
    console.error("Representative roster error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
