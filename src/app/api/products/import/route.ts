import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { scrapeProduct, ScrapedProduct } from "@/lib/url-scraper";
import { extractWithAI } from "@/lib/ai-scraper";
import * as cheerio from "cheerio";
import https from "https";
import http from "http";

function extractPageText(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, iframe, noscript, svg, [role='navigation'], .nav, .footer, .sidebar, .menu").remove();

  const title = $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(" | ");
  const h2 = $("h2")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(" | ");

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  const parts = [title, metaDesc, ogTitle, ogDesc, h1, h2, bodyText].filter(Boolean);
  return parts.join("\n\n").slice(0, 18000);
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
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      },
      (res: any) => {
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
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "PRODUCER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({
      where: { userId: session.user.id },
    });
    if (!producer) {
      return NextResponse.json({ error: "Producer profile not found" }, { status: 404 });
    }

    const body = await req.json();
    const { url, categoryId, price, stock, previewOnly } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let finalName = "";
    let finalDesc = "";
    let finalPrice: number | null = null;
    let finalOriginalPrice: number | null = null;
    let finalImages: string[] = [];
    let finalAvailability: "in_stock" | "out_of_stock" | "unknown" = "unknown";
    let finalSiteName = "";

    try {
      const html = await fetchUrl(url);
      const pageText = extractPageText(html);

      const aiResult = await extractWithAI(pageText);

      if (aiResult && aiResult.name && aiResult.name.length > 3) {
        finalName = aiResult.name;
        finalDesc = aiResult.description || "";
        finalPrice = aiResult.price ?? null;
        finalOriginalPrice = aiResult.originalPrice ?? null;
        finalImages = aiResult.images || [];
        finalAvailability = aiResult.availability || "unknown";
        finalSiteName = aiResult.siteName || "";
      }
    } catch {
      // AI fetch failed, fall through to heuristic
    }

    if (!finalName || finalName.length < 3) {
      try {
        const heuristic = await scrapeProduct(url);
        finalName = finalName || heuristic.name;
        finalDesc = finalDesc || heuristic.description;
        finalPrice = finalPrice ?? heuristic.price;
        finalOriginalPrice = finalOriginalPrice ?? heuristic.originalPrice;
        finalImages = finalImages.length > 0 ? finalImages : heuristic.images;
        finalAvailability = finalAvailability !== "unknown" ? finalAvailability : heuristic.availability;
        finalSiteName = finalSiteName || heuristic.siteName;
      } catch {
        // both failed
      }
    }

    if (!finalName || finalName.length < 3) {
      try {
        const { scrapeWithBrowser, isBrowserScrapingAvailable } = await import("@/lib/url-scraper-browser");
        const available = await isBrowserScrapingAvailable();
        if (!available) throw new Error("Browser scraping unavailable");
        const browserResult = await scrapeWithBrowser(url);
        finalName = finalName || browserResult.name;
        finalDesc = finalDesc || browserResult.description;
        finalPrice = finalPrice ?? browserResult.price;
        finalOriginalPrice = finalOriginalPrice ?? browserResult.originalPrice;
        finalImages = finalImages.length > 0 ? finalImages : browserResult.images;
        finalAvailability = finalAvailability !== "unknown" ? finalAvailability : browserResult.availability;
        finalSiteName = finalSiteName || browserResult.siteName;
      } catch {
        // all methods failed
      }
    }

    if (!finalName || finalName.length < 3) {
      return NextResponse.json({ error: "Could not extract product data from URL" }, { status: 400 });
    }

    const scraped: ScrapedProduct = {
      name: finalName.substring(0, 500),
      description: finalDesc.substring(0, 5000),
      price: finalPrice,
      originalPrice: finalOriginalPrice,
      images: finalImages.slice(0, 10),
      availability: finalAvailability,
      siteName: finalSiteName,
    };

    if (previewOnly) {
      return NextResponse.json({ scraped });
    }

    const product = await prisma.product.create({
      data: {
        producerId: producer.id,
        categoryId: categoryId || "cat-foods",
        name: scraped.name,
        nameSi: scraped.name,
        description: scraped.description,
        descriptionSi: scraped.description,
        price: price ?? scraped.price ?? 0,
        originalPrice: scraped.originalPrice,
        unit: "piece",
        unitSi: "කැබැල්ල",
        stock: stock ?? (scraped.availability === "in_stock" ? 10 : 0),
        images: JSON.stringify(scraped.images),
        sourceUrl: url,
        sourceSite: scraped.siteName,
        syncStatus: "active",
        externalPrice: scraped.price,
        externalStock: scraped.availability,
        lastSyncAt: new Date(),
      },
    });

    await prisma.stockSyncLog.create({
      data: {
        productId: product.id,
        status: "success",
        message: `Product imported from ${scraped.siteName}`,
        newPrice: scraped.price,
        newStock: scraped.availability,
      },
    });

    return NextResponse.json({ product, scraped });
  } catch (error) {
    console.error("Product import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
