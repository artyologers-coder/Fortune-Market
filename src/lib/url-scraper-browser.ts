import { ScrapedProduct } from "./url-scraper";

interface BrowserExtractedData {
  pageData: PageData;
  price: number | null;
  priceConfidence: number;
  images: string[];
  imageConfidence: number;
  availability: string;
  availabilityConfidence: number;
}

interface PageData {
  title: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  jsonLd: Record<string, unknown> | null;
  h1Texts: string[];
  h2Texts: string[];
  allText: string;
  url: string;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function browserExtract(url: string): BrowserExtractedData {
  const doc = document;
  const title = doc.title || "";

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || null;
  const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || null;
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || null;
  const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || null;
  const twitterDescription = doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content") || null;
  const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || null;
  const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute("content") || null;
  const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute("content") || null;

  let jsonLd: Record<string, unknown> | null = null;
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse((s as HTMLScriptElement).textContent || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes?.("Product")) {
          jsonLd = item;
          break;
        }
      }
    } catch {
      continue;
    }
    if (jsonLd) break;
  }

  const h1Texts: string[] = [];
  const h2Texts: string[] = [];
  for (const el of Array.from(doc.querySelectorAll("h1"))) {
    const t = (el as HTMLElement).textContent?.trim();
    if (t) h1Texts.push(t);
  }
  for (const el of Array.from(doc.querySelectorAll("h2"))) {
    const t = (el as HTMLElement).textContent?.trim();
    if (t) h2Texts.push(t);
  }

  const allText = doc.body?.textContent || "";
  const pageData: PageData = { title, ogTitle, ogDescription, ogImage, ogSiteName, twitterTitle, twitterDescription, twitterImage, metaDescription, metaKeywords, jsonLd, h1Texts, h2Texts, allText, url };

  let price: number | null = null;
  let priceConfidence = 0;

  const priceMeta = doc.querySelector('meta[property="product:price:amount"]')?.getAttribute("content") || doc.querySelector('meta[property="og:price:amount"]')?.getAttribute("content");
  if (priceMeta) {
    const p = parseFloat(priceMeta);
    if (!isNaN(p)) { price = p; priceConfidence = 85; }
  }

  if (jsonLd) {
    const offers = jsonLd.offers;
    if (offers) {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const p = (offer as any)?.price;
      if (p !== undefined && p !== null) {
        const parsed = parseFloat(p);
        if (!isNaN(parsed) && (!price || priceConfidence < 95)) {
          price = parsed;
          priceConfidence = 95;
        }
      }
    }
  }

  if (!price || priceConfidence < 80) {
    const priceSelectors = [
      '[class*="price"]', '[data-price]', '[itemprop="price"]', '[class*="Price"]',
      '.a-price-whole', '.a-offscreen', '[data-a-color="price"]', '.price', '.sale-price',
      '[class*="product-price"]', '[class*="ProductPrice"]', '[class*="offer-price"]',
      '[class*="OfferPrice"]', '[data-testid*="price"]', '[class*="current-price"]',
      '[class*="selling-price"]', '[class*="final-price"]', '[class*="amount"]',
      '#corePriceDisplay', '[class*="a-text-price"]', '[class*="a-price"]',
    ];
    const seen = new Set<string>();
    const candidates: { value: number; confidence: number }[] = [];
    for (const sel of priceSelectors) {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        const e = el as HTMLElement;
        const text = e.getAttribute("content") || e.textContent?.trim() || "";
        if (!text || seen.has(text)) continue;
        seen.add(text);
        const cleaned = text.replace(/[^0-9.,]/g, "");
        const match = cleaned.match(/(\d{1,3}[,.]?\d{0,3}[,.]?\d{0,3}\.?\d{0,2})/);
        if (match) {
          const num = parseFloat(match[1].replace(/,/g, ""));
          if (!isNaN(num) && num > 0 && num < 99999999) {
            let conf = 50;
            if (text.includes("Rs.") || text.includes("₹") || text.includes("$") || text.includes("£") || text.includes("€")) conf = 65;
            if (sel.includes("corePrice") || sel.includes("offer-price") || sel.includes("final-price") || sel.includes("selling-price")) conf = 75;
            candidates.push({ value: num, confidence: conf });
          }
        }
      }
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    if (candidates.length > 0 && candidates[0].confidence > priceConfidence) {
      price = candidates[0].value;
      priceConfidence = candidates[0].confidence;
    }
  }

  let images: string[] = [];
  let imageConfidence = 0;

  if (jsonLd?.image) {
    const raw = jsonLd.image;
    images = Array.isArray(raw) ? raw : [String(raw)];
    imageConfidence = 90;
  }

  if (images.length === 0 && ogImage) {
    images = [ogImage];
    imageConfidence = 80;
  }

  if (images.length === 0 && twitterImage) {
    images = [twitterImage];
    imageConfidence = 70;
  }

  if (images.length === 0) {
    const imgSelectors = [
      '[class*="product-image"] img', '[class*="ProductImage"] img',
      '[class*="gallery"] img', '[class*="main-image"] img',
      '[data-testid*="image"] img', '[id*="main-image"] img',
      '[class*="hero-image"] img', '[class*="media"] img',
    ];
    for (const sel of imgSelectors) {
      for (const img of Array.from(doc.querySelectorAll(sel))) {
        const src = (img as HTMLImageElement).getAttribute("src");
        if (src && src.startsWith("http") && !images.includes(src)) {
          images.push(src);
          if (images.length >= 3) break;
        }
      }
      if (images.length > 0) { imageConfidence = 50; break; }
    }
  }

  let availability = "unknown";
  let availabilityConfidence = 0;

  if (jsonLd?.offers) {
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    const avail = (offer as any)?.availability as string;
    if (avail) {
      if (avail.includes("InStock") || avail.includes("in_stock")) {
        availability = "in_stock";
        availabilityConfidence = 95;
      } else if (avail.includes("OutOfStock") || avail.includes("out_of_stock")) {
        availability = "out_of_stock";
        availabilityConfidence = 95;
      }
    }
  }

  if (availabilityConfidence < 85) {
    const stockSelectors = ['[id*="availability"]', '[class*="availability"]', '[data-asin-state]', '#availability span', '.a-stock', '.stock-status', '[class*="stock"]', '[id*="stock"]'];
    for (const sel of stockSelectors) {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        const e = el as HTMLElement;
        const text = (e.getAttribute("content") || e.getAttribute("aria-label") || e.textContent?.toLowerCase() || "").trim();
        if (text.includes("out of stock") || text.includes("sold out") || text.includes("unavailable") || text.includes("out_of_stock")) {
          availability = "out_of_stock";
          availabilityConfidence = 90;
          break;
        }
        if (text.includes("in stock") || text.includes("available") || text.includes("in_stock")) {
          availability = "in_stock";
          availabilityConfidence = 85;
          break;
        }
      }
      if (availabilityConfidence >= 85) break;
    }
  }

  if (availabilityConfidence < 70) {
    const atcSelectors = ['[id*="add-to-cart"]', '[name*="add"]', '[class*="add-to-cart"]', '[data-testid*="add-to-cart"]', '.a-button-input', '[id*="buy-now"]', '[class*="buy-now"]', '[class*="purchase"]', '[data-testid*="buy"]', 'button[type="submit"]'];
    for (const sel of atcSelectors) {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        const e = el as HTMLElement;
        const disabled = e.getAttribute("disabled") !== null || e.classList.contains("disabled") || e.getAttribute("aria-disabled") === "true";
        availability = disabled ? "out_of_stock" : "in_stock";
        availabilityConfidence = disabled ? 80 : 60;
        break;
      }
      if (availabilityConfidence >= 60) break;
    }
  }

  return { pageData, price, priceConfidence, images, imageConfidence, availability, availabilityConfidence };
}

function extractTitle(data: PageData, hostname: string): string {
  if (data.jsonLd?.name && String(data.jsonLd.name).length > 2) {
    return String(data.jsonLd.name);
  }
  if (data.ogTitle) {
    const c = data.ogTitle.replace(/\s*[-|–—]\s*.*$/, "").trim();
    if (c.length > 3) return c;
  }
  if (data.twitterTitle) {
    const c = data.twitterTitle.replace(/\s*[-|–—]\s*.*$/, "").trim();
    if (c.length > 3) return c;
  }
  for (const h1 of data.h1Texts) {
    const c = h1.replace(/\s*[-|–—]\s*.*$/, "").replace(/\s+/g, " ").trim();
    if (c.length > 3 && c.length < 200 && !c.includes("404") && !c.toLowerCase().includes("not found")) return c;
  }
  if (data.title) {
    const parts = data.title.split(/[-|–—|:]/);
    const best = parts.map((p) => p.trim()).filter((p) => p.length > 3 && !p.toLowerCase().includes(hostname)).sort((a, b) => b.length - a.length)[0];
    if (best) return best;
    return data.title;
  }
  return "Untitled Product";
}

function extractDescription(data: PageData): string {
  if (data.jsonLd?.description) return String(data.jsonLd.description);
  if (data.ogDescription) return data.ogDescription;
  if (data.twitterDescription) return data.twitterDescription;
  if (data.metaDescription) return data.metaDescription;
  return "";
}

function extractSiteName(data: PageData, hostname: string): string {
  if (data.ogSiteName && data.ogSiteName.length > 2) return data.ogSiteName;
  const known = ["amazon", "aliexpress", "ebay", "walmart", "flipkart", "etsy", "shopify", "bestbuy", "target", "homedepot", "lowes", "costco", "wayfair", "overstock", "newegg", "wish", "wix", "squarespace", "bigcommerce", "magento", "woocommerce", "prestashop", "opencart"];
  for (const k of known) {
    if (hostname.includes(k)) return k;
  }
  return hostname.split(".")[0] || hostname;
}

export async function scrapeWithBrowser(url: string): Promise<ScrapedProduct> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const extracted = await page.evaluate(browserExtract, url);
    const { pageData, price, priceConfidence: _pc, images, imageConfidence: _ic, availability, availabilityConfidence: _ac } = extracted;
    const hostname = getHostname(url);

    const title = extractTitle(pageData, hostname);
    const description = extractDescription(pageData);

    return {
      name: title.substring(0, 500),
      description: description.substring(0, 5000),
      price,
      originalPrice: null,
      images: images.slice(0, 10),
      availability: availability as "in_stock" | "out_of_stock" | "unknown",
      siteName: extractSiteName(pageData, hostname),
    };
  } finally {
    await browser.close();
  }
}
