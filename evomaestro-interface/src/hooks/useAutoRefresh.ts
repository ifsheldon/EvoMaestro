"use client";

import { useEffect } from "react";

interface UseAutoRefreshOptions {
  enabled: boolean;
  selectedDbPath: string | null;
  intervalMs: number;
  checkForUpdates: () => Promise<void>;
}

export function useAutoRefresh({
  enabled,
  selectedDbPath,
  intervalMs,
  checkForUpdates,
}: UseAutoRefreshOptions) {
  useEffect(() => {
    if (!enabled || !selectedDbPath) return;

    const interval = window.setInterval(() => {
      void checkForUpdates();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [checkForUpdates, enabled, intervalMs, selectedDbPath]);
}
