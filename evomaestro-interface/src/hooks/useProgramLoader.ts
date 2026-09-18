"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ProgramUpdateCallbacks,
  useEvolveShell,
} from "@/contexts/EvolveShellContext";
import { type Translate, useI18n } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import { getExperimentConfig, getPrograms } from "@/lib/api";
import type { Program, WSMessage } from "@/types";

interface UseProgramLoaderOptions {
  selectedDbPath: string | null;
  onClearSelection: () => void;
  onHydrateReviewPriorityPrograms?: (programs: Program[]) => void;
}

interface TimestampResult {
  last_modified_timestamp?: number;
}

function buildLoadedStatus(
  programCount: number,
  locale: AppLocale,
  t: Translate,
): string {
  const timeStr = new Date().toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return t("loader.loaded", { count: programCount, time: timeStr });
}

export function useProgramLoader({
  selectedDbPath,
  onClearSelection,
  onHydrateReviewPriorityPrograms,
}: UseProgramLoaderOptions) {
  const { locale, t } = useI18n();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [numIslands, setNumIslands] = useState(1);
  const [usesCustomReviewPrioritization, setUsesCustomReviewPrioritization] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState(() => t("loader.initializing"));
  const [lastModified, setLastModified] = useState<number | null>(null);
  const isReloading = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const activePath = useRef(selectedDbPath);
  activePath.current = selectedDbPath;
  const [configLoading, setConfigLoading] = useState(true);

  // --- Incremental update callbacks (registered with context) ---
  const { programUpdateCallbackRef } = useEvolveShell();

  useEffect(() => {
    const callbacks: ProgramUpdateCallbacks = {
      onQueued(msg: Extract<WSMessage, { type: "program.queued" }>) {
        setPrograms((prev) => {
          if (prev.some((p) => p.id === msg.program_id)) return prev;
          const ghost: Program = {
            id: msg.program_id,
            parent_id: msg.parent_id,
            generation: msg.generation,
            code: msg.code,
            code_diff: msg.code_diff,
            timestamp: msg.timestamp,
            island_idx: msg.island_idx,
            metadata: msg.metadata,
            archive_inspiration_ids: msg.archive_inspiration_ids,
            top_k_inspiration_ids: msg.top_k_inspiration_ids,
            _lifecycle: "queued",
          };
          return [...prev, ghost];
        });
      },
      onGenerated(program: Program) {
        const generated = { ...program, _lifecycle: "generated" as const };
        setPrograms((prev) => {
          const idx = prev.findIndex((p) => p.id === generated.id);
          if (idx >= 0) {
            // Upgrade ghost → real in-place.  Keep the ghost's timestamp
            // so the tree sort order (generation → timestamp) stays stable
            // and the node doesn't jump to a new position.
            const next = [...prev];
            next[idx] = { ...generated, timestamp: prev[idx].timestamp };
            return next;
          }
          // No ghost existed — just append
          return [...prev, generated];
        });
      },
    };
    programUpdateCallbackRef.current = callbacks;
    return () => {
      // Only clear if the ref still points to *our* callbacks object —
      // a new effect execution may have already installed a replacement.
      if (programUpdateCallbackRef.current === callbacks) {
        programUpdateCallbackRef.current = null;
      }
    };
  }, [programUpdateCallbackRef]);

  const loadTimestamp = useCallback(
    async (dbPath: string, signal?: AbortSignal) => {
      const timestampResult = (await getPrograms(dbPath, {
        timestampCheck: true,
        signal,
      })) as TimestampResult;

      if (signal?.aborted || activePath.current !== dbPath) return null;
      if (timestampResult.last_modified_timestamp) {
        setLastModified(timestampResult.last_modified_timestamp);
      }

      return timestampResult.last_modified_timestamp ?? null;
    },
    [],
  );

  const reloadPrograms = useCallback(
    async (statusMessage?: string) => {
      if (!selectedDbPath || isReloading.current) return;

      const request = new AbortController();
      requestRef.current?.abort();
      requestRef.current = request;
      isReloading.current = true;
      setLoading(true);
      setError(null);
      if (statusMessage) {
        setScanStatus(statusMessage);
      }

      try {
        const data = (await getPrograms(selectedDbPath, {
          signal: request.signal,
        })) as Program[];
        if (request.signal.aborted || activePath.current !== selectedDbPath)
          return;
        // Merge: keep queued ghosts that aren't in the REST response yet
        // (they haven't been written to the DB, so REST won't return them).
        // Programs that ARE in REST data get marked "generated".
        setPrograms((prev) => {
          const restIds = new Set(data.map((p) => p.id));
          const survivingGhosts = prev.filter(
            (p) => p._lifecycle === "queued" && !restIds.has(p.id),
          );
          const merged = data.map((p) => ({
            ...p,
            _lifecycle: "generated" as const,
          }));
          return survivingGhosts.length > 0
            ? [...merged, ...survivingGhosts]
            : merged;
        });
        onHydrateReviewPriorityPrograms?.(data);
        setScanStatus(buildLoadedStatus(data.length, locale, t));
        await loadTimestamp(selectedDbPath, request.signal);
      } catch (e: unknown) {
        if (request.signal.aborted || activePath.current !== selectedDbPath)
          return;
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : String(e);

        setError(t("loader.loadProgramsFailed", { message }));
        setPrograms([]);
        setLastModified(null);

        if (message.includes("503") || message.toLowerCase().includes("busy")) {
          setScanStatus(t("loader.databaseBusy"));
        } else {
          setScanStatus(t("loader.loadDataError"));
        }
      } finally {
        if (requestRef.current === request && !request.signal.aborted) {
          setLoading(false);
          isReloading.current = false;
        }
      }
    },
    [loadTimestamp, locale, onHydrateReviewPriorityPrograms, selectedDbPath, t],
  );

  const checkForUpdates = useCallback(async () => {
    if (!selectedDbPath || isReloading.current) return;

    try {
      const nextTimestamp = await loadTimestamp(selectedDbPath);
      if (!nextTimestamp) return;

      if (lastModified === null) {
        setLastModified(nextTimestamp);
        return;
      }

      if (nextTimestamp > lastModified) {
        await reloadPrograms(t("loader.autoRefreshing"));
      }
    } catch {
      // Auto-refresh failures are best-effort and should not interrupt the UI.
    }
  }, [lastModified, loadTimestamp, reloadPrograms, selectedDbPath, t]);

  useEffect(() => {
    if (selectedDbPath) {
      void reloadPrograms();
      return () => {
        requestRef.current?.abort();
        isReloading.current = false;
      };
    }

    setPrograms([]);
    setError(null);
    setLastModified(null);
    setUsesCustomReviewPrioritization(false);
    onClearSelection();
  }, [onClearSelection, reloadPrograms, selectedDbPath]);

  useEffect(() => {
    if (!selectedDbPath) {
      setUsesCustomReviewPrioritization(false);
      return;
    }

    const request = new AbortController();
    setConfigLoading(true);
    getExperimentConfig(selectedDbPath, request.signal)
      .then((cfg) => {
        if (request.signal.aborted) return;
        setUsesCustomReviewPrioritization(
          cfg.uses_custom_review_prioritization ?? false,
        );
        setNumIslands(cfg.num_islands ?? 1);
      })
      .catch((err) => {
        if (request.signal.aborted) return;
        console.warn("Failed to load experiment config:", err);
        setUsesCustomReviewPrioritization(false);
        setNumIslands(1);
      })
      .finally(() => {
        if (!request.signal.aborted) setConfigLoading(false);
      });
    return () => request.abort();
  }, [selectedDbPath]);

  return {
    programs,
    numIslands,
    usesCustomReviewPrioritization,
    configLoading,
    loading,
    error,
    scanStatus,
    setScanStatus,
    autoRefreshBaseline: lastModified,
    reloadPrograms,
    checkForUpdates,
  };
}
