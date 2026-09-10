import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canUseChat } from "@/lib/chat-access";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ count: 0 });
    }

    if (!canUseChat(session.user)) {
      return NextResponse.json({ count: 0 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    let producerId: string | null = null;
    if (role === "PRODUCER") {
      const producer = await prisma.producer.findUnique({
        where: { userId },
        select: { id: true },
      });
      producerId = producer?.id ?? null;
    }

    const where = role === "BUYER"
      ? { buyerId: userId }
      : role === "ADMIN"
      ? { adminId: userId }
      : producerId
      ? { producerId }
      : { id: "__none__" };

    const conversations = await prisma.conversation.findMany({
      where,
      select: { id: true },
    });

    if (conversations.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const result = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        readAt: null,
        senderId: { not: userId },
      },
      _count: { id: true },
    });

    const totalUnread = result.reduce((sum, r) => sum + r._count.id, 0);

    return NextResponse.json({ count: totalUnread });
  } catch (error) {
    console.error("Unread count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
