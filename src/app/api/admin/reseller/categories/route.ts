import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { recalculateCategoryPrices, recalculateAllPrices } from "@/lib/reseller/markup";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categories = await prisma.category.findMany({
      select: { id: true, name: true, nameSi: true, slug: true, markupPercentage: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Categories list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, markupPercentage } = body;

    if (!id || markupPercentage === undefined) {
      return NextResponse.json({ error: "id and markupPercentage are required" }, { status: 400 });
    }

    const category = await prisma.category.update({
      where: { id },
      data: { markupPercentage },
      select: { id: true, name: true, nameSi: true, markupPercentage: true },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Category update error:", error);
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
    const { action, categoryId } = body;

    if (action === "recalculate") {
      if (categoryId) {
        const updated = await recalculateCategoryPrices(prisma, categoryId);
        return NextResponse.json({ message: `Recalculated ${updated} products in category`, updated });
      } else {
        const updated = await recalculateAllPrices(prisma);
        return NextResponse.json({ message: `Recalculated ${updated} products across all categories`, updated });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Category recalculate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}