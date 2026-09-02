import { syncAllActiveProducts } from "./stock-sync";

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function runSync() {
  if (isRunning) return;
  isRunning = true;

  try {
    const results = await syncAllActiveProducts();
    const changed = results.filter(
      (r) => r.status === "price_changed" || r.status === "stock_changed" || r.status === "both_changed"
    );
    const errors = results.filter((r) => r.status === "error");

    console.log(
      `[StockSync] Completed: ${results.length} products synced, ${changed.length} changes, ${errors.length} errors`
    );
  } catch (error) {
    console.error("[StockSync] Scheduler error:", error);
  } finally {
    isRunning = false;
  }
}

export function startSyncScheduler() {
  if (schedulerInterval) return;

  console.log("[StockSync] Starting scheduler (interval: 30min)");
  schedulerInterval = setInterval(runSync, SYNC_INTERVAL_MS);

  setTimeout(() => {
    runSync();
  }, 5000);
}

export function stopSyncScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[StockSync] Scheduler stopped");
  }
}

export function getSyncSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    syncing: isRunning,
    intervalMinutes: SYNC_INTERVAL_MS / 60000,
  };
}
