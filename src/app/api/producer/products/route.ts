import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slugify";
import { requireApprovedProducer, producerGuardErrorResponse } from "@/lib/producer-guard";

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "nameSi",
  "description",
  "descriptionSi",
  "categoryId",
  "price",
  "originalPrice",
  "codAmount",
  "codUnit",
  "codUnitsPerKg",
  "unit",
  "unitSi",
  "stock",
  "active",
  "images",
  "brandLogoUrl",
  "certifications",
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
    const producer = await requireApprovedProducer();

    const body = await req.json();
    const {
      name,
      nameSi,
      description,
      descriptionSi,
      categoryId,
      price,
      originalPrice,
      codAmount,
      codUnit,
      codUnitsPerKg,
      unit,
      unitSi,
      stock,
      images,
      brandLogoUrl,
      certifications,
    } = body;

    if (!name || !price || !categoryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return NextResponse.json(
        { error: "Invalid category selected. Please choose a valid category." },
        { status: 400 }
      );
    }

    const slug = await uniqueSlug(name || nameSi || "product", async (candidate) =>
      Boolean(await prisma.product.findUnique({ where: { slug: candidate } }))
    );

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
        codAmount: codAmount ? parseFloat(codAmount) : null,
        codUnit: codUnit || null,
        codUnitsPerKg: codUnitsPerKg ? parseFloat(codUnitsPerKg) : null,
        unit: unit || "piece",
        unitSi: unitSi || "කැබැල්ල",
        stock: parseInt(stock) || 0,
        images: JSON.stringify(Array.isArray(images) ? images : []),
        slug,
        brandLogoUrl: brandLogoUrl || null,
        certifications: JSON.stringify(Array.isArray(certifications) ? certifications : []),
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Product creation error:", error);
    return producerGuardErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const producer = await requireApprovedProducer();

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
        case "codAmount":
          data.codAmount = value ? parseFloat(value) : null;
          break;
        case "codUnit":
          data.codUnit = value || null;
          break;
        case "codUnitsPerKg":
          data.codUnitsPerKg = value ? parseFloat(value) : null;
          break;
        case "stock":
          data.stock = parseInt(value);
          break;
        case "images":
          data.images = JSON.stringify(Array.isArray(value) ? value : []);
          break;
        case "brandLogoUrl":
          data.brandLogoUrl = value ? String(value) : null;
          break;
        case "certifications":
          data.certifications = JSON.stringify(Array.isArray(value) ? value : []);
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
    return producerGuardErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const producer = await requireApprovedProducer();

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
    return producerGuardErrorResponse(error);
  }
}
