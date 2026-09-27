"use client";

import { ApplicationsTab } from "@/components/admin/applications-tab";
import { GuideTab } from "@/components/admin/guide-tab";
import { PaymentsTab } from "@/components/admin/payments-tab";
import { PayoutsTab } from "@/components/admin/payouts-tab";
import { RepresentativesTab } from "@/components/admin/representatives-tab";
import { SettingsTab } from "@/components/admin/settings-tab";

export type RepresentativeAdminTab =
  | "applications"
  | "payments"
  | "payouts"
  | "representatives"
  | "settings"
  | "guide";

export function RepresentativeAdmin({ tab }: { tab: RepresentativeAdminTab }) {
  if (tab === "applications") return <ApplicationsTab />;
  if (tab === "payments") return <PaymentsTab />;
  if (tab === "payouts") return <PayoutsTab />;
  if (tab === "settings") return <SettingsTab />;
  if (tab === "guide") return <GuideTab />;
  return <RepresentativesTab />;
}
