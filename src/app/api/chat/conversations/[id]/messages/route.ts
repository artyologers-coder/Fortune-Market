import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canUseChat } from "@/lib/chat-access";

async function getParticipant(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { producer: { select: { userId: true } } },
  });
  if (!conv) return null;
  if (conv.buyerId === userId || conv.adminId === userId || conv.producer.userId === userId) return conv;
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canUseChat(session.user)) {
      return NextResponse.json({ messages: [] });
    }

    const conversation = await getParticipant(params.id, session.user.id);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: params.id },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Mark messages from the other party as read
    await prisma.message.updateMany({
      where: {
        conversationId: params.id,
        senderId: { not: session.user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("List messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canUseChat(session.user)) {
      return NextResponse.json({ error: "Chat not available" }, { status: 403 });
    }

    const conversation = await getParticipant(params.id, session.user.id);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { body: msgBody } = await req.json();
    if (!msgBody || typeof msgBody !== "string" || !msgBody.trim()) {
      return NextResponse.json({ error: "Message body required" }, { status: 400 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: params.id,
        senderId: session.user.id,
        body: msgBody.trim(),
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
    });

    // Touch conversation's updatedAt
    await prisma.conversation.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
