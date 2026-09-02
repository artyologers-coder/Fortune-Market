import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { computeSellingPrice } from "@/lib/reseller/markup";
import { scrapeProductUrl } from "@/lib/reseller/scraper";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const source = await prisma.resellerSource.findUnique({
      where: { id: params.id },
      include: { product: true },
    });

    if (!source) {
      return NextResponse.json({ error: "Reseller source not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action, title, description, categoryId, overridePrice, overrideStock, brandingImage } = body;

    if (action === "resync") {
      const scrapeResult = await scrapeProductUrl(source.sourceUrl);
      if (scrapeResult.outcome === "ok" && scrapeResult.data) {
        const data = scrapeResult.data;
        const category = await prisma.category.findUnique({
          where: { id: source.product.categoryId },
          select: { markupPercentage: true },
        });
        const markup = category?.markupPercentage ?? 15;
        const sellingPrice = computeSellingPrice(data.price ?? 0, markup);

        if (data.price !== null) {
          await prisma.resellerSource.update({
            where: { id: source.id },
            data: {
              sourcePrice: data.price,
              sourceStock: data.sourceStock,
              sourceStatus: data.sourceStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
              sourceRawData: JSON.stringify(data.rawData),
              lastScrapedAt: new Date(),
              syncFailCount: 0,
              lastSyncError: null,
              requiresReview: false,
            },
          });

          await prisma.product.update({
            where: { id: source.productId },
            data: {
              price: sellingPrice,
              externalPrice: data.price,
              externalStock: data.availability,
              syncStatus: "active",
              lastSyncAt: new Date(),
              active: data.sourceStock !== 0,
            },
          });

          await prisma.stockSyncLog.create({
            data: {
              productId: source.productId,
              status: "success",
              message: "Manual resync completed",
              newPrice: data.price,
              newStock: data.availability,
            },
          });

          return NextResponse.json({ message: "Resync completed" });
        }
        return NextResponse.json({ error: "Resync failed - no price" }, { status: 400 });
      }
      return NextResponse.json({ error: "Resync failed" }, { status: 400 });
    }

    if (action === "resolve_review") {
      await prisma.resellerSource.update({
        where: { id: source.id },
        data: { requiresReview: false, lastSyncError: null },
      });
      return NextResponse.json({ message: "Review resolved" });
    }

    if (action === "unpublish") {
      await prisma.product.update({
        where: { id: source.productId },
        data: { active: false },
      });
      await prisma.resellerSource.update({
        where: { id: source.id },
        data: { sourceStatus: "REMOVED" },
      });
      return NextResponse.json({ message: "Unpublished" });
    }

    if (action === "update") {
      const updateData: Record<string, unknown> = {};
      const productUpdate: Record<string, unknown> = {};

      if (title) {
        updateData.sourceName = title;
        productUpdate.name = title;
        productUpdate.nameSi = title;
      }
      if (description) {
        productUpdate.description = description;
        productUpdate.descriptionSi = description;
      }
      if (categoryId) {
        productUpdate.categoryId = categoryId;
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { markupPercentage: true },
        });
        if (category) {
          const sellingPrice = computeSellingPrice(source.sourcePrice, category.markupPercentage);
          productUpdate.price = sellingPrice;
        }
      }
      if (overridePrice !== undefined && overridePrice !== null) {
        updateData.sourcePrice = overridePrice;
        const category = await prisma.category.findUnique({
          where: { id: source.product.categoryId },
          select: { markupPercentage: true },
        });
        const markup = category?.markupPercentage ?? 15;
        productUpdate.price = computeSellingPrice(overridePrice, markup);
        productUpdate.externalPrice = overridePrice;
      }
      if (overrideStock !== undefined) {
        updateData.sourceStock = overrideStock;
        updateData.sourceStatus = overrideStock === 0 ? "OUT_OF_STOCK" : "ACTIVE";
        productUpdate.externalStock = overrideStock === 0 ? "out_of_stock" : "in_stock";
        productUpdate.active = overrideStock !== 0;
      }
      if (brandingImage) {
        productUpdate.images = JSON.stringify([brandingImage]);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.resellerSource.update({
          where: { id: source.id },
          data: updateData,
        });
      }

      if (Object.keys(productUpdate).length > 0) {
        await prisma.product.update({
          where: { id: source.productId },
          data: productUpdate,
        });
      }

      return NextResponse.json({ message: "Updated" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Reseller product patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}