export interface ResellerScrapeResult {
  name: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  images: string[];
  sourceStock: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  siteName: string;
  sourceDomain: string;
  rawData: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
}

export type ScrapeOutcome = "ok" | "needsReview" | "failed";

export interface ScrapedProductWithOutcome {
  outcome: ScrapeOutcome;
  data: ResellerScrapeResult | null;
  missingFields: string[];
  error?: string;
}

export interface SyncResult {
  productId: string;
  status: "success" | "price_changed" | "stock_changed" | "both_changed" | "error" | "skipped_unreachable" | "skipped_price_threshold";
  message: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldStock: number | null;
  newStock: number | null;
  requiresReview: boolean;
}