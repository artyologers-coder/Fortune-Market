import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const producers = await prisma.producer.findMany({
      where: { verificationStatus: "PENDING" },
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ producers });
  } catch (error) {
    console.error("Admin producers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
