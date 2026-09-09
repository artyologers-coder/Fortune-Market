import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { updateDomainProfile } from "@/lib/reseller/scraper";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function GET() {
  if (!isFeatureEnabled("COMMISSION_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profiles = await prisma.scraperDomainProfile.findMany({
      orderBy: { domain: "asc" },
    });

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error("Settings list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isFeatureEnabled("COMMISSION_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { domain, supplierWhatsAppNumber, selectorConfig } = body;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const profile = await updateDomainProfile(domain, {
      supplierWhatsAppNumber,
      selectorConfig,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}