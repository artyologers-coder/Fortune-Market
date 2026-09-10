import { NextResponse } from "next/server";
import { syncAllActiveProducts } from "@/lib/stock-sync";
import { featureUnavailable } from "@/lib/feature-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const unavailable = featureUnavailable("COMMISSION_SYSTEM");
  if (unavailable) return unavailable;

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncAllActiveProducts();
    return NextResponse.json({ synced: results.length, results });
  } catch (error) {
    console.error("Cron sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
