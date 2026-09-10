import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteImages } from "@/lib/blob-utils";
import { prisma } from "@/lib/prisma";
import { requireApprovedProducer, producerGuardErrorResponse } from "@/lib/producer-guard";

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (role !== "ADMIN" && role !== "PRODUCER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { urls, productId } = await req.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
    }

    if (role === "PRODUCER") {
      try {
        const producer = await requireApprovedProducer();
        if (productId) {
          const product = await prisma.product.findUnique({ where: { id: productId } });
          if (!product || product.producerId !== producer.id) {
            return NextResponse.json({ error: "Not authorized" }, { status: 403 });
          }
        }
      } catch (error) {
        return producerGuardErrorResponse(error);
      }
    }

    await deleteImages(urls);
    return NextResponse.json({ deleted: urls.length });
  } catch (error) {
    console.error("Image delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
