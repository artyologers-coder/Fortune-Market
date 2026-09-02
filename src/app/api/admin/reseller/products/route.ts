import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { computeSellingPrice } from "@/lib/reseller/markup";
import { scrapeProductUrl } from "@/lib/reseller/scraper";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sources = await prisma.resellerSource.findMany({
      where: { sourceStatus: { not: "REMOVED" } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameSi: true,
            price: true,
            images: true,
            stock: true,
            active: true,
            category: { select: { name: true, nameSi: true, markupPercentage: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = sources.map((source) => ({
      id: source.id,
      productId: source.productId,
      name: source.product?.name,
      nameSi: source.product?.nameSi,
      sellingPrice: source.product?.price,
      sourcePrice: source.sourcePrice,
      sourceStock: source.sourceStock,
      sourceStatus: source.sourceStatus,
      stock: source.product?.stock,
      active: source.product?.active,
      requiresReview: source.requiresReview,
      lastScrapedAt: source.lastScrapedAt,
      lastSyncError: source.lastSyncError,
      sourceUrl: source.sourceUrl,
      sourceDomain: source.sourceDomain,
      category: source.product?.category,
      images: source.product?.images ? JSON.parse(source.product.images) : [],
    }));

    return NextResponse.json({ products: items });
  } catch (error) {
    console.error("Reseller products list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { url, categoryId, title, description, brandingImage, overridePrice, overrideStock } = body;

    if (!url || !categoryId) {
      return NextResponse.json({ error: "URL and categoryId are required" }, { status: 400 });
    }

    const scrapeResult = await scrapeProductUrl(url);
    if (scrapeResult.outcome === "failed" || !scrapeResult.data) {
      return NextResponse.json({ error: "Could not extract product data from URL" }, { status: 400 });
    }

    const data = scrapeResult.data;

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { markupPercentage: true },
    });

    const markup = category?.markupPercentage ?? 15;
    const sourcePrice = overridePrice ?? data.price ?? 0;
    const sellingPrice = computeSellingPrice(sourcePrice, markup);
    const stock = overrideStock ?? (data.availability === "in_stock" ? 10 : 0);

    const resellerProducer = await prisma.producer.findFirst({
      where: { user: { email: "reseller@fortune.lk" } },
    });

    if (!resellerProducer) {
      return NextResponse.json({ error: "Reseller producer not found" }, { status: 500 });
    }

    const product = await prisma.product.create({
      data: {
        producerId: resellerProducer.id,
        categoryId,
        name: title || data.name,
        nameSi: title || data.name,
        description: description || data.description,
        descriptionSi: description || data.description,
        price: sellingPrice,
        originalPrice: data.originalPrice,
        unit: "piece",
        unitSi: "කැබැල්ල",
        images: JSON.stringify(brandingImage ? [brandingImage] : data.images),
        stock,
        sourceUrl: url,
        sourceSite: data.siteName,
        syncStatus: "active",
        externalPrice: sourcePrice,
        externalStock: data.availability,
        lastSyncAt: new Date(),
      },
    });

    await prisma.resellerSource.create({
      data: {
        productId: product.id,
        sourceUrl: url,
        sourceDomain: data.sourceDomain,
        sourceName: data.siteName,
        sourcePrice,
        sourceStock: data.sourceStock,
        sourceStatus: data.sourceStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
        sourceRawData: JSON.stringify(data.rawData),
        lastScrapedAt: new Date(),
      },
    });

    await prisma.stockSyncLog.create({
      data: {
        productId: product.id,
        status: "success",
        message: `Product imported from ${data.siteName}`,
        newPrice: sourcePrice,
        newStock: data.availability,
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Reseller product create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}