export function getWorkerStatus() {
  return {
    running: false,
    syncing: false,
    intervalMinutes: parseInt(process.env.RESYNC_INTERVAL_MINUTES || "30", 10),
    note: "Worker runs as separate process. Use 'npm run worker' to start.",
  };
}