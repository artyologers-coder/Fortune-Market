import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  approveApplication,
  rejectApplication,
  requestApplicationInfo,
  ApplicationStateError,
} from "@/lib/representative-admin";

/**
 * Approve / reject / request-info on a representative application.
 *
 * The admin identity comes from the session, never from the request body, so a
 * caller cannot approve their own application by putting someone else's id in
 * the payload.
 */
async function decide(
  req: NextRequest,
  params: { id: string },
  action: "approve" | "reject" | "request-info"
) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = { id: session.user.id, role: "ADMIN" };
    const applicationId = params.id;
    if (!applicationId) {
      return NextResponse.json({ error: "Application id is required" }, { status: 400 });
    }

    if (action === "approve") {
      const result = await approveApplication(applicationId, admin);
      return NextResponse.json({
        representativeId: result.representativeId,
        code: result.code,
        alreadyApproved: result.alreadyApproved,
        message: result.alreadyApproved
          ? "This application was already approved; the existing representative was returned."
          : "Application approved.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const note = String(body.reason ?? body.note ?? "");

    if (action === "reject") {
      await rejectApplication(applicationId, admin, note);
      return NextResponse.json({ message: "Application rejected." });
    }

    await requestApplicationInfo(applicationId, admin, note);
    return NextResponse.json({ message: "Information requested from the applicant." });
  } catch (error) {
    if (error instanceof ApplicationStateError) {
      // 409: the request was well-formed but conflicts with current state.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(`Application ${action} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "approve") return decide(req, params, "approve");
  if (action === "reject") return decide(req, params, "reject");
  if (action === "request-info") return decide(req, params, "request-info");
  return NextResponse.json(
    { error: "Unknown action. Use approve, reject or request-info." },
    { status: 400 }
  );
}
