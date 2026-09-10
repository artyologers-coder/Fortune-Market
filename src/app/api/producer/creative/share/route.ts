import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  creativeErrorResponse,
  requireProducer,
  CreativeRouteError,
} from "@/lib/creative/route-auth";

const ALLOWED_CHANNELS = ["facebook", "whatsapp", "copy"] as const;

export async function POST(req: NextRequest) {
  try {
    const producer = await requireProducer();

    const body = await req.json().catch(() => ({}));
    const { productId, channel } = body ?? {};

    if (!productId) {
      throw new CreativeRouteError(400, "productId is required");
    }
    if (!ALLOWED_CHANNELS.includes(channel)) {
      throw new CreativeRouteError(400, "Invalid share channel");
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, producerId: producer.id },
      include: { creative: true },
    });
    if (!product) throw new CreativeRouteError(404, "Product not found");
    if (!product.creative) {
      throw new CreativeRouteError(400, "No creative exists for this product");
    }

    await prisma.creativeShare.create({
      data: { creativeId: product.creative.id, channel },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return creativeErrorResponse(error);
  }
}