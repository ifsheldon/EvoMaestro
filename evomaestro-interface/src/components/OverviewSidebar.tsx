"use client";

import { ChevronRight, Eye, Loader2 } from "lucide-react";
import { marked } from "marked";
import { useEffect, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";
import { getMetaContent, getMetaFiles } from "@/lib/api";
import {
  extractGlobalInsights,
  overviewContent,
} from "@/utils/overviewContent";

interface OverviewSidebarProps {
  open: boolean;
  openedByGuide?: boolean;
  onClose: () => void;
  dbPath: string | null;
  /** Pass programs.length so the sidebar re-fetches when new programs arrive. */
  programCount?: number;
}

export function OverviewSidebar({
  open,
  openedByGuide = false,
  onClose,
  dbPath,
  programCount,
}: OverviewSidebarProps) {
  const { t, locale } = useI18n();
  const { dataset } = useEvolveShell();
  const [generation, setGeneration] = useState<number | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: new programs can produce a newer summary
  useEffect(() => {
    if (!open || !dbPath) return;
    const request = new AbortController();
    setContent(null);
    setGeneration(null);
    setLoading(true);
    setError(null);
    const selectedPath = dbPath;
    async function load() {
      const files = await getMetaFiles(selectedPath, request.signal);
      const latest = files.at(-1);
      if (!latest) return;
      const meta = await getMetaContent(
        selectedPath,
        latest.generation,
        request.signal,
      );
      if (!request.signal.aborted) {
        setContent(extractGlobalInsights(meta.content));
        setGeneration(latest.generation);
      }
    }
    load()
      .catch((err: unknown) => {
        if (!request.signal.aborted)
          setError(
            err instanceof Error ? err.message : t("overview.loadFailed"),
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [open, dbPath, programCount, t]);

  const display = overviewContent(
    content,
    openedByGuide,
    generation !== null && generation === dataset?.example_summary_generation,
    locale,
  );

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div
      data-tour="overview-sidebar"
      aria-hidden={!open}
      inert={!open}
      className={`
        fixed top-0 right-0 h-full w-[520px] z-30
        bg-white
        border-l border-gray-200
        shadow-2xl
        transform transition-transform duration-300 ease-out
        ${open ? "translate-x-0" : "translate-x-full"}
        flex flex-col pointer-events-auto
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-800">
            {t("workspace.evolutionOverview")}
          </span>
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100"
          title={t("common.close")}
          onClick={onClose}
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {display?.label && !loading && !error && (
        <div className="px-5 pt-4 text-xs font-medium text-indigo-700">
          {display.label}
        </div>
      )}
      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-5">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t("common.loading")}
          </div>
        )}
        {error && (
          <div className="text-sm text-red-500 p-3 bg-red-50 rounded">
            {error}
          </div>
        )}
        {!loading && !error && display === null && (
          <div className="text-sm text-gray-400 text-center mt-8">
            {t("overview.empty")}
          </div>
        )}
        {!loading && !error && display !== null && (
          <div
            className="prose prose-sm max-w-none"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from trusted meta scratchpad via marked
            dangerouslySetInnerHTML={{
              __html: marked.parse(display.content) as string,
            }}
          />
        )}
      </div>
    </div>
  );
}
