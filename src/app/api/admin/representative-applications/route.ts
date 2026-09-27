import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * Admin review queue for representative applications.
 *
 * Bank details are deliberately NOT selected here. This list is a triage view
 * and the account numbers are not needed to decide whether to approve; they are
 * only fetched on the single-application view. Returning them in a list is how
 * them ending up in a log, a screenshot or a browser cache.
 */
export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = req.nextUrl.searchParams.get("status") ?? "PENDING,UNDER_REVIEW";
    const statuses = status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const take = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("take") ?? "50") || 50, 1),
      200
    );

    const applications = await prisma.representativeApplication.findMany({
      where: { status: { in: statuses } },
      orderBy: { createdAt: "asc" },
      take,
      select: {
        id: true,
        applicationCode: true,
        status: true,
        fullName: true,
        email: true,
        phone: true,
        whatsapp: true,
        district: true,
        province: true,
        preferredArea: true,
        experience: true,
        occupation: true,
        agreedTerms: true,
        agreedCommission: true,
        agreedPrivacy: true,
        confirmedAccurate: true,
        agreementsAt: true,
        reviewNotes: true,
        infoRequestNote: true,
        infoRequestedAt: true,
        reviewedAt: true,
        createdAt: true,
        representativeId: true,
        representative: { select: { id: true, code: true, status: true } },
      },
    });

    return NextResponse.json({ applications });
  } catch (error) {
    console.error("Application list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
