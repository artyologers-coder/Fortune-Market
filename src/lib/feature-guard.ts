import { NextResponse } from "next/server";
import { isFeatureEnabled, type FeatureFlag } from "@/lib/feature-flags";

/**
 * Returns a 404 JSON response when the given feature flag is disabled.
 * Use as the first guard inside a route handler (e.g. the reseller/sync
 * surface) so the endpoints become unreachable until the flag flips on.
 */
export function featureUnavailable(flag: FeatureFlag) {
  if (isFeatureEnabled(flag)) return null;
  return NextResponse.json(
    { error: "This feature is not available yet." },
    { status: 404 }
  );
}