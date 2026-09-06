import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
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

    if (!all) {
      const products = await prisma.product.findMany({
        where: {
          OR: [{ flagged: true }, { active: false }],
        },
        include: {
          producer: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ products });
    }

    const q = searchParams.get("q") || "";
    const status = searchParams.get("status") || "all";
    const source = searchParams.get("source") || "all";
    const producerId = searchParams.get("producerId") || "all";
    const categoryId = searchParams.get("categoryId") || "all";
    const minRating = parseFloat(searchParams.get("minRating") || "0");
    const sort = searchParams.get("sort") || "newest";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "20")));
    const skip = (page - 1) * perPage;

    const where: Prisma.ProductWhereInput = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { nameSi: { contains: q, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.active = true;
    else if (status === "inactive") where.active = false;
    else if (status === "flagged") where.flagged = true;

    if (source === "manual") {
      where.AND = [
        { resellerSource: { is: null } },
        { producer: { is: { user: { email: "reseller@fortune.lk" } } } },
      ];
    } else if (source === "reseller") {
      where.resellerSource = { isNot: null };
    } else if (source === "producer") {
      where.AND = [
        { resellerSource: { is: null } },
        { NOT: { producer: { is: { user: { email: "reseller@fortune.lk" } } } } },
      ];
    }

    if (producerId && producerId !== "all") where.producerId = producerId;
    if (categoryId && categoryId !== "all") where.categoryId = categoryId;
    if (minRating > 0) where.rating = { gte: minRating };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
    if (sort === "oldest") orderBy = { createdAt: "asc" };
    else if (sort === "price_asc") orderBy = { price: "asc" };
    else if (sort === "price_desc") orderBy = { price: "desc" };

    const [products, total, categories, producers] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          producer: { include: { user: { select: { name: true } } } },
        },
        orderBy,
        skip,
        take: perPage,
      }),
      prisma.product.count({ where }),
      prisma.category.findMany({
        select: { id: true, name: true, nameSi: true },
        orderBy: { name: "asc" },
      }),
      prisma.producer.findMany({
        select: {
          id: true,
          businessName: true,
          businessNameSi: true,
          user: { select: { name: true } },
        },
        orderBy: { businessName: "asc" },
      }),
    ]);

    return NextResponse.json({
      products,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
      categories,
      producers,
    });
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
