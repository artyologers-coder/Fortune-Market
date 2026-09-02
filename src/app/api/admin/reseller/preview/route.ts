import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { scrapeProductUrl } from "@/lib/reseller/scraper";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const scrapeResult = await scrapeProductUrl(url);

    let guessedCategoryId = null;
    if (scrapeResult.data) {
      const categories = await prisma.category.findMany({
        select: { id: true, name: true, nameSi: true, slug: true },
      });

      const text = `${scrapeResult.data.name} ${scrapeResult.data.description}`.toLowerCase();
      for (const cat of categories) {
        if (
          text.includes(cat.name.toLowerCase()) ||
          text.includes(cat.nameSi.toLowerCase()) ||
          cat.slug === "foods" && (text.includes("food") || text.includes("spice") || text.includes("curry")) ||
          cat.slug === "naturals" && (text.includes("herbal") || text.includes("oil") || text.includes("scrub")) ||
          cat.slug === "crafts" && (text.includes("craft") || text.includes("handmade") || text.includes("batik")) ||
          cat.slug === "fashion" && (text.includes("fashion") || text.includes("clothing") || text.includes("wear"))
        ) {
          guessedCategoryId = cat.id;
          break;
        }
      }
    }

    return NextResponse.json({
      preview: scrapeResult.data,
      outcome: scrapeResult.outcome,
      missingFields: scrapeResult.missingFields,
      error: scrapeResult.error,
      guessedCategoryId,
    });
  } catch (error) {
    console.error("Reseller preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}