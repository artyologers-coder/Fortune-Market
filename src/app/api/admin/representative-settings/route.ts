import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  FEE_ENFORCEMENT_MODES,
  getSettings,
  updateSettings,
  SettingsValidationError,
} from "@/lib/representative-settings";

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

/** The current settings, plus the recent change history. */
export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getSettings();
    return NextResponse.json({
      settings,
      modes: FEE_ENFORCEMENT_MODES,
    });
  } catch (error) {
    console.error("Representative settings read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Change the money split, the fee-enforcement gate, or the producer target.
 *
 * Two things are deliberately awkward, because both change real money:
 *
 *  - `feeEnforcementMode` is refused while the programme is in production. The
 *    gate decides whether every producer pays a fee, and a stray toggle in
 *    production would either waive revenue or take a fee from someone the
 *    business had agreed to let in free. It is a deliberate, timed change that
 *    has to be made in the database, not a field a UI dropdown can flip.
 *  - Every change needs a reason. updateSettings records a revision and an
 *    audit row, and "why" is the only part that cannot be reconstructed later.
 *
 * Validation (whole rupees, the split adding up) lives in the library, so the
 * same rules apply however settings are changed.
 */
export async function PATCH(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : "";

    if (!reason.trim()) {
      return NextResponse.json(
        { error: "A reason is required for every settings change." },
        { status: 400 }
      );
    }

    if (typeof body?.feeEnforcementMode === "string") {
      const current = await getSettings();
      if (body.feeEnforcementMode !== current.feeEnforcementMode) {
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json(
            {
              error:
                "The fee-enforcement gate cannot be changed from the admin UI in production. It decides whether every producer pays, so it is changed deliberately in the database with a scheduled start time.",
            },
            { status: 409 }
          );
        }
        if (!FEE_ENFORCEMENT_MODES.includes(body.feeEnforcementMode)) {
          return NextResponse.json({ error: "Unknown fee-enforcement mode." }, { status: 400 });
        }
      }
    }

    // Coerce the numeric fields rather than trusting the shape of a JSON body.
    const patch: Record<string, unknown> = {};
    for (const key of [
      "producerAnnualRegistrationFee",
      "representativeInitialCommission",
      "fortuneMarketInitialAllocation",
      "renewalCommissionAmount",
    ] as const) {
      if (body?.[key] !== undefined) {
        const n = Number(body[key]);
        if (!Number.isInteger(n) || n < 0) {
          return NextResponse.json(
            { error: `${key} must be a whole number of rupees, zero or more.` },
            { status: 400 }
          );
        }
        patch[key] = n;
      }
    }
    if (body?.renewalCommissionEnabled !== undefined) {
      patch.renewalCommissionEnabled = Boolean(body.renewalCommissionEnabled);
    }
    if (body?.initialProducerTarget !== undefined) {
      const n = body.initialProducerTarget === null ? null : Number(body.initialProducerTarget);
      if (n !== null && (!Number.isInteger(n) || n < 0)) {
        return NextResponse.json(
          { error: "initialProducerTarget must be a whole number, or null." },
          { status: 400 }
        );
      }
      patch.initialProducerTarget = n;
    }
    if (typeof body?.feeEnforcementMode === "string") {
      patch.feeEnforcementMode = body.feeEnforcementMode;
    }

    const settings = await updateSettings(patch as never, admin, reason);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Representative settings update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
