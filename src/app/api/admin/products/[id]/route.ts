import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        producer: { include: { user: { select: { name: true } } } },
        category: { select: { id: true, name: true, nameSi: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Admin product get error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = params.id;
    const body = await req.json();

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const data: Prisma.ProductUpdateInput = {};

    if (body.name !== undefined) data.name = String(body.name);
    if (body.nameSi !== undefined) data.nameSi = String(body.nameSi);
    if (body.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: String(body.categoryId) },
      });
      if (!category) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      data.category = { connect: { id: String(body.categoryId) } };
    }
    if (body.price !== undefined) data.price = parseFloat(body.price);
    if (body.originalPrice !== undefined) {
      data.originalPrice = body.originalPrice ? parseFloat(body.originalPrice) : null;
    }
    if (body.codAmount !== undefined) {
      data.codAmount = body.codAmount ? parseFloat(body.codAmount) : null;
    }
    if (body.codUnit !== undefined) {
      data.codUnit = body.codUnit || null;
    }
    if (body.stock !== undefined) data.stock = parseInt(body.stock);
    if (body.unit !== undefined) data.unit = String(body.unit);
    if (body.unitSi !== undefined) data.unitSi = String(body.unitSi);
    if (body.description !== undefined) data.description = String(body.description);
    if (body.descriptionSi !== undefined) data.descriptionSi = String(body.descriptionSi);
    if (body.images !== undefined) {
      data.images = JSON.stringify(Array.isArray(body.images) ? body.images : []);
    }
    if (body.certifications !== undefined) {
      data.certifications = JSON.stringify(
        Array.isArray(body.certifications) ? body.certifications : []
      );
    }
    if (body.active !== undefined) data.active = Boolean(body.active);

    const product = await prisma.product.update({ where: { id }, data });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Admin product update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    await prisma.product.update({
      where: { id: params.id },
      data: { active: false },
    });

    return NextResponse.json({ message: "Product removed from marketplace" });
  } catch (error) {
    console.error("Admin product delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "restore") {
      await prisma.product.update({
        where: { id: params.id },
        data: { active: true },
      });
      return NextResponse.json({ message: "Product restored" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin product patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}