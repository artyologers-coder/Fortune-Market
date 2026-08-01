"use client";

import { useEffect } from "react";
import { startSyncScheduler } from "@/lib/sync-scheduler";

export function SyncInitializer() {
  useEffect(() => {
    startSyncScheduler();
  }, []);

  return null;
}
