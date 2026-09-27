import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, password, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // A representative account must go through review, so this generic
    // endpoint refuses the role outright rather than silently downgrading it to
    // BUYER. Silently downgrading would hand the applicant a working login and
    // a confusing "why can't I see my dashboard" instead of telling them to
    // apply.
    if (role === "REPRESENTATIVE" || role === "ADMIN") {
      return NextResponse.json(
        { error: "This account type cannot be created here. Representatives must apply and be approved by an admin." },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email or phone already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        passwordHash,
        role: role === "PRODUCER" ? "PRODUCER" : "BUYER",
      },
    });

    return NextResponse.json({
      message: "Account created successfully",
      userId: user.id,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
