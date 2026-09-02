import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    if (role !== "PRODUCER") {
      return NextResponse.json({ error: "Only producers can create offers" }, { status: 403 });
    }

    const producer = await prisma.producer.findUnique({ where: { userId } });
    if (!producer) {
      return NextResponse.json({ error: "Producer profile not found" }, { status: 404 });
    }

    const { title, titleSi, description, descriptionSi, discountPercent, startDate, endDate } =
      await req.json();

    if (!title || !discountPercent || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const offer = await prisma.offer.create({
      data: {
        producerId: producer.id,
        title,
        titleSi: titleSi || title,
        description: description || "",
        descriptionSi: descriptionSi || description || "",
        discountPercent: parseInt(discountPercent),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    return NextResponse.json({ offer, message: "Offer submitted for approval" });
  } catch (error) {
    console.error("Offer creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const offers = await prisma.offer.findMany({
      where: { status: "APPROVED", endDate: { gt: new Date() } },
      include: { producer: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ offers });
  } catch (error) {
    console.error("Offers fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
