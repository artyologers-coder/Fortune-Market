import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  deleteGuideSection,
  updateGuideSection,
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

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
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
    const updated = await updateGuideSection(
      params.id,
      {
        ...(body.slug !== undefined ? { slug: String(body.slug) } : {}),
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.body !== undefined ? { body: String(body.body) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
        ...(body.visible !== undefined ? { visible: body.visible !== false } : {}),
      },
      admin
    );
    return NextResponse.json({ section: updated });
  } catch (error) {
    if (error instanceof GuideValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Representative guide update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const blocked = guard();
  if (blocked) return blocked;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const removed = await deleteGuideSection(params.id, admin);
    return NextResponse.json({ removed: { id: params.id, slug: removed.slug } });
  } catch (error) {
    if (error instanceof GuideValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Representative guide delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
