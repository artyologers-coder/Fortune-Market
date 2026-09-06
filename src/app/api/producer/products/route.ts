import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "nameSi",
  "description",
  "descriptionSi",
  "categoryId",
  "price",
  "originalPrice",
  "unit",
  "unitSi",
  "stock",
  "active",
  "images",
] as const;

async function getProducer(session: { user: { id?: string | null } }) {
  const userId: string | null | undefined = session.user.id;
  const role = (session.user as { role?: string }).role;
  if (role !== "PRODUCER" || !userId) return null;
  return prisma.producer.findUnique({ where: { userId } });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const producer = await getProducer(session);
    if (!producer) {
      return NextResponse.json({ error: "Not a producer" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const product = await prisma.product.findFirst({
        where: { id, producerId: producer.id },
      });
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      return NextResponse.json({ product });
    }

    const products = await prisma.product.findMany({
      where: { producerId: producer.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Producer products GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const producer = await getProducer(session);
    if (!producer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      nameSi,
      description,
      descriptionSi,
      categoryId,
      price,
      originalPrice,
      unit,
      unitSi,
      stock,
      images,
    } = body;

    if (!name || !price || !categoryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        producerId: producer.id,
        categoryId,
        name,
        nameSi: nameSi || name,
        description: description || "",
        descriptionSi: descriptionSi || description || "",
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        unit: unit || "piece",
        unitSi: unitSi || "කැබැල්ල",
        stock: parseInt(stock) || 0,
        images: JSON.stringify(Array.isArray(images) ? images : []),
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Product creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const producer = await getProducer(session);
    if (!producer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing || existing.producerId !== producer.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const data: Prisma.ProductUpdateInput = {};

    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (!(field in body)) continue;
      const value = body[field];
      switch (field) {
        case "price":
          data.price = parseFloat(value);
          break;
        case "originalPrice":
          data.originalPrice = value ? parseFloat(value) : null;
          break;
        case "stock":
          data.stock = parseInt(value);
          break;
        case "images":
          data.images = JSON.stringify(Array.isArray(value) ? value : []);
          break;
        default:
          (data as Record<string, unknown>)[field] = value;
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Product update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role !== "PRODUCER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({ where: { userId } });
    if (!producer) {
      return NextResponse.json({ error: "Producer profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing || existing.producerId !== producer.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await prisma.product.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ message: "Product deactivated" });
  } catch (error) {
    console.error("Product delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
