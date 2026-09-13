export const FORTUNE_MARKET_DOMAIN = "https://fortunemarket.lk";

export function productShareUrl(key: string): string {
  return `${FORTUNE_MARKET_DOMAIN}/product/${key}`;
}