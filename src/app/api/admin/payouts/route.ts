import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  approveCommission,
  approveEligibleCommissions,
  createPayoutForRepresentative,
  markPayoutPaid,
  markPayoutFailed,
  cancelPayout,
  listAllPayouts,
  getPayoutReadiness,
  PayoutStateError,
} from "@/lib/payout";

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

export async function GET(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const representativeId = req.nextUrl.searchParams.get("representativeId");

    if (representativeId) {
      return NextResponse.json(await getPayoutReadiness(representativeId));
    }

    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const payouts = await listAllPayouts(status);
    return NextResponse.json({ payouts });
  } catch (error) {
    if (error instanceof PayoutStateError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Payout list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * action=
 *   approve-commission   ?commissionId=      ELIGIBLE -> APPROVED
 *   approve-all          ?representativeId= every eligible commission
 *   create               ?representativeId= reserve everything payable
 *   pay                  ?payoutId=          the irreversible step
 *   fail                 ?payoutId=          transfer bounced, money returns
 *   cancel               ?payoutId=          abandoned, money returns
 */
export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams;
    const action = q.get("action");
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const repId = q.get("representativeId") ?? str(body.representativeId);
    const payoutId = q.get("payoutId") ?? str(body.payoutId);
    const commissionId = q.get("commissionId") ?? str(body.commissionId);

    if (!repId && ["approve-all", "create"].includes(action ?? "")) {
      return NextResponse.json({ error: "representativeId is required" }, { status: 400 });
    }
    if (!payoutId && ["pay", "fail", "cancel"].includes(action ?? "")) {
      return NextResponse.json({ error: "payoutId is required" }, { status: 400 });
    }

    switch (action) {
      case "approve-commission": {
        if (!commissionId) {
          return NextResponse.json({ error: "commissionId is required" }, { status: 400 });
        }
        return NextResponse.json({
          message: "Commission approved.",
          commission: await approveCommission(commissionId, admin),
        });
      }
      case "approve-all": {
        const result = await approveEligibleCommissions(repId, admin);
        return NextResponse.json({ message: "Eligible commissions approved.", ...result });
      }
      case "create": {
        const payout = await createPayoutForRepresentative(repId, admin, {
          method: str(body.method) || undefined,
          note: str(body.note) || undefined,
        });
        return NextResponse.json({ message: "Payout created.", payout });
      }
      case "pay": {
        const payout = await markPayoutPaid(payoutId, admin, {
          reference: str(body.reference),
          method: str(body.method) || undefined,
        });
        return NextResponse.json({ message: "Payout marked as paid.", payout });
      }
      case "fail": {
        const payout = await markPayoutFailed(payoutId, admin, str(body.reason));
        return NextResponse.json({ message: "Payout marked failed; the money is back in the pool.", payout });
      }
      case "cancel": {
        const payout = await cancelPayout(payoutId, admin, str(body.reason));
        return NextResponse.json({ message: "Payout cancelled; the money is back in the pool.", payout });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof PayoutStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Payout action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
