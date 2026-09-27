import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  registerProducer,
  DuplicateProducerError,
  SelfReferralError,
  SelfRegistrationError,
} from "@/lib/producer-registration";
import {
  getResolvedReferralFromCookies,
  clearReferralCookie,
} from "@/lib/referral-cookie";
import { DUPLICATE_NOTICE } from "@/lib/duplicate-detection";

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

    // Read the signed referral cookie. This is only a *claim*: the code is
    // re-resolved and the representative's current status re-read inside the
    // registration transaction, so a stale or replayed cookie cannot attribute
    // a producer to a representative who has since been suspended.
    const referral = await getResolvedReferralFromCookies();

    const result = await registerProducer({
      userId,
      businessName,
      businessNameSi: String(body.businessNameSi || "").trim() || businessName,
      description: String(body.description || "").trim(),
      descriptionSi: String(body.descriptionSi || "").trim() || String(body.description || "").trim(),
      location,
      district,
      phone,
      businessRegistrationNo: String(body.businessRegistrationNo || "").trim() || null,
      email: session.user.email ?? null,
      nic: String(body.nic || "").trim() || null,
      referral,
      firstProduct:
        productName && category
          ? {
              name: productName,
              nameSi: String(body.productNameSi || "").trim() || productName,
              description: String(body.productDescription || "").trim(),
              descriptionSi: String(body.productDescriptionSi || "").trim() || String(body.productDescription || "").trim(),
              price: productPrice,
              unit: String(body.productUnit || "piece").trim() || "piece",
              unitSi: String(body.productUnitSi || "කැබැල්ල").trim() || "කැබැල්ල",
              stock: parseInt(body.productStock) || 0,
              images: firstNameProductImages,
              categoryId: category.id,
            }
          : null,
    });

    // The referral is now locked to this producer in the database, so the cookie
    // has done its job. Clearing it stops the same browser from carrying the
    // attribution into a second, unrelated registration.
    clearReferralCookie();

    return NextResponse.json({
      message: "Application submitted",
      producer: result.producer,
      // The fee decision is frozen now, so this is the amount the producer owes
      // and it will not change if the gate moves before an admin reviews them.
      fee: {
        required: result.fee.required,
        basis: result.fee.basis,
        amount: result.fee.amount,
        currency: "LKR",
      },
      payment: { id: result.payment.id, status: result.payment.amount === 0 ? "NOT_REQUIRED" : "PENDING" },
      referredBy: result.referral ? { name: referral?.fullName ?? "your representative" } : null,
    });
  } catch (error) {
    if (error instanceof DuplicateProducerError) {
      return NextResponse.json(
        {
          error: DUPLICATE_NOTICE,
          code: "POSSIBLE_DUPLICATE",
          matches: error.duplicates.matches.map((m) => ({
            businessName: m.businessName,
            district: m.district,
            verificationStatus: m.verificationStatus,
            reasons: m.reasons,
          })),
        },
        { status: 409 }
      );
    }
    if (error instanceof SelfReferralError) {
      return NextResponse.json(
        { error: error.message, code: "SELF_REFERRAL" },
        { status: 409 }
      );
    }
    if (error instanceof SelfRegistrationError) {
      return NextResponse.json(
        { error: error.message, code: "SELF_REGISTRATION" },
        { status: 409 }
      );
    }
    console.error("Onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
