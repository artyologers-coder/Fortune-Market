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
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        items: {
          include: {
            product: {
              include: {
                producer: { include: { user: { select: { name: true } } } },
                resellerSource: {
                  select: { 
                    sourceUrl: true, 
                    sourceDomain: true, 
                    sourcePrice: true,
                    sourceStock: true
                  }
                },
                category: { select: { name: true, nameSi: true } },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    for (const item of order.items) {
      if (item.product.resellerSource) {
        const profile = await prisma.scraperDomainProfile.findUnique({
          where: { domain: item.product.resellerSource.sourceDomain },
          select: { supplierWhatsAppNumber: true },
        });
        (item.product.resellerSource as any).supplierWhatsAppNumber = profile?.supplierWhatsAppNumber;
      }
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Admin order detail error:", error);
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

    const body = await req.json();
    const { action, status } = body;

    if (action === "forward_to_supplier") {
      const order = await prisma.order.update({
        where: { id: params.id },
        data: { 
          status: "FORWARDED_TO_SUPPLIER",
          forwardedToSupplierAt: new Date(),
        },
      });
      return NextResponse.json({ order });
    }

    if (status) {
      const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "FORWARDED_TO_SUPPLIER"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const order = await prisma.order.update({
        where: { id: params.id },
        data: { status },
      });
      return NextResponse.json({ order });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin order update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}