import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  creativeErrorResponse,
  requireProducer,
  CreativeRouteError,
} from "@/lib/creative/route-auth";
import { buildExternalPrompts } from "@/lib/creative/prompts";

export async function GET(req: NextRequest) {
  try {
    const producer = await requireProducer();
    const productId = new URL(req.url).searchParams.get("productId");
    if (!productId) {
      throw new CreativeRouteError(400, "productId is required");
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, producerId: producer.id },
      include: {
        creative: true,
        category: { select: { name: true, nameSi: true } },
      },
    });
    if (!product) throw new CreativeRouteError(404, "Product not found");

    const prompts = buildExternalPrompts({
      name: product.name,
      nameSi: product.nameSi ?? undefined,
      categoryName: product.category?.name ?? undefined,
      description: product.description,
    });

    return NextResponse.json({
      creative: product.creative,
      prompts,
      product: {
        id: product.id,
        name: product.name,
        nameSi: product.nameSi,
        slug: product.slug,
        images: product.images,
      },
    });
  } catch (error) {
    return creativeErrorResponse(error);
  }
}