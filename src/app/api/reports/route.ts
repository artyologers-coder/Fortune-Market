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
    const { productId, reason } = await req.json();

    if (!productId || !reason) {
      return NextResponse.json({ error: "Product ID and reason required" }, { status: 400 });
    }

    await prisma.report.create({
      data: { userId, productId, reason },
    });

    return NextResponse.json({ message: "Report submitted" });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
