import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const product = await prisma.product.findUnique({
      where: { id: params.id },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (session.user.role !== "ADMIN" && product.producerId !== session.user.producerId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const logs = await prisma.stockSyncLog.findMany({
      where: { productId: params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Sync logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
