"use client";

import { useEffect } from "react";

interface UseWebSocketReloadOptions {
  selectedDbPath: string | null;
  reloadTrigger: number;
  reloadPrograms: (statusMessage?: string) => Promise<void>;
}

export function useWebSocketReload({
  selectedDbPath,
  reloadTrigger,
  reloadPrograms,
}: UseWebSocketReloadOptions) {
  useEffect(() => {
    if (!selectedDbPath || reloadTrigger === 0) return;
    void reloadPrograms("Updating via WebSocket...");
  }, [reloadPrograms, reloadTrigger, selectedDbPath]);
}
