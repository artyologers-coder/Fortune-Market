"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { RepresentativeAdmin } from "@/components/admin/representative-admin";

import type { RepresentativeAdminTab } from "@/components/admin/representative-admin";

type Tab = RepresentativeAdminTab;

const TABS: { id: Tab; label: string }[] = [
  { id: "applications", label: "Applications" },
  { id: "payments", label: "Payments" },
  { id: "payouts", label: "Payouts" },
  { id: "representatives", label: "Representatives" },
  { id: "settings", label: "Settings" },
  { id: "guide", label: "Guide" },
];

/**
 * Admin home for the representative programme.
 *
 * The session is checked client-side and the component renders nothing until it
 * resolves, so the tabs never flash for a non-admin. That is a usability guard,
 * not the security boundary — every API this page calls re-checks the role
 * server-side, so editing the client bundle grants nothing.
 */
export default function RepresentativeAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("applications");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login?callbackUrl=/admin/representatives");
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.push("/");
  }, [status, session, router]);

  if (status === "loading") {
    return <main className="page-container">Loading…</main>;
  }
  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return <main className="page-container">Checking permissions…</main>;
  }
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return (
      <main className="page-container max-w-3xl">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            The representative programme is not enabled
          </h1>
          <p className="text-gray-600">
            Turn on <code>REPRESENTATIVE_SYSTEM</code> in the feature flags to use these tools.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="mb-6">
        <a href="/admin" className="text-sm text-primary hover:underline">
          ← Back to admin
        </a>
        <h1 className="section-title mt-2 !mb-1">Representative programme</h1>
        <p className="text-gray-600">
          Applications, registration payments, commissions and payouts.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <RepresentativeAdmin tab={tab} />
    </main>
  );
}
