export const featureFlags = {
  BUYER_ACCOUNTS: true,
  PRODUCER_ACCOUNTS: true,
  PRODUCTS: true,
  COD_ORDERS: true,
  ORDER_HISTORY: true,
  REVIEWS: true,
  BUYER_RELIABILITY: true,
  COMMISSION_SYSTEM: true,
  INTERNAL_CHAT: false,
  ONLINE_PAYMENTS: false,
  DELIVERY_SYSTEM: false,
  SELLER_SUBSCRIPTIONS: false,
  ADVERTISING: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag] === true;
}
