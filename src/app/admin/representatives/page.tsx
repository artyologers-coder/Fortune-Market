"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
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

const TAB_IDS = TABS.map((t) => t.id);
const DEFAULT_TAB: Tab = "applications";

function isTab(value: string | null): value is Tab {
  return value !== null && (TAB_IDS as string[]).includes(value);
}

/**
 * Admin home for the representative programme.
 *
 * The session is checked client-side and the component renders nothing until it
 * resolves, so the tabs never flash for a non-admin. That is a usability guard,
 * not the security boundary — every API this page calls re-checks the role
 * server-side, so editing the client bundle grants nothing.
 *
 * The active tab lives in `?tab=`, so a specific tab can be linked to and the
 * back button works. An unrecognised `?tab=` falls back to Applications rather
 * than rendering an empty page.
 */
export default function RepresentativeAdminPage() {
  return (
    <Suspense fallback={<main className="page-container">Loading…</main>}>
      <RepresentativeAdminView />
    </Suspense>
  );
}

function RepresentativeAdminView() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requested) ? requested : DEFAULT_TAB);

  useEffect(() => {
    if (status === "unauthenticated") {
      const callback = encodeURIComponent(
        requested && isTab(requested)
          ? `${pathname}?tab=${requested}`
          : pathname
      );
      router.push(`/auth/login?callbackUrl=${callback}`);
    }
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.push("/");
  }, [status, session, router, pathname, requested]);

  // Follow the URL when it changes from outside this page (back/forward, or a
  // shared link), so the tab shown always matches the address bar.
  useEffect(() => {
    setTab(isTab(requested) ? requested : DEFAULT_TAB);
  }, [requested]);

  const selectTab = useCallback(
    (next: Tab) => {
      setTab(next);
      // replace rather than push: switching tabs is navigation within one page,
      // and pushing would make the back button step through every tab visited.
      router.replace(next === DEFAULT_TAB ? pathname : `${pathname}?tab=${next}`, {
        scroll: false,
      });
    },
    [router, pathname]
  );

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
            onClick={() => selectTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
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
