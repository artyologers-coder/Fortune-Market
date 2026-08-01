import { prisma } from "./prisma";
import { scrapeProduct, ScrapedProduct } from "./url-scraper";

export interface SyncResult {
  productId: string;
  status: "success" | "error" | "price_changed" | "stock_changed" | "both_changed";
  message: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldStock: string | null;
  newStock: string | null;
}

export async function syncProduct(productId: string): Promise<SyncResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    return {
      productId,
      status: "error",
      message: "Product not found",
      oldPrice: null,
      newPrice: null,
      oldStock: null,
      newStock: null,
    };
  }

  if (!product.sourceUrl) {
    return {
      productId,
      status: "error",
      message: "No source URL configured",
      oldPrice: null,
      newPrice: null,
      oldStock: null,
      newStock: null,
    };
  }

  try {
    const scraped = await scrapeProduct(product.sourceUrl);

    const priceChanged =
      scraped.price !== null && scraped.price !== product.externalPrice;
    const stockChanged =
      scraped.availability !== product.externalStock;

    let status: SyncResult["status"] = "success";
    let message = "Stock status synced";

    if (priceChanged && stockChanged) {
      status = "both_changed";
      message = `Price changed: Rs.${product.externalPrice} → Rs.${scraped.price}, Stock: ${product.externalStock} → ${scraped.availability}`;
    } else if (priceChanged) {
      status = "price_changed";
      message = `Price changed: Rs.${product.externalPrice} → Rs.${scraped.price}`;
    } else if (stockChanged) {
      status = "stock_changed";
      message = `Stock changed: ${product.externalStock} → ${scraped.availability}`;
    }

    const updateData: Record<string, unknown> = {
      lastSyncAt: new Date(),
      externalStock: scraped.availability,
      syncStatus: "active",
    };

    if (priceChanged && scraped.price !== null) {
      updateData.externalPrice = scraped.price;
    }

    if (scraped.images.length > 0 && product.images === "[]") {
      updateData.images = JSON.stringify(scraped.images);
    }

    await prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    await prisma.stockSyncLog.create({
      data: {
        productId,
        status,
        message,
        oldPrice: product.externalPrice,
        newPrice: scraped.price,
        oldStock: product.externalStock,
        newStock: scraped.availability,
      },
    });

    return {
      productId,
      status,
      message,
      oldPrice: product.externalPrice,
      newPrice: scraped.price,
      oldStock: product.externalStock,
      newStock: scraped.availability,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    await prisma.product.update({
      where: { id: productId },
      data: { syncStatus: "error" },
    });

    await prisma.stockSyncLog.create({
      data: {
        productId,
        status: "error",
        message: errorMsg,
        oldPrice: product.externalPrice,
        newPrice: null,
        oldStock: product.externalStock,
        newStock: null,
      },
    });

    return {
      productId,
      status: "error",
      message: errorMsg,
      oldPrice: product.externalPrice,
      newPrice: null,
      oldStock: product.externalStock,
      newStock: null,
    };
  }
}

export async function syncAllActiveProducts(): Promise<SyncResult[]> {
  const products = await prisma.product.findMany({
    where: {
      syncStatus: "active",
      sourceUrl: { not: null },
    },
    select: { id: true },
  });

  const results: SyncResult[] = [];

  for (const product of products) {
    const result = await syncProduct(product.id);
    results.push(result);

    if (products.indexOf(product) < products.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}
