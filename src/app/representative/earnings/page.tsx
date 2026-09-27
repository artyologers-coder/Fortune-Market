import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getEarningSummary } from "@/lib/commission";
import { listPayoutsForRepresentative } from "@/lib/payout";
import { CommissionBadge } from "@/components/representative/commission-badge";

function money(amount: number) {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}

function date(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const PAYOUT_LABELS: Record<string, string> = {
  PENDING: "Being prepared",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  FAILED: "Failed — reissued",
};

export default async function RepresentativeEarningsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/login?callbackUrl=/representative/earnings");

  const rep = await prisma.representative.findUnique({ where: { userId: session.user.id } });
  if (!rep) redirect("/representative");

  const [summary, payouts, commissions] = await Promise.all([
    getEarningSummary(rep.id),
    listPayoutsForRepresentative(rep.id),
    prisma.representativeCommission.findMany({
      where: { representativeId: rep.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        commissionCode: true,
        amount: true,
        kind: true,
        status: true,
        flagged: true,
        flagReason: true,
        createdAt: true,
        producer: { select: { businessName: true, district: true } },
      },
    }),
  ]);

  const lifetimeEarned = Object.entries(summary.totals).reduce(
    (sum, [status, amount]) => (status === "CANCELLED" ? sum : sum + amount),
    0
  );
  const totalPaid = summary.totals.PAID ?? 0;
  const awaiting = commissions.filter(
    (c) => !c.flagged && (c.status === "APPROVED" || c.status === "PAYABLE")
  );

  return (
    <main className="page-container">
      <div className="mb-6">
        <Link href="/representative" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="section-title mt-2 !mb-1">Earnings</h1>
        <p className="text-gray-600">
          Every commission is recorded when a producer you referred is approved. A commission
          becomes payable once an admin has signed it off, and is paid when the transfer is sent.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Tile label="Lifetime earned" value={money(lifetimeEarned)} />
        <Tile label="Paid to your account" value={money(totalPaid)} accent />
        <Tile label="Awaiting payout" value={money(summary.payableBalance)} hint={`${awaiting.length} commission${awaiting.length === 1 ? "" : "s"}`} />
        <Tile
          label="Payout account"
          value={rep.bankAccountNumber ? `****${rep.bankAccountNumber.slice(-4)}` : "Not set"}
          hint={rep.bankName ?? undefined}
        />
      </div>

      {commissions.length === 0 ? (
        <div className="card p-8 text-center mb-8">
          <p className="text-gray-600">
            You have not earned any commission yet. Share your referral link and you will see it
            here as soon as a producer you referred is approved.
          </p>
          <Link href="/representative" className="btn-outline inline-block mt-4">
            Get your referral link
          </Link>
        </div>
      ) : (
        <section className="card mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Commissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Producer</th>
                  <th className="px-6 py-3 font-medium">Code</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3 text-gray-900">
                      {c.producer?.businessName ?? "—"}
                      {c.producer?.district ? (
                        <span className="text-gray-500"> · {c.producer.district}</span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs">{c.commissionCode}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {c.kind === "RENEWAL" ? "Renewal" : "Initial"}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {money(c.amount)}
                    </td>
                    <td className="px-6 py-3">
                      <CommissionBadge status={c.status} flagged={c.flagged} />
                      {c.flagged && c.flagReason && (
                        <p className="text-xs text-gray-500 mt-1 max-w-[16rem]">{c.flagReason}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{date(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Payouts</h2>
        </div>
        {payouts.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">
            No payouts yet. Once your commissions are approved they will be paid out in a batch.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {payouts.map((p) => (
              <div key={p.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {PAYOUT_LABELS[p.status] ?? p.status}
                    {p.method ? ` · ${p.method}` : ""}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.payoutCode} · {p.items.length} commission{p.items.length === 1 ? "" : "s"} ·
                    created {date(p.createdAt)}
                    {p.paidAt ? ` · paid ${date(p.paidAt)}` : ""}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </p>
                </div>
                <p className="font-semibold text-gray-900">{money(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Tile({
  label, value, hint, accent,
}: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? "text-accent-600" : "text-gray-900"}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
