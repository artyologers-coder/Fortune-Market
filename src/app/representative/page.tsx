import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getEarningSummary } from "@/lib/commission";
import { getLeadCounts } from "@/lib/representative-lead";
import { canConvertReferrals } from "@/lib/representative-guard";
import { CopyButton } from "@/components/representative/copy-button";
import { CommissionBadge } from "@/components/representative/commission-badge";

function money(amount: number) {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}

function maskAccount(n: string | null | undefined) {
  if (!n) return null;
  const trimmed = n.replace(/\s/g, "");
  return trimmed.length <= 4 ? "****" : `****${trimmed.slice(-4)}`;
}

export default async function RepresentativeDashboard() {
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect("/auth/login?callbackUrl=/representative");
  if (session.user.role !== "REPRESENTATIVE") notFound();

  // The representative is resolved by session, never by a route parameter, so
  // one representative cannot read another's dashboard by editing a URL.
  const rep = await prisma.representative.findUnique({ where: { userId: session.user.id } });
  if (!rep) {
    return (
      <main className="page-container max-w-3xl">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Your application is still under review
          </h1>
          <p className="text-gray-600 mb-6">
            You can sign in, but your representative account is not active yet. An admin will
            review your application and you will be notified once it is approved.
          </p>
          <Link href="/representative/apply" className="btn-outline">
            View application details
          </Link>
        </div>
      </main>
    );
  }

  const [earnings, leadCounts, referralCount, recentCommissions] = await Promise.all([
    getEarningSummary(rep.id),
    getLeadCounts(rep.id),
    prisma.producerReferral.count({ where: { representativeId: rep.id } }),
    prisma.representativeCommission.findMany({
      where: { representativeId: rep.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        commissionCode: true,
        amount: true,
        status: true,
        flagged: true,
        flagReason: true,
        createdAt: true,
        producer: { select: { businessName: true, district: true } },
      },
    }),
  ]);

  // A CANCELLED commission was reversed or voided, so it is not money the
  // representative ever held. Everything else — including ELIGIBLE and APPROVED
  // — is genuinely earned and only the payment step is outstanding.
  const lifetimeEarned = Object.entries(earnings.totals).reduce(
    (sum, [status, amount]) => (status === "CANCELLED" ? sum : sum + amount),
    0
  );
  const totalPaid = earnings.totals.PAID ?? 0;

  const suspended = rep.status === "SUSPENDED";
  const inactive = rep.status === "INACTIVE";
  const canRefer = canConvertReferrals({ status: rep.status });

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Hello, {rep.fullName.split(" ")[0]}
          </h1>
          <p className="text-gray-600 mt-1">
            Representative {rep.code} · {rep.district}
            {rep.preferredArea ? ` · ${rep.preferredArea}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/representative/leads" className="btn-outline !py-2 !px-4 text-sm">
            My leads
          </Link>
          <Link href="/representative/earnings" className="btn-primary !py-2 !px-4 text-sm">
            Earnings
          </Link>
        </div>
      </div>

      {(suspended || inactive) && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-6">
          <span className="font-semibold">
            Your account is {rep.status.toLowerCase()}.
          </span>{" "}
          {rep.statusReason ?? "Please contact Fortune Market Admin."}{" "}
          You can still view your records and commission history.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-sm text-gray-500">Lifetime earned</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {money(lifetimeEarned)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Paid out</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{money(totalPaid)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Available to be paid</p>
          <p className="text-2xl font-bold text-accent-600 mt-1">
            {money(earnings.payableBalance)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Not in a payout yet</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Open leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{leadCounts.open}</p>
          <p className="text-xs text-gray-500 mt-1">{leadCounts.total} recorded in total</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your referral link</h2>
            {canRefer ? (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Send producers this link. Anyone who registers a producer business through it is
                  automatically attributed to you, and you keep the credit.
                </p>
                <ReferralLink code={rep.code} />
              </>
            ) : (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                Your referral link is not currently active because your account is{" "}
                {rep.status.toLowerCase()}. Existing records are still available to you.
              </p>
            )}
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent commissions</h2>
              <Link href="/representative/earnings" className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
            {recentCommissions.length === 0 ? (
              <p className="text-sm text-gray-500">
                No commissions yet. You earn when a producer you referred is approved.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentCommissions.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {c.producer?.businessName ?? "Producer"}
                        {c.producer?.district ? (
                          <span className="text-gray-500 font-normal"> · {c.producer.district}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.commissionCode} ·{" "}
                        {new Date(c.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{money(c.amount)}</p>
                      <CommissionBadge status={c.status} flagged={c.flagged} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout account</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Bank</dt>
                <dd className="text-gray-900 font-medium">{rep.bankName ?? "Not provided"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Account name</dt>
                <dd className="text-gray-900 font-medium">
                  {rep.bankAccountName ?? "Not provided"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Account number</dt>
                <dd className="text-gray-900 font-medium">
                  {maskAccount(rep.bankAccountNumber) ?? "Not provided"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Branch</dt>
                <dd className="text-gray-900 font-medium">{rep.bankBranch ?? "Not provided"}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500 mt-4">
              If these details are wrong, contact Fortune Market Admin before your next payout.
            </p>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your activity</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Producers referred</dt>
                <dd className="font-semibold text-gray-900">{referralCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Leads converted</dt>
                <dd className="font-semibold text-gray-900">{leadCounts.converted}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Member since</dt>
                <dd className="font-semibold text-gray-900">
                  {new Date(rep.joinedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

function ReferralLink({ code }: { code: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <code className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm break-all">
          /r/{code}
        </code>
        <CopyButton path={`/r/${code}`} label="Copy link" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-gray-500">Your code</span>
        <code className="text-sm font-semibold text-gray-900 tracking-wide">{code}</code>
      </div>
      <p className="text-xs text-gray-500">
        The copied link is absolute, so it works for anyone you send it to. This code is permanent:
        never delete a record that uses it, and do not share your login details with anyone.
      </p>
    </div>
  );
}
