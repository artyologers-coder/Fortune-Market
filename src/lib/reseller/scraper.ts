import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";
import https from "https";
import http from "http";
import { isBrowserScrapingAvailable, getBrowserUnavailableReason } from "@/lib/url-scraper-browser";
import { ResellerScrapeResult, ScrapeOutcome, ScrapedProductWithOutcome } from "./types";

const prisma = new PrismaClient();

const DOMAIN_RATE_LIMIT_MS = parseInt(process.env.RESYNC_DOMAIN_DELAY_MS || "5000", 10);
const lastRequestTime = new Map<string, number>();

function browserAvailable(): Promise<boolean> {
  return isBrowserScrapingAvailable();
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace("www.", "");
  } catch {
    return "unknown";
  }
}

async function rateLimit(domain: string): Promise<void> {
  const lastTime = lastRequestTime.get(domain) || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < DOMAIN_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, DOMAIN_RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime.set(domain, Date.now());
}

function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) {
    return Promise.reject(new Error("Too many redirects"));
  }
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let totalSize = 0;
        const MAX_SIZE = 5 * 1024 * 1024;
        res.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) {
            req.destroy();
            reject(new Error("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function parsePrice(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, "").trim();
  const match = cleaned.match(/[\d,]+\.?\d*/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

function extractFromText($: cheerio.CheerioAPI): Partial<ResellerScrapeResult> {
  const result: Partial<ResellerScrapeResult> = {};

  const title = $("h1").first().text().trim() || $("title").text().trim();
  if (title) result.name = title.substring(0, 500);

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const priceMatch = bodyText.match(/Rs\.?\s?[\d,]+\.?\d*/i);
  if (priceMatch) {
    const price = parsePrice(priceMatch[0]);
    if (price && price > 0) result.price = price;
  }

  if (!result.price) {
    const priceMatch2 = bodyText.match(/[\d,]+\.?\d*\s*LKR/i);
    if (priceMatch2) {
      const price = parsePrice(priceMatch2[0]);
      if (price && price > 0) result.price = price;
    }
  }

  const stockText = bodyText.toLowerCase();
  if (stockText.includes("out of stock") || stockText.includes("sold out") || stockText.match(/stock\s*:\s*0/) || stockText.match(/stock\s+0\b/)) {
    result.availability = "out_of_stock";
  } else if (stockText.includes("in stock") || stockText.includes("available") || stockText.includes("add to cart")) {
    result.availability = "in_stock";
  }

  return result;
}

function extractFromJsonLd($: cheerio.CheerioAPI): Partial<ResellerScrapeResult> | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse($(scripts[i]).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes?.("Product")) {
          const result: Partial<ResellerScrapeResult> = {};
          if (item.name) result.name = item.name;
          if (item.description) result.description = item.description;
          if (item.image) {
            result.images = Array.isArray(item.image) ? item.image : [item.image];
          }
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offers.price) result.price = parseFloat(offers.price);
            if (offers.availability) {
              if (offers.availability.includes("InStock")) result.availability = "in_stock";
              else if (offers.availability.includes("OutOfStock")) result.availability = "out_of_stock";
            }
            if (offers.lowPrice && offers.highPrice) {
              result.originalPrice = parseFloat(offers.highPrice);
            }
          }
          if (item.brand?.name) result.siteName = item.brand.name;
          return result;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractFromOpenGraph($: cheerio.CheerioAPI): Partial<ResellerScrapeResult> {
  const result: Partial<ResellerScrapeResult> = {};
  const title = $('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("title").text();
  if (title) result.name = title.trim();

  const desc = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content");
  if (desc) result.description = desc.trim();

  const image = $('meta[property="og:image"]').attr("content");
  if (image) result.images = [image];

  const priceStr =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('[class*="price"]').first().text();
  if (priceStr) result.price = parsePrice(priceStr);

  const currency = $('meta[property="product:price:currency"]').attr("content") || "";
  result.siteName = currency;

  return result;
}

function extractFromMeta($: cheerio.CheerioAPI): Partial<ResellerScrapeResult> {
  const result: Partial<ResellerScrapeResult> = {};

  const title = $('meta[name="twitter:title"]').attr("content") || $("title").text();
  if (title) result.name = title.trim();

  const desc =
    $('meta[name="twitter:description"]').attr("content") || $('meta[name="description"]').attr("content");
  if (desc) result.description = desc.trim();

  const image = $('meta[name="twitter:image"]').attr("content");
  if (image) result.images = [image];

  const priceEl = $('[class*="price"], [data-price], [itemprop="price"], [class*="Price"]').first();
  if (priceEl.length) {
    const priceText = priceEl.attr("content") || priceEl.text();
    result.price = parsePrice(priceText);
  }

  return result;
}

function extractAvailability($: cheerio.CheerioAPI): "in_stock" | "out_of_stock" | "unknown" {
  const selectors = [
    '[class*="stock"], [class*="availability"], [class*="inventory"]',
    '[data-testid*="stock"], [data-testid*="availability"]',
    '[itemprop="availability"]',
    'meta[property="product:availability"]',
    '[class*="add-to-cart"], [class*="buy-now"], [class*="AddToCart"]',
    '[disabled*="out"], [class*="sold-out"], [class*="unavailable"]',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = (el.attr("content") || el.attr("aria-disabled") || el.text()).toLowerCase();
      if (text.includes("out of stock") || text.includes("sold out") || text.includes("unavailable") || text.includes("false")) {
        return "out_of_stock";
      }
      if (text.includes("in stock") || text.includes("available") || text.includes("add to cart") || text.includes("buy now")) {
        return "in_stock";
      }
    }
  }
  return "unknown";
}

function applySelectors($: cheerio.CheerioAPI, selectors: Record<string, string>): Partial<ResellerScrapeResult> {
  const result: Partial<ResellerScrapeResult> = {};

  if (selectors.name) {
    const el = $(selectors.name).first();
    if (el.length) result.name = el.text().trim();
  }

  if (selectors.price) {
    const el = $(selectors.price).first();
    if (el.length) {
      const text = el.attr("content") || el.text();
      result.price = parsePrice(text);
    }
  }

  if (selectors.description) {
    const el = $(selectors.description).first();
    if (el.length) result.description = el.text().trim();
  }

  if (selectors.images) {
    const images: string[] = [];
    $(selectors.images).each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && src.startsWith("http") && !images.includes(src)) {
        images.push(src);
      }
    });
    if (images.length > 0) result.images = images.slice(0, 10);
  }

  if (selectors.stock) {
    const el = $(selectors.stock).first();
    if (el.length) {
      const text = (el.attr("content") || el.text()).toLowerCase();
      if (text.includes("out of stock") || text.includes("sold out") || text.includes("unavailable")) {
        result.availability = "out_of_stock";
      } else if (text.includes("in stock") || text.includes("available")) {
        result.availability = "in_stock";
      }
    }
  }

  return result;
}

function parseSourceStock(availability: string): number | null {
  if (availability === "in_stock") return 10;
  if (availability === "out_of_stock") return 0;
  return null;
}

function assessConfidence(data: Partial<ResellerScrapeResult>): "high" | "medium" | "low" {
  const hasName = !!data.name && data.name.length > 3;
  const hasPrice = data.price !== null && data.price !== undefined && data.price > 0;
  const hasDescription = !!data.description && data.description.length > 10;
  const hasImages = (data.images?.length || 0) > 0;

  if (hasName && hasPrice && (hasDescription || hasImages)) return "high";
  if (hasName && hasPrice) return "medium";
  return "low";
}

function buildRawData($: cheerio.CheerioAPI, url: string): Record<string, unknown> {
  return {
    url,
    title: $("title").text(),
    metaDescription: $('meta[name="description"]').attr("content"),
    ogTitle: $('meta[property="og:title"]').attr("content"),
    ogDescription: $('meta[property="og:description"]').attr("content"),
    ogImage: $('meta[property="og:image"]').attr("content"),
    jsonLd: $('script[type="application/ld+json"]')
      .map((_, el) => {
        try {
          return JSON.parse($(el).html() || "");
        } catch {
          return null;
        }
      })
      .get()
      .filter(Boolean),
  };
}

async function scrapeStatic(url: string, existingProfile?: { selectorConfig: string | null; strategy: string }): Promise<ResellerScrapeResult | null> {
  await rateLimit(getDomain(url));
  const html = await fetchUrl(url);
  const $ = cheerio.load(html);

  let result: Partial<ResellerScrapeResult> = {};

  if (existingProfile?.selectorConfig && existingProfile.strategy === "css-selector") {
    try {
      const selectors = JSON.parse(existingProfile.selectorConfig);
      result = applySelectors($, selectors);
    } catch {
      // fall through to detection
    }
  }

  if (!result.name || !result.price) {
    const jsonLd = extractFromJsonLd($);
    if (jsonLd) result = { ...jsonLd, ...result };
  }

  if (!result.name || !result.price) {
    const og = extractFromOpenGraph($);
    result = { ...og, ...result };
  }

  if (!result.name || !result.price) {
    const meta = extractFromMeta($);
    result = { ...meta, ...result };
  }

  if (!result.name || !result.price) {
    const textFallback = extractFromText($);
    if (textFallback.name && !result.name) result.name = textFallback.name;
    if (textFallback.price && !result.price) result.price = textFallback.price;
    if (textFallback.availability && !result.availability) result.availability = textFallback.availability;
  }

  if (!result.availability) {
    result.availability = extractAvailability($);
  }

  if (!result.name || !result.price) {
    return null;
  }

  const confidence = assessConfidence(result);
  const sourceDomain = getDomain(url);
  const sourceStock = parseSourceStock(result.availability || "unknown");

  return {
    name: result.name.substring(0, 500),
    description: result.description?.substring(0, 5000) || "",
    price: result.price,
    originalPrice: result.originalPrice ?? null,
    images: result.images?.slice(0, 10) || [],
    sourceStock,
    availability: result.availability || "unknown",
    siteName: result.siteName || sourceDomain.split(".")[0],
    sourceDomain,
    rawData: buildRawData($, url),
    confidence,
  };
}

async function scrapeWithBrowser(url: string, existingProfile?: { selectorConfig: string | null; strategy: string; requiresJsRender?: boolean }): Promise<ResellerScrapeResult | null> {
  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const html = await page.content();
    const $ = cheerio.load(html);

    let result: Partial<ResellerScrapeResult> = {};

    if (existingProfile?.selectorConfig && existingProfile.strategy === "css-selector") {
      try {
        const selectors = JSON.parse(existingProfile.selectorConfig);
        const selectorResult = applySelectors($, selectors);
        if (selectorResult.name) result.name = selectorResult.name;
        if (selectorResult.price) result.price = selectorResult.price;
        if (selectorResult.description) result.description = selectorResult.description;
        if (selectorResult.images) result.images = selectorResult.images;
        if (selectorResult.availability) result.availability = selectorResult.availability;
      } catch {
        // fall through to detection
      }
    }

    if (!result.name || !result.price) {
      const jsonLd = extractFromJsonLd($);
      if (jsonLd) result = { ...jsonLd, ...result };
    }

    if (!result.name || !result.price) {
      const og = extractFromOpenGraph($);
      result = { ...og, ...result };
    }

    if (!result.name || !result.price) {
      const meta = extractFromMeta($);
      result = { ...meta, ...result };
    }

    if (!result.name || !result.price) {
      const priceSelectors = [
        '[class*="price"]', '[data-price]', '[itemprop="price"]', '[class*="Price"]',
        '.a-price-whole', '.a-offscreen', '[data-a-color="price"]', '.price', '.sale-price',
        '[class*="product-price"]', '[class*="ProductPrice"]', '[class*="offer-price"]',
        '[class*="OfferPrice"]', '[data-testid*="price"]', '[class*="current-price"]',
        '[class*="selling-price"]', '[class*="final-price"]', '[class*="amount"]',
      ];
      const seen = new Set<string>();
      for (const sel of priceSelectors) {
        for (const el of Array.from($(sel))) {
          const text = $(el).attr("content") || $(el).text() || "";
          if (!text || seen.has(text)) continue;
          seen.add(text);
          const price = parsePrice(text);
          if (price && price > 0 && price < 99999999) {
            result.price = price;
            break;
          }
        }
        if (result.price) break;
      }

      const titleEl = $("h1").first();
      if (titleEl.length && !result.name) {
        result.name = titleEl.text().trim();
      }
    }

    if (!result.name || !result.price) {
      const textFallback = extractFromText($);
      if (textFallback.name && !result.name) result.name = textFallback.name;
      if (textFallback.price && !result.price) result.price = textFallback.price;
      if (textFallback.availability && !result.availability) result.availability = textFallback.availability;
    }

    if (!result.availability) {
      result.availability = extractAvailability($);
    }

    if (!result.name) {
      return null;
    }

    const confidence = assessConfidence(result);
    const sourceDomain = getDomain(url);
    const sourceStock = parseSourceStock(result.availability || "unknown");

    return {
      name: result.name.substring(0, 500),
      description: result.description?.substring(0, 5000) || "",
      price: result.price ?? null,
      originalPrice: result.originalPrice ?? null,
      images: result.images?.slice(0, 10) || [],
      sourceStock,
      availability: result.availability || "unknown",
      siteName: result.siteName || sourceDomain.split(".")[0],
      sourceDomain,
      rawData: buildRawData($, url),
      confidence,
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function scrapeProductUrl(url: string): Promise<ScrapedProductWithOutcome> {
  const domain = getDomain(url);

  let profile = await prisma.scraperDomainProfile.findUnique({ where: { domain } });

  let scraped: ResellerScrapeResult | null = null;
  let usedBrowser = false;
  let browserError: string | null = null;

  async function tryBrowser(localeUrl: string, p: typeof profile, options?: { selectorConfig: string | null; strategy: string; requiresJsRender?: boolean }): Promise<void> {
    try {
      const ok = await browserAvailable();
      if (!ok) {
        browserError = getBrowserUnavailableReason() || "Playwright browser not available in this environment";
        return;
      }
      scraped = await scrapeWithBrowser(localeUrl, p ? { selectorConfig: p.selectorConfig, strategy: p.strategy, requiresJsRender: p.requiresJsRender } : options);
      usedBrowser = true;
    } catch (error) {
      browserError = error instanceof Error ? error.message : "Browser scraping failed";
    }
  }

  try {
    if (profile?.requiresJsRender) {
      await tryBrowser(url, profile);
      if (!scraped && !usedBrowser) {
        scraped = await scrapeStatic(url, { selectorConfig: profile.selectorConfig, strategy: profile.strategy });
      }
    } else {
      scraped = await scrapeStatic(url, profile ? { selectorConfig: profile.selectorConfig, strategy: profile.strategy } : undefined);
    }

    if ((!scraped || scraped.confidence === "low") && !profile?.requiresJsRender) {
      await tryBrowser(url, profile);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { outcome: "failed", data: null, missingFields: ["name", "price"], error: `Scraping failed: ${message}` };
  }

  if (!scraped) {
    if (browserError) {
      return {
        outcome: "failed",
        data: null,
        missingFields: ["name", "price"],
        error: `Scraping failed: ${browserError}`,
      };
    }
    return { outcome: "failed", data: null, missingFields: ["name", "price"], error: "All extraction methods failed" };
  }

  if (scraped.confidence === "low") {
    return { outcome: "needsReview", data: scraped, missingFields: [] };
  }

  await prisma.scraperDomainProfile.upsert({
    where: { domain },
    update: {
      strategy: usedBrowser ? "css-selector" : "json-ld",
      requiresJsRender: usedBrowser,
      lastVerifiedAt: new Date(),
    },
    create: {
      domain,
      strategy: usedBrowser ? "css-selector" : "json-ld",
      requiresJsRender: usedBrowser,
      lastVerifiedAt: new Date(),
    },
  });

  return { outcome: "ok", data: scraped, missingFields: [] };
}

export async function getDomainProfile(domain: string) {
  return prisma.scraperDomainProfile.findUnique({ where: { domain } });
}

export async function updateDomainProfile(
  domain: string,
  data: { strategy?: string; selectorConfig?: Record<string, string>; requiresJsRender?: boolean; supplierWhatsAppNumber?: string }
) {
  return prisma.scraperDomainProfile.upsert({
    where: { domain },
    update: {
      ...data,
      selectorConfig: data.selectorConfig ? JSON.stringify(data.selectorConfig) : undefined,
      lastVerifiedAt: new Date(),
    },
    create: {
      domain,
      strategy: data.strategy || "json-ld",
      selectorConfig: data.selectorConfig ? JSON.stringify(data.selectorConfig) : null,
      requiresJsRender: data.requiresJsRender ?? true,
      supplierWhatsAppNumber: data.supplierWhatsAppNumber,
      lastVerifiedAt: new Date(),
    },
  });
}