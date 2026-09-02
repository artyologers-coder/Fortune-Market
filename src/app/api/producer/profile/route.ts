import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role !== "PRODUCER") {
      return NextResponse.json({ error: "Not a producer" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });

    if (!producer) {
      return NextResponse.json({ producer: null });
    }

    return NextResponse.json({ producer });
  } catch (error) {
    console.error("Producer profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const producer = await prisma.producer.findUnique({ where: { userId } });

    if (!producer) {
      return NextResponse.json({ error: "Producer not found" }, { status: 404 });
    }

    const body = await req.json();
    const updated = await prisma.producer.update({
      where: { id: producer.id },
      data: {
        businessName: body.businessName,
        businessNameSi: body.businessNameSi,
        description: body.description,
        descriptionSi: body.descriptionSi,
        location: body.location,
        district: body.district,
      },
    });

    return NextResponse.json({ producer: updated });
  } catch (error) {
    console.error("Producer update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
