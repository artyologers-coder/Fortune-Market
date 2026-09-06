import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "1";

    const products = await prisma.product.findMany({
      where: all
        ? undefined
        : {
            OR: [{ flagged: true }, { active: false }],
          },
      include: {
        producer: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Admin products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, nameSi, categoryId, price, originalPrice, stock, unit, unitSi, description, descriptionSi, images } = body;

    if (!name || !categoryId || !price) {
      return NextResponse.json({ error: "Name, category, and price are required" }, { status: 400 });
    }

    const resellerProducer = await prisma.producer.findFirst({
      where: { user: { email: "reseller@fortune.lk" } },
    });

    if (!resellerProducer) {
      return NextResponse.json({ error: "Reseller producer not found" }, { status: 500 });
    }

    const product = await prisma.product.create({
      data: {
        producerId: resellerProducer.id,
        categoryId,
        name,
        nameSi: nameSi || name,
        description: description || "",
        descriptionSi: descriptionSi || description || "",
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        unit: unit || "piece",
        unitSi: unitSi || "කැබැල්ල",
        images: JSON.stringify(images || []),
        stock: parseInt(stock) || 0,
        active: true,
        sourceUrl: null,
        sourceSite: "Manual Entry",
        syncStatus: "paused",
      },
    });

    await prisma.stockSyncLog.create({
      data: {
        productId: product.id,
        status: "success",
        message: "Product created manually by admin",
        newPrice: parseFloat(price),
        newStock: stock || "0",
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Manual product create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
