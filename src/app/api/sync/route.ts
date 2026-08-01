import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { syncAllActiveProducts } from "@/lib/stock-sync";
import {
  startSyncScheduler,
  stopSyncScheduler,
  getSyncSchedulerStatus,
} from "@/lib/sync-scheduler";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = getSyncSchedulerStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Sync status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "sync_all") {
      const results = await syncAllActiveProducts();
      return NextResponse.json({ results });
    }

    if (action === "start") {
      startSyncScheduler();
      return NextResponse.json({ message: "Scheduler started" });
    }

    if (action === "stop") {
      stopSyncScheduler();
      return NextResponse.json({ message: "Scheduler stopped" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Sync action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
