import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { csvResponse } from "@/lib/csv";
import { OPEN_PAYOUT_STATUSES } from "@/lib/commission";

/**
 * Representative roster as a CSV.
 *
 * The account number is deliberately absent, not masked. A CSV is the easiest
 * file in this system to email, upload, or paste into a spreadsheet, so a
 * partially-masked number in an export tends to get un-masked by whoever
 * receives it. If a transfer genuinely needs the number, that is a per-person
 * action on the payout readiness screen, where the admin is about to act on
 * exactly one account.
 */
export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;

    const reps = await prisma.representative.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
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
        bankBranch: true,
        joinedAt: true,
        approvedAt: true,
        _count: { select: { leads: true, commissions: true, referrals: true, payouts: true } },
        commissions: {
          where: { status: { in: ["APPROVED", "PAYABLE"] }, payoutItems: { none: { payout: { status: { in: [...OPEN_PAYOUT_STATUSES] } } } } },
          select: { amount: true },
        },
      },
    });

    // Lifetime totals need their own pass: `commissions` above is filtered to
    // what is currently unpaid, so summing it twice would report the same figure
    // as both "unpaid" and "lifetime".
    const lifetime = await prisma.representativeCommission.groupBy({
      by: ["representativeId"],
      where: { representativeId: { in: reps.map((r) => r.id) }, status: { not: "REVERSED" } },
      _sum: { amount: true },
    });
    const lifetimeByRep = new Map(lifetime.map((l) => [l.representativeId, l._sum.amount ?? 0]));

    const rows = reps.map((r) => ({
      code: r.code,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      district: r.district,
      status: r.status,
      statusReason: r.statusReason ?? "",
      bankName: r.bankName ?? "",
      bankAccountName: r.bankAccountName ?? "",
      bankBranch: r.bankBranch ?? "",
      joinedAt: r.joinedAt.toISOString(),
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : "",
      leads: r._count.leads,
      commissions: r._count.commissions,
      referrals: r._count.referrals,
      payouts: r._count.payouts,
      unpaidAmount: r.commissions.reduce((sum, c) => sum + c.amount, 0),
      lifetimeCommission: lifetimeByRep.get(r.id) ?? 0,
    }));

    return csvResponse(
      rows,
      [
        { header: "Code", value: (r) => r.code },
        { header: "Full name", value: (r) => r.fullName },
        { header: "Email", value: (r) => r.email },
        { header: "Phone", value: (r) => r.phone },
        { header: "District", value: (r) => r.district },
        { header: "Status", value: (r) => r.status },
        { header: "Status reason", value: (r) => r.statusReason },
        { header: "Bank", value: (r) => r.bankName },
        { header: "Account name", value: (r) => r.bankAccountName },
        { header: "Branch", value: (r) => r.bankBranch },
        { header: "Joined", value: (r) => r.joinedAt },
        { header: "Approved", value: (r) => r.approvedAt },
        { header: "Leads", value: (r) => r.leads },
        { header: "Commissions", value: (r) => r.commissions },
        { header: "Referrals", value: (r) => r.referrals },
        { header: "Payouts", value: (r) => r.payouts },
        { header: "Unpaid amount", value: (r) => r.unpaidAmount },
        { header: "Lifetime commission", value: (r) => r.lifetimeCommission },
      ],
      "fortune-market-representatives"
    );
  } catch (error) {
    console.error("Representative CSV export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
