import cron from "node-cron";
import { runResyncPass } from "./sync";

const INTERVAL_MINUTES = parseInt(process.env.RESYNC_INTERVAL_MINUTES || "30", 10);

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

async function runSync() {
  if (isRunning) {
    console.log("[Worker] Sync already running, skipping");
    return;
  }
  isRunning = true;

  const startTime = Date.now();
  console.log(`[Worker] Starting resync pass at ${new Date().toISOString()}`);

  try {
    const results = await runResyncPass();
    const changed = results.filter(
      (r) => r.status === "price_changed" || r.status === "stock_changed" || r.status === "both_changed"
    );
    const errors = results.filter((r) => r.status === "error");
    const skipped = results.filter((r) => r.status === "skipped_unreachable" || r.status === "skipped_price_threshold");

    console.log(
      `[Worker] Completed in ${Date.now() - startTime}ms: ${results.length} sources, ${changed.length} changes, ${errors.length} errors, ${skipped.length} skipped`
    );
  } catch (error) {
    console.error("[Worker] Sync error:", error);
  } finally {
    isRunning = false;
  }
}

export function startWorker() {
  if (cronJob) {
    console.log("[Worker] Already started");
    return;
  }

  console.log(`[Worker] Starting scheduler (interval: ${INTERVAL_MINUTES}min)`);
  cronJob = cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, runSync);

  setTimeout(() => {
    runSync();
  }, 5000);
}

export function stopWorker() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[Worker] Scheduler stopped");
  }
}

export function getWorkerStatus() {
  return {
    running: cronJob !== null,
    syncing: isRunning,
    intervalMinutes: INTERVAL_MINUTES,
  };
}

if (require.main === module) {
  startWorker();
  console.log("[Worker] Running. Press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    console.log("\n[Worker] Shutting down...");
    stopWorker();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Worker] Shutting down...");
    stopWorker();
    process.exit(0);
  });
}