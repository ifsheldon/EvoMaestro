"use client";

import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Lightbulb,
  Send,
  X,
} from "lucide-react";
import { marked } from "marked";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { ProgramChips } from "../ProgramChips";

interface SuggestModalProps {
  program: Program;
  /** Called when the user closes the popup or after a successful submission. */
  onClose: () => void;
}

const PATCH_TYPE_OPTIONS = [
  { value: "full", labelKey: "suggest.fullRewrite" },
  { value: "diff", labelKey: "suggest.diffPatch" },
  { value: "auto", labelKey: "suggest.auto" },
];

/**
 * Floating popup for submitting expert suggestions for a selected program.
 * Triggered by right-click → "Suggest" on a tree node.
 */
export default function SuggestModal({ program, onClose }: SuggestModalProps) {
  const { t } = useI18n();
  const { doSuggest, readOnly } = useEvolveShell();
  const [prompt, setPrompt] = useState("");
  const [patchType, setPatchType] = useState("auto");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showMetaRec, setShowMetaRec] = useState(true);

  const metaRec = program.metadata?.meta_recommendations;

  const { panelRef, panelStyle, dragHandlers, resizeHandles } =
    useResizablePanel({
      defaultW: 560,
      defaultH: metaRec ? 420 : 280,
      minW: 380,
      minH: 220,
      initialPos: (w, h) => ({
        x: Math.round((window.innerWidth - w) / 2),
        y: window.innerHeight - h - 20,
      }),
    });

  // Reset state when the target program changes
  useEffect(() => {
    setPrompt("");
    setFeedback(null);
    setSubmitting(false);
  }, []);

  const { showToast } = useToast();
  const canSubmit = !readOnly && prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await doSuggest(program.id, prompt.trim(), patchType);
      showToast(t("suggest.submittedToast"));
      onClose();
    } catch (err) {
      // Keep popup open and show the error so the user can retry
      const raw = err instanceof Error ? err.message : String(err);
      // Make network / connection errors friendlier
      const message =
        raw.includes("Failed to fetch") || raw.includes("NetworkError")
          ? t("errors.backendUnavailable")
          : raw;
      setFeedback(`${t("common.error")}: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="bg-white border border-blue-300 rounded-xl shadow-xl flex flex-col"
      style={panelStyle}
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <GripHorizontal className="w-4 h-4 text-blue-400" />
          <Lightbulb className="w-4 h-4" />
          {t("suggest.title")}
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100"
          title={t("common.close")}
          onClick={onClose}
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-3">
        <ProgramChips programs={[program]} variant="blue" />

        {/* Meta recommendation reference */}
        {typeof metaRec === "string" && metaRec.length > 0 && (
          <div className="border border-amber-200 rounded bg-amber-50/50">
            <button
              type="button"
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100/50 rounded-t"
              onClick={() => setShowMetaRec((prev) => !prev)}
            >
              <span>{t("suggest.recommendation")}</span>
              {showMetaRec ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showMetaRec && (
              <div
                className="px-2.5 pb-2 text-xs text-gray-700 prose prose-sm max-w-none max-h-[10rem] overflow-y-auto"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from trusted program metadata via marked
                dangerouslySetInnerHTML={{
                  __html: marked.parse(metaRec) as string,
                }}
              />
            )}
          </div>
        )}

        {/* Guidance textarea */}
        <textarea
          className="w-full border border-gray-300 rounded p-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder={t("suggest.placeholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={submitting}
          rows={3}
        />

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-600 flex items-center gap-1">
            {t("suggest.patchType")}:
            <select
              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
              value={patchType}
              onChange={(e) => setPatchType(e.target.value)}
              disabled={submitting}
            >
              {PATCH_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            <Send className="w-3 h-3" />
            {submitting ? t("suggest.submitting") : t("suggest.submit")}
          </button>
        </div>

        {feedback && (
          <p
            className={`text-xs ${
              feedback.startsWith(t("common.error"))
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            {feedback}
          </p>
        )}
      </div>

      {resizeHandles}
    </div>
  );
}
