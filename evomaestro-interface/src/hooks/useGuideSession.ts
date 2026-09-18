"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { getDatasetInfo, getGuideDataset } from "@/lib/api";
import type { DatasetInfo } from "@/types";

export const GUIDE_RECOVERY_KEY = "evolvis-guide-return";

export function readGuideRecovery(): { path: string | null } | null {
  const raw = sessionStorage.getItem(GUIDE_RECOVERY_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "path" in value &&
      (value.path === null || typeof value.path === "string")
    )
      return { path: value.path };
  } catch {
    /* An incomplete recovery record cannot select a dataset. */
  }
  sessionStorage.removeItem(GUIDE_RECOVERY_KEY);
  return null;
}

/** Keep the original workspace retained until the temporary guide is disposed. */
export function useGuideSession(
  originalPath: string | null,
  clearSelection: () => void,
) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<
    "idle" | "preparing" | "running" | "restoring"
  >("idle");
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const active = useRef(false);
  const restoring = useRef(false);
  const returnPath = useRef<string | null>(null);

  const finish = useCallback(
    async (message?: string) => {
      if (!active.current) return;
      active.current = false;
      restoring.current = true;
      pending.current?.abort();
      setPhase("restoring");
      setError(message ?? null);
      if (returnPath.current) {
        try {
          await getDatasetInfo(returnPath.current, AbortSignal.timeout(8000));
        } catch (reason) {
          if (reason instanceof Error && reason.message.startsWith("404 ")) {
            clearSelection();
            setError(t("guide.originalMissing"));
          }
        }
      }
      if (returnPath.current === null) clearSelection();
      setDataset(null);
      sessionStorage.removeItem(GUIDE_RECOVERY_KEY);
      restoring.current = false;
      setPhase("idle");
    },
    [clearSelection, t],
  );

  const start = useCallback(async () => {
    if (active.current || restoring.current) return;
    active.current = true;
    returnPath.current = originalPath;
    sessionStorage.setItem(
      GUIDE_RECOVERY_KEY,
      JSON.stringify({ path: originalPath }),
    );
    setError(null);
    setPhase("preparing");
    const request = new AbortController();
    pending.current = request;
    try {
      const guide = await getGuideDataset(request.signal);
      if (request.signal.aborted) return;
      if (guide.role !== "mock-guide" || !guide.read_only)
        throw new Error("Invalid guide dataset");
      setDataset(guide);
    } catch {
      if (!request.signal.aborted) void finish(t("guide.failed"));
    }
  }, [finish, originalPath, t]);

  useEffect(() => {
    const begin = () => void start();
    window.addEventListener("tour:start", begin);
    return () => window.removeEventListener("tour:start", begin);
  }, [start]);

  useEffect(() => {
    if (phase !== "preparing") return;
    const timer = setTimeout(() => void finish(t("guide.failed")), 20000);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void finish();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [phase, finish, t]);

  useEffect(() => () => pending.current?.abort(), []);
  const ready = useCallback(() => {
    if (active.current) setPhase("running");
  }, []);
  return {
    phase,
    dataset,
    error,
    start,
    finish,
    ready,
    dismissError: () => setError(null),
  };
}
