import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { syncProduct } from "@/lib/stock-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const product = await prisma.product.findUnique({
      where: { id: params.id },
    });
    if (!product || product.producerId !== producer.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!product.sourceUrl) {
      return NextResponse.json({ error: "No source URL configured" }, { status: 400 });
    }

    const result = await syncProduct(product.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const product = await prisma.product.findUnique({
      where: { id: params.id },
    });
    if (!product || product.producerId !== producer.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { syncStatus } = body;

    if (!["active", "paused"].includes(syncStatus)) {
      return NextResponse.json({ error: "Invalid sync status" }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id: params.id },
      data: { syncStatus },
    });

    return NextResponse.json({ product: updated });
  } catch (error) {
    console.error("Sync toggle error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
