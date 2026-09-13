export const FORTUNE_MARKET_DOMAIN = "https://fortunemarket.lk";

export function productShareUrl(key: string): string {
  const utm = new URLSearchParams({
    utm_source: "product_share",
    utm_medium: "social",
    utm_campaign: "fortune_market",
    utm_content: key,
  });
  return `${FORTUNE_MARKET_DOMAIN}/product/${key}?${utm.toString()}`;
}