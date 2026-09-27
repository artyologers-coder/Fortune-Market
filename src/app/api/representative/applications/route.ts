import { NextRequest, NextResponse } from "next/server";
import {
  submitRepresentativeApplication,
  notifyAdminsOfApplication,
  ApplicationValidationError,
} from "@/lib/representative-application";
import { rateLimit } from "@/lib/rate-limit";
import { featureUnavailable } from "@/lib/feature-guard";

export async function POST(req: NextRequest) {
  const unavailable = featureUnavailable("REPRESENTATIVE_APPLICATIONS");
  if (unavailable) return unavailable;

  // Per-IP, because this is an unauthenticated public form that creates real
  // User rows. The limit is generous enough for a shared office NAT and low
  // enough to stop scripted bulk signup.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limited = await rateLimit(`rep-application:${ip}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many applications from this connection. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    const result = await submitRepresentativeApplication({
      fullName: String(body.fullName ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      whatsapp: body.whatsapp ? String(body.whatsapp) : null,
      password: String(body.password ?? ""),
      nic: body.nic ? String(body.nic) : null,
      dateOfBirth: body.dateOfBirth ? String(body.dateOfBirth) : null,
      address: body.address ? String(body.address) : null,
      district: String(body.district ?? ""),
      province: body.province ? String(body.province) : null,
      preferredArea: body.preferredArea ? String(body.preferredArea) : null,
      coverageAreas: Array.isArray(body.coverageAreas) ? body.coverageAreas.map(String) : [],
      experience: body.experience ? String(body.experience) : null,
      occupation: body.occupation ? String(body.occupation) : null,
      socialProfileLink: body.socialProfileLink ? String(body.socialProfileLink) : null,
      bankName: body.bankName ? String(body.bankName) : null,
      bankAccountName: body.bankAccountName ? String(body.bankAccountName) : null,
      bankAccountNumber: body.bankAccountNumber ? String(body.bankAccountNumber) : null,
      bankBranch: body.bankBranch ? String(body.bankBranch) : null,
      paymentMethodNotes: body.paymentMethodNotes ? String(body.paymentMethodNotes) : null,
      agreedTerms: body.agreedTerms === true,
      agreedCommission: body.agreedCommission === true,
      agreedPrivacy: body.agreedPrivacy === true,
      confirmedAccurate: body.confirmedAccurate === true,
    });

    // Best-effort: the applicant is already submitted and must not be shown a
    // failure because the admin notification had a problem.
    await notifyAdminsOfApplication(result.applicationId, result.applicationCode).catch(() => {});

    return NextResponse.json(
      {
        message:
          "Application submitted. An admin will review it, and you will be able to sign in to track its status.",
        applicationCode: result.applicationCode,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ApplicationValidationError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 }
      );
    }
    // A unique-constraint violation on email/phone means two applications
    // raced. Same message as the friendly pre-check, so it does not leak which
    // field collided.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "An account with this email or mobile number already exists. Try signing in instead.",
          field: "email",
        },
        { status: 409 }
      );
    }
    console.error("Representative application error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
