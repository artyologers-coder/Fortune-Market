import { PrismaClient } from "@prisma/client";
import { scrapeProductUrl, updateDomainProfile } from "@/lib/reseller/scraper";
import { computeSellingPrice } from "@/lib/reseller/markup";
import { SyncResult } from "@/lib/reseller/types";

const prisma = new PrismaClient();

const PRICE_CHANGE_THRESHOLD = parseFloat(process.env.PRICE_CHANGE_THRESHOLD_PERCENT || "20");
const FAIL_BACKOFF_MINUTES = parseInt(process.env.RESYNC_FAIL_BACKOFF_MINUTES || "360", 10);

export async function syncResellerSource(source: {
  id: string;
  productId: string;
  sourceUrl: string;
  sourceDomain: string;
  sourcePrice: number;
  sourceStock: number | null;
  sourceStatus: string;
  syncFailCount: number;
}): Promise<SyncResult> {
  const product = await prisma.product.findUnique({
    where: { id: source.productId },
    select: { id: true, price: true, externalPrice: true, externalStock: true, active: true, syncStatus: true, categoryId: true },
  });

  if (!product) {
    return {
      productId: source.productId,
      status: "error",
      message: "Product not found",
      oldPrice: null,
      newPrice: null,
      oldStock: null,
      newStock: null,
      requiresReview: false,
    };
  }

  if (source.sourceStatus === "UNREACHABLE") {
    const lastSync = source.syncFailCount > 0 ? new Date() : new Date();
    const hoursSinceLastSync = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSync < FAIL_BACKOFF_MINUTES / 60) {
      return {
        productId: source.productId,
        status: "skipped_unreachable",
        message: "Backing off after consecutive failures",
        oldPrice: product.externalPrice,
        newPrice: null,
        oldStock: source.sourceStock,
        newStock: null,
        requiresReview: false,
      };
    }
  }

  const scrapeResult = await scrapeProductUrl(source.sourceUrl);

  if (scrapeResult.outcome === "failed") {
    const newFailCount = source.syncFailCount + 1;
    const newStatus = newFailCount >= 3 ? "UNREACHABLE" : source.sourceStatus;

    await prisma.resellerSource.update({
      where: { id: source.id },
      data: {
        syncFailCount: newFailCount,
        lastSyncError: scrapeResult.error || "Scraping failed",
        sourceStatus: newStatus,
      },
    });

    await prisma.product.update({
      where: { id: source.productId },
      data: { syncStatus: "error" },
    });

    await prisma.stockSyncLog.create({
      data: {
        productId: source.productId,
        status: "error",
        message: scrapeResult.error || "Scraping failed",
        oldPrice: product.externalPrice,
        newPrice: null,
        oldStock: source.sourceStock?.toString() || null,
        newStock: null,
      },
    });

    return {
      productId: source.productId,
      status: "error",
      message: scrapeResult.error || "Scraping failed",
      oldPrice: product.externalPrice,
      newPrice: null,
      oldStock: source.sourceStock,
      newStock: null,
      requiresReview: false,
    };
  }

  if (scrapeResult.outcome === "needsReview") {
    await prisma.resellerSource.update({
      where: { id: source.id },
      data: {
        sourceRawData: JSON.stringify(scrapeResult.data?.rawData || {}),
        lastScrapedAt: new Date(),
        requiresReview: true,
        lastSyncError: "Low confidence - needs manual review",
      },
    });

    return {
      productId: source.productId,
      status: "error",
      message: "Low confidence - needs manual review",
      oldPrice: product.externalPrice,
      newPrice: scrapeResult.data?.price ?? null,
      oldStock: source.sourceStock,
      newStock: scrapeResult.data?.sourceStock ?? null,
      requiresReview: true,
    };
  }

  const data = scrapeResult.data!;
  const priceChanged = data.price !== null && data.price !== source.sourcePrice;
  const stockChanged = data.sourceStock !== source.sourceStock;

  let status: SyncResult["status"] = "success";
  let message = "Stock status synced";

  if (priceChanged && stockChanged) {
    status = "both_changed";
    message = `Price changed: Rs.${source.sourcePrice} → Rs.${data.price}, Stock: ${source.sourceStock} → ${data.sourceStock}`;
  } else if (priceChanged) {
    status = "price_changed";
    message = `Price changed: Rs.${source.sourcePrice} → Rs.${data.price}`;
  } else if (stockChanged) {
    status = "stock_changed";
    message = `Stock changed: ${source.sourceStock} → ${data.sourceStock}`;
  }

  let requiresReview = false;
  let newSourcePrice = source.sourcePrice;

  if (priceChanged && data.price !== null) {
    const changePercent = Math.abs((data.price - source.sourcePrice) / source.sourcePrice) * 100;
    if (changePercent > PRICE_CHANGE_THRESHOLD) {
      status = "skipped_price_threshold";
      message = `Price change ${changePercent.toFixed(1)}% exceeds threshold (${PRICE_CHANGE_THRESHOLD}%) - flagged for review`;
      requiresReview = true;
    } else {
      newSourcePrice = data.price;
    }
  }

  const newSourceStock = data.sourceStock ?? source.sourceStock;
  const newSourceStatus = newSourceStock === 0 ? "OUT_OF_STOCK" : "ACTIVE";
  const newProductActive = newSourceStock !== 0;

  const updateData: Record<string, unknown> = {
    lastScrapedAt: new Date(),
    sourcePrice: newSourcePrice,
    sourceStock: newSourceStock,
    sourceStatus: newSourceStatus,
    syncFailCount: 0,
    lastSyncError: null,
    sourceRawData: JSON.stringify(data.rawData),
    requiresReview,
  };

  await prisma.resellerSource.update({
    where: { id: source.id },
    data: updateData,
  });

  const category = await prisma.category.findUnique({
    where: { id: product.categoryId },
    select: { markupPercentage: true },
  });

  const markup = category?.markupPercentage ?? 15;
  const sellingPrice = data.price !== null ? computeSellingPrice(data.price, markup) : product.price;

  await prisma.product.update({
    where: { id: source.productId },
    data: {
      price: sellingPrice,
      externalPrice: data.price,
      externalStock: data.availability,
      syncStatus: "active",
      lastSyncAt: new Date(),
      active: newProductActive,
    },
  });

  await prisma.stockSyncLog.create({
    data: {
      productId: source.productId,
      status,
      message,
      oldPrice: product.externalPrice,
      newPrice: data.price,
      oldStock: source.sourceStock?.toString() || null,
      newStock: data.sourceStock?.toString() || null,
    },
  });

  return {
    productId: source.productId,
    status,
    message,
    oldPrice: product.externalPrice,
    newPrice: data.price,
    oldStock: source.sourceStock,
    newStock: data.sourceStock,
    requiresReview,
  };
}

export async function runResyncPass(): Promise<SyncResult[]> {
  const sources = await prisma.resellerSource.findMany({
    where: {
      sourceStatus: { not: "REMOVED" },
    },
    orderBy: { lastScrapedAt: "asc" },
  });

  const results: SyncResult[] = [];

  for (const source of sources) {
    const result = await syncResellerSource({
      id: source.id,
      productId: source.productId,
      sourceUrl: source.sourceUrl,
      sourceDomain: source.sourceDomain,
      sourcePrice: source.sourcePrice,
      sourceStock: source.sourceStock,
      sourceStatus: source.sourceStatus,
      syncFailCount: source.syncFailCount,
    });
    results.push(result);

    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}