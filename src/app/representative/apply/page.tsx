import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getSettings } from "@/lib/representative-settings";
import { prisma } from "@/lib/prisma";
import { ApplicationForm } from "@/components/representative/application-form";

/**
 * Public entry point for the representative programme.
 *
 * The fee split is read from the settings singleton rather than hardcoded, so a
 * change an admin makes in settings shows here immediately and cannot drift
 * from what a producer is actually charged.
 *
 * Rendered per request, deliberately. This page is session-dependent — it
 * redirects someone who is already a representative to their dashboard — and
 * it displays admin-editable money figures. Without this, Next.js sees only the
 * compile-time feature flag (the first thing the component evaluates), never
 * reaches getServerSession, and pre-renders the whole page at build time. That
 * froze two things at once: the fee split would only change on a rebuild, and
 * the already-a-representative redirect would never fire, because it had
 * already run once during the build with no session. A page quoting a rupee
 * amount to prospective applicants has to be right per request, not per build.
 */
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  if (!isFeatureEnabled("REPRESENTATIVE_APPLICATIONS")) {
    return (
      <main className="page-container max-w-3xl">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Applications are not open right now
          </h1>
          <p className="text-gray-600">
            The producer acquisition representative programme is not currently accepting
            applications. Please check back soon.
          </p>
        </div>
      </main>
    );
  }

  const session = await getServerSession(authOptions);

  // Someone who already applied has nothing to do here. Sending them to the
  // dashboard is more useful than showing a form that will be rejected.
  if (session?.user?.role === "REPRESENTATIVE") {
    const rep = await prisma.representative.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (rep) redirect("/representative");
  }

  const settings = await getSettings();
  const commissionShare = settings.representativeInitialCommission;
  const marketShare = settings.fortuneMarketInitialAllocation;
  const producerFee = settings.producerAnnualRegistrationFee;

  return (
    <main className="page-container max-w-4xl">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold text-accent-600 uppercase tracking-wide">
          Fortune Market
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">
          Become a Producer Acquisition Representative
        </h1>
        <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
          Introduce Sri Lankan producers to Fortune Market, help them get set up, and earn{" "}
          <span className="font-semibold text-primary">
            Rs. {commissionShare.toLocaleString("en-LK")}
          </span>{" "}
          every time one you referred is approved. You keep that commission for as long as
          they stay registered.
        </p>
        <p className="text-sm text-gray-600 mt-4">
          Not sure yet?{" "}
          <a href="/representative/guide" className="text-primary hover:underline font-medium">
            Read the representative guide
          </a>{" "}
          first — it explains commission rules and how you get paid.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-2xl font-bold text-primary">
            Rs. {commissionShare.toLocaleString("en-LK")}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Your commission for each approved producer you refer.
          </p>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-accent-600">
            Rs. {producerFee.toLocaleString("en-LK")}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            What each producer pays to join. You never handle this money.
          </p>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-primary">
            Rs. {marketShare.toLocaleString("en-LK")}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Fortune Market&apos;s share of every referral fee. The split is fixed.
          </p>
        </div>
      </div>

      <div className="card p-6 md:p-8 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">How it works</h2>
        <ol className="space-y-4">
          {[
            {
              title: "Apply below",
              body: "It takes a few minutes. You choose a password now, so your account is ready the moment you are approved.",
            },
            {
              title: "We review your application",
              body: "An admin checks your details and bank information. If anything is unclear we will ask you for it.",
            },
            {
              title: "Get your personal referral link",
              body:
                "Once approved you get a personal referral link and a QR code to share. Anyone who joins through it is attributed to you automatically.",
            },
            {
              title: "Introduce producers and earn",
              body: "When a producer you referred is approved, your commission is recorded and appears in your earnings.",
            },
          ].map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm">
                {i + 1}
              </span>
              <div>
                <div className="font-semibold text-gray-900">{step.title}</div>
                <p className="text-sm text-gray-600 mt-0.5">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Your application</h2>
        <p className="text-sm text-gray-600 mb-6">
          Fields marked <span className="text-red-500">*</span> are required. We only use
          these details to administer the programme and to pay your commission.
        </p>
        <ApplicationForm />
      </div>
    </main>
  );
}
