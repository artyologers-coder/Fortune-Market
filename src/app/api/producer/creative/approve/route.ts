import { NextRequest, NextResponse } from "next/server";
import {
  creativeErrorResponse,
  requireProducer,
  CreativeRouteError,
} from "@/lib/creative/route-auth";
import { approveCreative } from "@/lib/creative/place";

export async function POST(req: NextRequest) {
  try {
    const producer = await requireProducer();

    const body = await req.json().catch(() => ({}));
    const { productId } = body ?? {};
    if (!productId) {
      throw new CreativeRouteError(400, "productId is required");
    }

    const { creative, product } = await approveCreative(
      productId,
      producer.id
    );

    return NextResponse.json({ creative, product });
  } catch (error) {
    return creativeErrorResponse(error);
  }
}