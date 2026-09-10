import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  creativeErrorResponse,
  requireProducer,
  CreativeRouteError,
} from "@/lib/creative/route-auth";
import {
  resizeToCanvas,
  encodeWithinLimit,
  uploadCreative,
} from "@/lib/creative/postprocess";
import { brandCreative } from "@/lib/creative/compose";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const producer = await requireProducer();

    const formData = await req.formData();
    const productId = formData.get("productId");
    const file = formData.get("file");

    if (typeof productId !== "string" || !productId) {
      throw new CreativeRouteError(400, "productId is required");
    }
    if (!(file instanceof File)) {
      throw new CreativeRouteError(400, "No file provided");
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new CreativeRouteError(
        400,
        "Only JPG, PNG, WebP, or GIF images are allowed"
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new CreativeRouteError(400, "Image must be under 3 MB");
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, producerId: producer.id },
    });
    if (!product) throw new CreativeRouteError(404, "Product not found");

    const source = Buffer.from(await file.arrayBuffer());
    const canvas = await resizeToCanvas(source);
    const branded = await brandCreative(canvas);
    const final = await encodeWithinLimit(branded);
    const url = await uploadCreative(final);

    const existing = await prisma.productCreative.findUnique({
      where: { productId },
    });
    const version = existing ? existing.version + 1 : 1;

    const creative = await prisma.productCreative.upsert({
      where: { productId },
      update: { imageUrl: url, status: "PENDING", version, approvedAt: null },
      create: { productId, imageUrl: url, status: "PENDING", version },
    });

    return NextResponse.json({ creative });
  } catch (error) {
    return creativeErrorResponse(error);
  }
}