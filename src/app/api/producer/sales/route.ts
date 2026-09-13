import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "PRODUCER") {
      return NextResponse.json({ error: "Not a producer" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({
      where: { userId: session.user.id },
    });

    if (!producer) {
      return NextResponse.json({ unitsSold: 0, orderCount: 0, revenue: 0 });
    }

    const where = {
      product: { producerId: producer.id },
      order: { status: { not: "CANCELLED" } },
    };

    const [items, orderGroups] = await Promise.all([
      prisma.orderItem.findMany({
        where,
        select: { price: true, quantity: true },
      }),
      prisma.orderItem.groupBy({
        by: ["orderId"],
        where,
      }),
    ]);

    const unitsSold = items.reduce((sum, item) => sum + item.quantity, 0);
    const revenue = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return NextResponse.json({
      unitsSold,
      orderCount: orderGroups.length,
      revenue,
    });
  } catch (error) {
    console.error("Producer sales error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}