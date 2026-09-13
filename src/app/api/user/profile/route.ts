import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("User profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const data: { name?: string; email?: string; phone?: string | null; phoneVerified?: boolean } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      data.name = name;
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone).trim();
      if (phone) {
        if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ""))) {
          return NextResponse.json(
            { error: "Please enter a valid phone number" },
            { status: 400 }
          );
        }
        const existing = await prisma.user.findFirst({
          where: { phone, id: { not: userId } },
        });
        if (existing) {
          return NextResponse.json(
            { error: "An account with this phone number already exists" },
            { status: 409 }
          );
        }
        data.phone = phone;
        if (phone !== user.phone) {
          data.phoneVerified = false;
        }
      } else {
        data.phone = null;
        if (user.phone) {
          data.phoneVerified = false;
        }
      }
    }

    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
      }
      if (email !== user.email) {
        if (!body.currentPassword) {
          return NextResponse.json(
            { error: "Enter your current password to change your email" },
            { status: 400 }
          );
        }
        const isValid = await compare(body.currentPassword, user.passwordHash);
        if (!isValid) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }
        const existing = await prisma.user.findFirst({
          where: { email, id: { not: userId } },
        });
        if (existing) {
          return NextResponse.json(
            { error: "An account with this email already exists" },
            { status: 409 }
          );
        }
        data.email = email;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phone: true, phoneVerified: true, role: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}