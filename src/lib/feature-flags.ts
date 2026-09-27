export const featureFlags = {
  BUYER_ACCOUNTS: true,
  PRODUCER_ACCOUNTS: true,
  PRODUCTS: true,
  COD_ORDERS: true,
  ORDER_HISTORY: true,
  REVIEWS: true,
  BUYER_RELIABILITY: false,
  COMMISSION_SYSTEM: false,
  INTERNAL_CHAT: true,
  ONLINE_PAYMENTS: false,
  DELIVERY_SYSTEM: false,
  SELLER_SUBSCRIPTIONS: false,
  ADVERTISING: false,
  FORTUNE_CREATIVE: false,
  // Producer Acquisition Representative programme.
  // Distinct from COMMISSION_SYSTEM, which is the unrelated reseller scraper
  // toggle. Both start off; enable REPRESENTATIVE_SYSTEM only once the admin
  // surface is ready, so no public route is reachable in a half-built state.
  //
  // Enabled 2026-09-27: schema pushed, guide seeded, 194 verification checks
  // green. To hide the programme again set both to false — the admin page falls
  // back to the "not enabled" notice and every public route 404s.
  REPRESENTATIVE_SYSTEM: true,
  REPRESENTATIVE_APPLICATIONS: true,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag] === true;
}
