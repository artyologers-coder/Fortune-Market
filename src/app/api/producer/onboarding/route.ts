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

    const businessName = String(body.businessName || "").trim();
    const location = String(body.location || "").trim();
    const district = String(body.district || "").trim();
    const phone = String(body.phone || "").trim();

    if (!businessName || businessName.length < 2) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 }
      );
    }

    if (!location || !district) {
      return NextResponse.json(
        { error: "Location and district are required" },
        { status: 400 }
      );
    }

    if (phone && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ""))) {
      return NextResponse.json(
        { error: "Please enter a valid phone number" },
        { status: 400 }
      );
    }

    const productName = String(body.productName || "").trim();
    const productPrice = parseFloat(body.productPrice);
    if (productName && !(productPrice > 0)) {
      return NextResponse.json(
        { error: "Provide a valid product price if you add a first product" },
        { status: 400 }
      );
    }

    const categorySlug = body.selectedCategory;
    const category = categorySlug
      ? await prisma.category.findUnique({ where: { slug: categorySlug } })
      : null;

    let firstNameProductImages = "[]";
    if (Array.isArray(body.productImages)) {
      firstNameProductImages = JSON.stringify(
        body.productImages
          .filter((u: unknown): u is string => typeof u === "string" && u.startsWith("http"))
          .slice(0, 6)
      );
    }

    const producer = await prisma.producer.create({
      data: {
        userId,
        businessName,
        businessNameSi: String(body.businessNameSi || "").trim() || businessName,
        description: String(body.description || "").trim(),
        descriptionSi: String(body.descriptionSi || "").trim() || String(body.description || "").trim(),
        location,
        district,
        phone,
      },
    });

    if (productName && category) {
      await prisma.product.create({
        data: {
          producerId: producer.id,
          categoryId: category.id,
          name: productName,
          nameSi: String(body.productNameSi || "").trim() || productName,
          description: String(body.productDescription || "").trim(),
          descriptionSi: String(body.productDescriptionSi || "").trim() || String(body.productDescription || "").trim(),
          price: productPrice,
          unit: String(body.productUnit || "piece").trim() || "piece",
          unitSi: String(body.productUnitSi || "කැබැල්ල").trim() || "කැබැල්ල",
          stock: parseInt(body.productStock) || 0,
          images: firstNameProductImages,
        },
      });
    }

    return NextResponse.json({ producer, message: "Application submitted" });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
