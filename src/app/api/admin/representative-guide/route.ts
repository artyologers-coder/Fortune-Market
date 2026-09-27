import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  createGuideSection,
  listAllGuide,
  GuideValidationError,
} from "@/lib/representative-guide";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id, role: session.user.role };
}

function guard() {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }
  return null;
}

/** Every section, including hidden ones, for the editor. */
export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sections = await listAllGuide();
    return NextResponse.json({ sections });
  } catch (error) {
    console.error("Representative guide read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const created = await createGuideSection(
      {
        slug: String(body.slug ?? ""),
        title: String(body.title ?? ""),
        body: String(body.body ?? ""),
        sortOrder: Number(body.sortOrder ?? 0),
        visible: body.visible !== false,
      },
      admin
    );
    return NextResponse.json({ section: created }, { status: 201 });
  } catch (error) {
    if (error instanceof GuideValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Representative guide create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
