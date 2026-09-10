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
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag] === true;
}
