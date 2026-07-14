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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const existingProducer = await prisma.producer.findUnique({ where: { userId } });
    if (existingProducer) {
      return NextResponse.json({ error: "Producer profile already exists" }, { status: 409 });
    }

    const body = await req.json();

    const categorySlug = body.selectedCategory;
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });

    const producer = await prisma.producer.create({
      data: {
        userId,
        businessName: body.businessName,
        businessNameSi: body.businessNameSi || body.businessName,
        description: body.description,
        descriptionSi: body.descriptionSi || body.description,
        location: body.location,
        district: body.district,
        phone: body.phone,
      },
    });

    if (body.productName && category) {
      await prisma.product.create({
        data: {
          producerId: producer.id,
          categoryId: category.id,
          name: body.productName,
          nameSi: body.productNameSi || body.productName,
          description: body.productDescription || "",
          descriptionSi: body.productDescriptionSi || body.productDescription || "",
          price: parseFloat(body.productPrice) || 0,
          unit: body.productUnit || "piece",
          unitSi: body.productUnitSi || "කැබැල්ල",
          stock: parseInt(body.productStock) || 0,
          images: [],
        },
      });
    }

    return NextResponse.json({ producer, message: "Application submitted" });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
