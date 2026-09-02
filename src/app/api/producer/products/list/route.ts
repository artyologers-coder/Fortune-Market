import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role !== "PRODUCER") {
      return NextResponse.json({ error: "Not a producer" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({ where: { userId } });
    if (!producer) {
      return NextResponse.json({ products: [] });
    }

    const products = await prisma.product.findMany({
      where: { producerId: producer.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Producer products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
