import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import crypto from "crypto";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: params.id } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role === "ADMIN") {
      return NextResponse.json(
        { error: "Cannot reset admin accounts" },
        { status: 403 }
      );
    }

    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot reset your own password" },
        { status: 403 }
      );
    }

    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await hash(tempPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ email: user.email, tempPassword });
  } catch (error) {
    console.error("Admin reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}