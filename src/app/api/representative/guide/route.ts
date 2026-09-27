import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { listVisibleGuide } from "@/lib/representative-guide";

/**
 * The guide, as a prospective or active representative reads it.
 *
 * Public on purpose: the whole point is to explain the programme to someone who
 * has not signed up yet, so there is no session check here. Only `visible`
 * sections are returned — hidden ones are editorial drafts and must not leak.
 *
 * Per request, deliberately. The content is edited in the admin, so a cached or
 * prerendered response would show representatives whatever the guide said at
 * build time — including sections an admin has since hidden.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("REPRESENTATIVE_APPLICATIONS")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const sections = await listVisibleGuide();
    return NextResponse.json({ sections });
  } catch (error) {
    console.error("Representative guide read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
