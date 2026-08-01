import * as cheerio from "cheerio";
import https from "https";
import http from "http";

export interface ScrapedProduct {
  name: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  images: string[];
  availability: "in_stock" | "out_of_stock" | "unknown";
  siteName: string;
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchUrl(redirectUrl).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
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

function detectSite(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("amazon")) return "amazon";
    if (hostname.includes("aliexpress")) return "aliexpress";
    if (hostname.includes("ebay")) return "ebay";
    if (hostname.includes("walmart")) return "walmart";
    if (hostname.includes("flipkart")) return "flipkart";
    return hostname.replace("www.", "").split(".")[0];
  } catch {
    return "unknown";
  }
}

function parsePrice(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, "").trim();
  const match = cleaned.match(/[\d,]+\.?\d*/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

function extractFromJsonLd($: cheerio.CheerioAPI): Partial<ScrapedProduct> | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse($(scripts[i]).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes?.("Product")) {
          const result: Partial<ScrapedProduct> = {};
          if (item.name) result.name = item.name;
          if (item.description) result.description = item.description;
          if (item.image) {
            result.images = Array.isArray(item.image) ? item.image : [item.image];
          }
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offers.price) {
              result.price = parseFloat(offers.price);
            }
            if (offers.availability) {
              if (offers.availability.includes("InStock")) {
                result.availability = "in_stock";
              } else if (offers.availability.includes("OutOfStock")) {
                result.availability = "out_of_stock";
              }
            }
            if (offers.lowPrice && offers.highPrice) {
              result.originalPrice = parseFloat(offers.highPrice);
            }
          }
          if (item.brand?.name) {
            result.siteName = item.brand.name;
          }
          return result;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractFromOpenGraph($: cheerio.CheerioAPI): Partial<ScrapedProduct> {
  const result: Partial<ScrapedProduct> = {};
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    $("h1").first().text();
  if (title) result.name = title.trim();

  const desc =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content");
  if (desc) result.description = desc.trim();

  const image = $('meta[property="og:image"]').attr("content");
  if (image) result.images = [image];

  const priceStr =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('[class*="price"]').first().text();
  if (priceStr) result.price = parsePrice(priceStr);

  const currency =
    $('meta[property="product:price:currency"]').attr("content") || "";
  result.siteName = currency;

  return result;
}

function extractFromMeta($: cheerio.CheerioAPI): Partial<ScrapedProduct> {
  const result: Partial<ScrapedProduct> = {};

  const title =
    $('meta[name="twitter:title"]').attr("content") || $("title").text();
  if (title) result.name = title.trim();

  const desc =
    $('meta[name="twitter:description"]').attr("content") ||
    $('meta[name="description"]').attr("content");
  if (desc) result.description = desc.trim();

  const image = $('meta[name="twitter:image"]').attr("content");
  if (image) result.images = [image];

  const priceEl = $(
    '[class*="price"], [data-price], [itemprop="price"], [class*="Price"]'
  ).first();
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
      const text = (
        el.attr("content") ||
        el.attr("aria-disabled") ||
        el.text()
      ).toLowerCase();
      if (
        text.includes("out of stock") ||
        text.includes("sold out") ||
        text.includes("unavailable") ||
        text.includes("false")
      ) {
        return "out_of_stock";
      }
      if (
        text.includes("in stock") ||
        text.includes("available") ||
        text.includes("add to cart") ||
        text.includes("buy now")
      ) {
        return "in_stock";
      }
    }
  }

  return "unknown";
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const html = await fetchUrl(url);
  const $ = cheerio.load(html);

  const jsonLd = extractFromJsonLd($);
  const og = extractFromOpenGraph($);
  const meta = extractFromMeta($);
  const availability = extractAvailability($);

  const name =
    jsonLd?.name || og.name || meta.name || "Untitled Product";
  const description =
    jsonLd?.description || og.description || meta.description || "";
  const images = jsonLd?.images || og.images || meta.images || [];
  const price = jsonLd?.price || og.price || meta.price || null;
  const originalPrice = jsonLd?.originalPrice || null;

  return {
    name: name.substring(0, 500),
    description: description.substring(0, 5000),
    price,
    originalPrice,
    images: images.slice(0, 10),
    availability: jsonLd?.availability || availability,
    siteName: detectSite(url),
  };
}
