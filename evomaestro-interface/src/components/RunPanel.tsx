"use client";

import { Pause, Play, SkipForward, Square, StepForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { RunState } from "@/types";

// ---------------------------------------------------------------------------
// Status badge styles (moved from Controls.tsx)
// ---------------------------------------------------------------------------

const statusStyles: Record<
  RunState,
  { bg: string; text: string; labelKey: string }
> = {
  running: { bg: "bg-green-100", text: "text-green-700", labelKey: "running" },
  paused: { bg: "bg-yellow-100", text: "text-yellow-700", labelKey: "paused" },
  idle: { bg: "bg-cyan-100", text: "text-cyan-700", labelKey: "idle" },
  waiting_for_start: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    labelKey: "readyToStart",
  },
  completed: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    labelKey: "completed",
  },
  stopped: { bg: "bg-gray-200", text: "text-gray-600", labelKey: "stopped" },
  error: { bg: "bg-red-100", text: "text-red-600", labelKey: "error" },
  unknown: { bg: "bg-gray-100", text: "text-gray-500", labelKey: "unknown" },
};

const STATUS_STALE_AFTER_MS = 30_000;
const DATA_BACKEND_STALE_AFTER_MS = 15_000;
const STATUS_STALE_CHECK_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// RunPanel component
// ---------------------------------------------------------------------------

export function RunPanel() {
  const { t } = useI18n();
  const { state, readOnly, doPause, doResume, doStart, doStep, doSetTarget } =
    useEvolveShell();

  const {
    run_state,
    generation,
    queued_jobs,
    target_generations,
    total_programs,
    generation_backend_heartbeat_at,
  } = state.runStatus;
  const pending = readOnly || state.pendingCount > 0;
  const [nowMs, setNowMs] = useState(() => Date.now());

  // --- Collapse state ---
  const [isCollapsed, setIsCollapsed] = useState(false);

  // --- Drag / resize via shared hook ---
  const { panelRef, panelStyle, dragHandlers, resizeHandles, hasResized } =
    useResizablePanel({
      defaultW: 260,
      defaultH: 200,
      minW: 200,
      minH: 80,
      positioning: "absolute",
      resizeDirections: ["se"],
      initialPos: (_w, _h) => {
        // Bottom-left: compute top from parent height. Falls back to a safe
        // offset when the parent isn't measurable yet.
        const parent = document.querySelector(
          "[data-panel-container='workspace']",
        );
        const parentH = parent?.getBoundingClientRect().height ?? 600;
        return { x: 16, y: parentH - 200 - 16 };
      },
    });

  // --- Editable remaining field ---
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, STATUS_STALE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // --- Don't render when no run ---
  if (run_state === "unknown") return null;

  const style = statusStyles[run_state] || statusStyles.unknown;
  // The runner's `generation` (= completed_generations) and `target_generations`
  // can lag behind the actual program count (e.g. initial seed, interactive
  // suggest/merge nodes added past the original target). We display the
  // user-facing program count instead, and pad the displayed target by the
  // same offset so the progress bar shows nodes-in-DB / total-goal-in-DB
  // terms. `remaining` stays equal to runner's `target_generations - generation`
  // so that editing it still maps cleanly to `doSetTarget(generation + val)`.
  const offset = Math.max(0, total_programs - generation);
  const displayedCount = Math.max(generation, total_programs);
  const displayedTarget = Math.max(target_generations + offset, displayedCount);
  const remaining = Math.max(0, displayedTarget - displayedCount);
  const progressPct =
    displayedTarget > 0
      ? Math.min(100, (displayedCount / displayedTarget) * 100)
      : 0;
  const queuedPct =
    displayedTarget > 0
      ? Math.min(100 - progressPct, (queued_jobs / displayedTarget) * 100)
      : 0;

  const isRunning = run_state === "running";
  const isIdle = run_state === "idle";
  const isWaitingForStart = run_state === "waiting_for_start";
  const isFinished = run_state === "completed" || run_state === "stopped";
  const dataBackendAgeMs =
    state.lastBackendStatusSeenAt > 0
      ? nowMs - state.lastBackendStatusSeenAt * 1000
      : 0;
  const generationBackendAgeMs =
    generation_backend_heartbeat_at > 0
      ? nowMs - generation_backend_heartbeat_at * 1000
      : 0;
  const isDataBackendStale =
    !isFinished &&
    state.lastBackendStatusSeenAt > 0 &&
    dataBackendAgeMs > DATA_BACKEND_STALE_AFTER_MS;
  const isGenerationBackendStale =
    !isFinished &&
    generation_backend_heartbeat_at > 0 &&
    generationBackendAgeMs > STATUS_STALE_AFTER_MS;
  const showBackendWarning =
    !readOnly && (isDataBackendStale || isGenerationBackendStale);

  const handleRemainingEdit = () => {
    if (readOnly) return;
    setEditValue(String(remaining));
    setIsEditing(true);
  };

  const handleRemainingConfirm = () => {
    const val = Number.parseInt(editValue, 10);
    if (!Number.isNaN(val) && val >= 0) {
      void doSetTarget(generation + val);
    }
    setIsEditing(false);
  };

  const handleStop = () => {
    // Set target to current generation (remaining = 0), in-flight drains naturally
    void doSetTarget(generation);
  };

  // --- Collapsed state ---
  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        className="absolute bg-white/95 px-3 py-2 border border-gray-300 rounded-lg shadow-lg text-xs pointer-events-auto cursor-pointer hover:bg-gray-50 flex items-center gap-1 z-30"
        style={{ left: panelStyle.left, top: panelStyle.top }}
        title={t("run.showControl")}
      >
        <Play className="w-3 h-3" />
        {t("run.control")} ▶
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      data-tour="run-panel"
      className="bg-white/95 p-3 border border-gray-300 rounded-lg shadow-lg text-xs pointer-events-auto flex flex-col"
      style={{
        ...panelStyle,
        ...(hasResized
          ? { overflow: "auto" }
          : { width: "auto", height: "auto", maxHeight: "85vh" }),
        minWidth: 200,
      }}
    >
      {/* Header / drag handle */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-300">
        <div
          className="flex items-center gap-2 cursor-move flex-1"
          {...dragHandlers}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className="text-gray-400"
            fill="currentColor"
            role="img"
            aria-label={t("common.dragHandle")}
          >
            <circle cx="2" cy="3" r="1" />
            <circle cx="6" cy="3" r="1" />
            <circle cx="10" cy="3" r="1" />
            <circle cx="2" cy="6" r="1" />
            <circle cx="6" cy="6" r="1" />
            <circle cx="10" cy="6" r="1" />
            <circle cx="2" cy="9" r="1" />
            <circle cx="6" cy="9" r="1" />
            <circle cx="10" cy="9" r="1" />
          </svg>
          <span className="font-bold text-gray-900">{t("run.control")}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="text-gray-400 hover:text-gray-600 cursor-pointer ml-2 relative top-[-1px]"
          title={t("run.collapseControl")}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}
          >
            {readOnly ? t("guide.preview") : t(`run.status.${style.labelKey}`)}
          </span>
          {showBackendWarning && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
              {t("run.backendWarning")}
            </span>
          )}
          {queued_jobs > 0 && (
            <span className="text-gray-500 text-[10px]">Q: {queued_jobs}</span>
          )}
        </div>
        {showBackendWarning && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700">
            {isDataBackendStale
              ? t("run.noDataBackend", {
                  seconds: Math.floor(dataBackendAgeMs / 1000),
                })
              : t("run.noGenerationBackend", {
                  seconds: Math.floor(generationBackendAgeMs / 1000),
                })}
          </div>
        )}

        {/* Progress bar */}
        {!isWaitingForStart && displayedTarget > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex flex-row justify-between text-[10px] text-gray-600 mb-0.5">
              <span>
                {displayedCount}
                {queued_jobs > 0 && (
                  <span className="text-blue-400"> +{queued_jobs}</span>
                )}{" "}
                / {displayedTarget} {t("run.nodes")}
              </span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded h-1.5 overflow-hidden flex">
              <div
                className="bg-blue-500 h-1.5 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
              {queuedPct > 0 && (
                <div
                  className="bg-blue-300/50 h-1.5 transition-all duration-300"
                  style={{ width: `${queuedPct}%` }}
                />
              )}
            </div>
          </div>
        )}

        {/* Remaining field */}
        {!isWaitingForStart && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-gray-900 font-bold text-[11px]">
              {t("run.remaining")}:
            </span>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  className="w-12 px-1 py-0.5 border border-gray-300 rounded text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 shadow-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRemainingConfirm();
                    if (e.key === "Escape") setIsEditing(false);
                  }}
                />
                <button
                  type="button"
                  className="px-2 py-0.5 bg-blue-500 text-white rounded text-[10px] font-medium hover:bg-blue-600 shadow-sm transition-colors"
                  onClick={handleRemainingConfirm}
                >
                  {t("run.set")}
                </button>
                <button
                  type="button"
                  className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  onClick={() => setIsEditing(false)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="px-2 py-0.5 bg-white border border-gray-200 text-gray-800 rounded text-[10px] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-default shadow-sm transition-colors min-w-[2.5rem]"
                onClick={handleRemainingEdit}
                disabled={readOnly || isFinished}
                title={t("run.editRemaining")}
              >
                {remaining}
              </button>
            )}
          </div>
        )}

        {/* Control buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-200 mt-1 pb-1">
          {isWaitingForStart ? (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 border border-green-600 hover:bg-green-100 rounded font-bold text-[11px] disabled:opacity-50 shadow-sm transition-colors"
              onClick={() => void doStart()}
              disabled={pending}
            >
              <Play className="w-3 h-3 fill-green-700 text-green-700" />
              {t("common.start")}
            </button>
          ) : (
            <>
              {/* Step */}
              <button
                type="button"
                className="flex-[0.7] flex items-center justify-center border border-gray-200 rounded py-1 bg-white hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-white disabled:cursor-not-allowed text-blue-600 transition-colors shadow-sm"
                title={t("run.stepTitle")}
                onClick={() => void doStep()}
                disabled={pending || isRunning || isFinished}
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>

              {/* Pause / Continue */}
              {isRunning ? (
                <button
                  type="button"
                  className="flex-[2] flex items-center justify-center gap-1.5 px-2 py-1 border border-yellow-400 bg-white hover:bg-yellow-50 text-yellow-600 rounded font-bold text-[11px] disabled:opacity-50 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors shadow-sm"
                  title={t("common.pause")}
                  onClick={() => void doPause()}
                  disabled={pending}
                >
                  <Pause className="w-3 h-3 fill-yellow-600" />
                  <span>{t("common.pause")}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="flex-[2] flex items-center justify-center gap-1.5 px-2 py-1 border border-green-500 bg-white hover:bg-green-50 text-green-700 rounded font-bold text-[11px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors shadow-sm"
                  title={t("common.continue")}
                  onClick={() => void doResume()}
                  disabled={pending || remaining === 0 || isFinished}
                >
                  <SkipForward className="w-3 h-3" />
                  <span>{t("common.continue")}</span>
                </button>
              )}

              {/* Stop */}
              <button
                type="button"
                className="flex-[0.7] flex items-center justify-center border border-gray-200 rounded py-1 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white text-red-500 transition-colors shadow-sm"
                title={t("run.stopTitle")}
                onClick={handleStop}
                disabled={pending || isFinished || isIdle}
              >
                <Square className="w-3 h-3 border border-red-500 rounded-[2px]" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resize handle */}
      {resizeHandles}
    </div>
  );
}
