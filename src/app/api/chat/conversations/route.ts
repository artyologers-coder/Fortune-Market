import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canUseChat } from "@/lib/chat-access";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canUseChat(session.user)) {
      return NextResponse.json({ error: "Chat not available" }, { status: 403 });
    }

    const userId = session.user.id;
    const role = session.user.role;
    const body = await req.json();
    const { productId, orderId, producerId: requestedProducerId } = body;

    if (!productId && !orderId && role !== "ADMIN") {
      return NextResponse.json({ error: "productId or orderId required" }, { status: 400 });
    }

    let buyerId: string | null = null;
    let adminId: string | null = null;
    let producerId: string;

    if (role === "BUYER") {
      buyerId = userId;

      if (productId) {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { producerId: true, active: true },
        });
        if (!product || !product.active) {
          return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }
        producerId = product.producerId;
      } else {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { userId: true },
        });
        if (!order || order.userId !== userId) {
          return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }
        if (!requestedProducerId) {
          return NextResponse.json({ error: "producerId required for order chat" }, { status: 400 });
        }
        // Verify this producer actually has items in the order
        const hasItem = await prisma.orderItem.findFirst({
          where: {
            orderId,
            product: { producerId: requestedProducerId },
          },
        });
        if (!hasItem) {
          return NextResponse.json({ error: "Producer has no items in this order" }, { status: 400 });
        }
        producerId = requestedProducerId;
      }
    } else if (role === "PRODUCER") {
      const producer = await prisma.producer.findUnique({ where: { userId } });
      if (!producer) {
        return NextResponse.json({ error: "Producer profile not found" }, { status: 404 });
      }
      producerId = producer.id;

      // For product chats from producer side, buyerId must come from request
      if (!body.buyerId) {
        return NextResponse.json({ error: "buyerId required for producer-initiated chat" }, { status: 400 });
      }
      buyerId = body.buyerId;

      if (productId) {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { producerId: true },
        });
        if (!product || product.producerId !== producerId) {
          return NextResponse.json({ error: "Not your product" }, { status: 403 });
        }
      }
    } else if (role === "ADMIN") {
      const { producerUserId } = body;
      if (!requestedProducerId && !producerUserId) {
        return NextResponse.json({ error: "producerId or producerUserId required" }, { status: 400 });
      }

      let producer: { id: string } | null = null;
      if (requestedProducerId) {
        producer = await prisma.producer.findUnique({ where: { id: requestedProducerId } });
        if (!producer) {
          return NextResponse.json({ error: "Producer not found" }, { status: 404 });
        }
      } else {
        const producerUser = await prisma.user.findUnique({
          where: { id: producerUserId },
          select: { id: true, name: true, email: true, phone: true, role: true, producer: { select: { id: true } } },
        });
        if (!producerUser || producerUser.role !== "PRODUCER") {
          return NextResponse.json({ error: "Seller user not found" }, { status: 404 });
        }
        if (producerUser.producer) {
          producer = producerUser.producer;
        } else {
          const fallbackName = producerUser.name || producerUser.email;
          producer = await prisma.producer.create({
            data: {
              userId: producerUser.id,
              businessName: fallbackName,
              businessNameSi: fallbackName,
              location: "",
              district: "",
              phone: producerUser.phone || "",
            },
            select: { id: true },
          });
        }
      }

      if (productId) {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { producerId: true },
        });
        if (!product || product.producerId !== producer.id) {
          return NextResponse.json({ error: "Not this producer's product" }, { status: 403 });
        }
      }
      adminId = userId;
      producerId = producer.id;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Dedupe: reuse an existing conversation for the same participants
    const existing = await prisma.conversation.findFirst({
      where: {
        buyerId: buyerId ?? undefined,
        adminId: adminId ?? undefined,
        producerId,
        productId: productId || null,
        orderId: orderId || null,
      },
    });

    if (existing) {
      return NextResponse.json({ conversation: existing });
    }

    const conversation = await prisma.conversation.create({
      data: {
        buyerId,
        adminId,
        producerId,
        productId: productId || null,
        orderId: orderId || null,
      },
    });

    return NextResponse.json({ conversation, message: "Conversation created" });
  } catch (error) {
    console.error("Create conversation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canUseChat(session.user)) {
      return NextResponse.json({ conversations: [] });
    }

    const userId = session.user.id;
    const role = session.user.role;

    let where: Prisma.ConversationWhereInput = {};

    if (role === "BUYER") {
      where = { buyerId: userId };
    } else if (role === "PRODUCER") {
      const producer = await prisma.producer.findUnique({ where: { userId } });
      if (!producer) return NextResponse.json({ conversations: [] });
      where = { producerId: producer.id };
    } else if (role === "ADMIN") {
      where = { adminId: userId };
    } else {
      return NextResponse.json({ conversations: [] });
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true, avatar: true } },
        admin: { select: { id: true, name: true, avatar: true } },
        producer: { select: { id: true, businessName: true, businessNameSi: true, user: { select: { name: true, avatar: true } } } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, senderId: true, createdAt: true },
        },
        product: { select: { id: true, name: true, nameSi: true } },
        order: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Compute unread count per conversation
    const convIds = conversations.map((c) => c.id);

    const unreadCounts = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: convIds },
        readAt: null,
        senderId: { not: userId },
      },
      _count: { id: true },
    });

    const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count.id]));

    const enriched = conversations.map((c) => {
      let otherParty: { id: string; name: string; avatar: string | null };
      if (role === "BUYER" || role === "ADMIN") {
        otherParty = { id: c.producer.id, name: c.producer.businessName, avatar: c.producer.user.avatar };
      } else if (c.adminId) {
        otherParty = { id: c.admin?.id ?? "", name: c.admin?.name ?? "Admin", avatar: c.admin?.avatar ?? null };
      } else {
        otherParty = { id: c.buyer?.id ?? "", name: c.buyer?.name ?? "Buyer", avatar: c.buyer?.avatar ?? null };
      }
      return {
        ...c,
        unreadCount: unreadMap.get(c.id) || 0,
        otherParty,
      };
    });

    return NextResponse.json({ conversations: enriched });
  } catch (error) {
    console.error("List conversations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
