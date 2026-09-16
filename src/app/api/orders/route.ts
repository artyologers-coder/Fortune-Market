import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { paymentGateway } from "@/lib/payment-gateway";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { computeCodFee } from "@/lib/cod-fee";
import { membershipStatus } from "@/lib/producer-membership";

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("COD_ORDERS")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { items, shippingInfo, paymentMethod, notes } = await req.json();

    if (!items?.length || !shippingInfo) {
      return NextResponse.json({ error: "Missing order data" }, { status: 400 });
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { producer: true },
      });

      if (!product || !product.active) {
        return NextResponse.json(
          { error: `Product ${item.productId} not found` },
          { status: 404 }
        );
      }

      if (membershipStatus(product.producer) === "EXPIRED") {
        return NextResponse.json(
          { error: `${product.name} is unavailable. The seller's membership has expired.` },
          { status: 400 }
        );
      }

      if (product.stock < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for ${product.name}` },
          { status: 400 }
        );
      }

      const codFee = computeCodFee(item.quantity, product);
      totalAmount += product.price * item.quantity + codFee;
      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
        codFee,
      });
    }

    if (paymentMethod === "card") {
      if (!isFeatureEnabled("ONLINE_PAYMENTS")) {
        return NextResponse.json({ error: "Feature not available" }, { status: 403 });
      }

      const paymentResult = await paymentGateway.createPayment(totalAmount, "LKR", {
        userId,
      });

      if (!paymentResult.success) {
        return NextResponse.json(
          { error: paymentResult.error || "Payment failed" },
          { status: 402 }
        );
      }
    }

    const order = await prisma.order.create({
      data: {
        userId,
        totalAmount,
        paymentMethod: paymentMethod || "cod",
        paymentDone: paymentMethod === "card",
        shippingName: shippingInfo.name,
        shippingPhone: shippingInfo.phone,
        shippingAddress: shippingInfo.address,
        shippingCity: shippingInfo.city,
        notes: shippingInfo.notes || null,
        status: "PENDING",
        items: {
          create: orderItems,
        },
      },
      include: { items: true },
    });

    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return NextResponse.json({ order, message: "Order placed successfully" });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (role === "PRODUCER") {
      const producer = await prisma.producer.findUnique({
        where: { userId },
      });
      if (producer) {
        where.items = {
          some: { product: { producerId: producer.id } },
        };
      }
    } else if (role !== "ADMIN") {
      where.userId = userId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              include: { 
                producer: { include: { user: { select: { name: true } } } },
                resellerSource: {
                  select: { sourceUrl: true, sourceDomain: true, sourcePrice: true }
                }
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Orders fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
