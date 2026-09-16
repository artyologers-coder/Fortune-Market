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
    const data: {
      businessName?: string;
      businessNameSi?: string;
      description?: string | null;
      descriptionSi?: string | null;
      location?: string;
      district?: string;
      phone?: string;
      businessRegistrationNo?: string | null;
    } = {};

    if (body.businessName !== undefined) {
      const businessName = String(body.businessName).trim();
      if (!businessName || businessName.length < 2) {
        return NextResponse.json(
          { error: "Business name is required" },
          { status: 400 }
        );
      }
      data.businessName = businessName;
    }

    if (body.businessNameSi !== undefined) {
      const businessNameSi = String(body.businessNameSi).trim();
      data.businessNameSi =
        businessNameSi || (body.businessName !== undefined ? String(body.businessName).trim() : undefined);
    }

    if (body.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }

    if (body.descriptionSi !== undefined) {
      data.descriptionSi = String(body.descriptionSi).trim() || null;
    }

    if (body.location !== undefined) {
      const location = String(body.location).trim();
      if (!location) {
        return NextResponse.json({ error: "Location is required" }, { status: 400 });
      }
      data.location = location;
    }

    if (body.district !== undefined) {
      const district = String(body.district).trim();
      if (!district) {
        return NextResponse.json({ error: "District is required" }, { status: 400 });
      }
      data.district = district;
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone).trim();
      if (!phone) {
        return NextResponse.json(
          { error: "Please enter a valid phone number" },
          { status: 400 }
        );
      }
      if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ""))) {
        return NextResponse.json(
          { error: "Please enter a valid phone number" },
          { status: 400 }
        );
      }
      data.phone = phone;
    }

    if (body.businessRegistrationNo !== undefined) {
      const regNo = String(body.businessRegistrationNo).trim();
      if (!regNo) {
        return NextResponse.json(
          { error: "Please enter a valid business registration number" },
          { status: 400 }
        );
      }
      data.businessRegistrationNo = regNo;
    }

    const updated = await prisma.producer.update({
      where: { id: producer.id },
      data,
    });

    return NextResponse.json({ producer: updated });
  } catch (error) {
    console.error("Producer update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
