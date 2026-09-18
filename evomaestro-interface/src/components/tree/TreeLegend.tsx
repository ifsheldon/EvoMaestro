"use client";

import { useState } from "react";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { translatePatchType, useI18n } from "@/i18n";
import { PatchShapeIcon } from "./PatchShapeIcon";

const PERFORMANCE_GRADIENTS = {
  blues: "linear-gradient(to right, #eff6ff, #93c5fd, #1d4ed8)",
  viridis: "linear-gradient(to right, #440154, #21908d, #fde725)",
} as const;

export interface TreeLegendProps {
  patchTypes: string[];
  minScore: number;
  maxScore: number;
  /** Color scheme for the Performance gradient bar. Default: "blues". */
  colorScheme?: "blues" | "viridis";
  /** Global average score (displayed as an inline indicator). */
  averageScore?: number;
  /** CSS color string for the average score block. */
  averageScoreColor?: string;
  /** Whether the average filter is currently active. */
  isAverageFilterActive?: boolean;
  /** Callback to toggle filtering nodes below the global average. */
  onToggleAverageFilter?: () => void;
  /** Whether error nodes are visible. Default: true. */
  showErrorNodes?: boolean;
  /** Whether timeout nodes are visible. Default: true. */
  showTimeoutNodes?: boolean;
  /** Whether any error nodes exist in the dataset. */
  hasErrorNodes?: boolean;
  /** Whether any timeout nodes exist in the dataset. */
  hasTimeoutNodes?: boolean;
  /** Whether any human-origin nodes exist in the dataset. */
  hasHumanNodes?: boolean;
  /** Whether to show diff/full as a single "mutation" type. Default: true. */
  unifyMutationTypes?: boolean;
}

export function TreeLegend({
  patchTypes,
  minScore,
  maxScore,
  colorScheme = "blues",
  averageScore,
  averageScoreColor,
  isAverageFilterActive = false,
  onToggleAverageFilter,
  showErrorNodes = true,
  showTimeoutNodes = true,
  hasErrorNodes = true,
  hasTimeoutNodes = true,
  hasHumanNodes = true,
  unifyMutationTypes = true,
}: TreeLegendProps) {
  const { t } = useI18n();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { panelRef, panelStyle, dragHandlers, resizeHandles, hasResized } =
    useResizablePanel({
      defaultW: 340,
      defaultH: 200,
      minW: 220,
      minH: 80,
      positioning: "absolute",
      resizeDirections: ["nw", "ne", "sw", "se", "n", "e", "s", "w"],
      initialPos: () => ({ x: 16, y: 16 }),
    });

  if (isCollapsed) {
    return (
      <button
        type="button"
        data-panel="tree-legend"
        className="absolute bg-white/95 px-3 py-2 border border-gray-300 rounded-lg shadow-lg text-xs pointer-events-auto cursor-pointer hover:bg-gray-50"
        style={{ left: panelStyle.left, top: panelStyle.top }}
        onClick={() => setIsCollapsed(false)}
        title={t("legend.show")}
      >
        {t("legend.title")} ▶
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      data-panel="tree-legend"
      data-tour="tree-legend"
      className="bg-white/95 p-3 border border-gray-300 rounded-lg shadow-lg text-xs pointer-events-auto select-none"
      style={{
        ...panelStyle,
        overflow: "auto",
        ...(hasResized
          ? {}
          : { width: "auto", height: "auto", maxHeight: "85vh" }),
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-300">
        {/* biome-ignore lint/a11y/useSemanticElements: div used as drag handle, not a clickable button */}
        <div
          className="flex items-center gap-2 cursor-move flex-1"
          role="button"
          tabIndex={0}
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
          <span className="font-bold text-gray-900">{t("legend.title")}</span>
        </div>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600 cursor-pointer ml-2"
          onClick={() => setIsCollapsed(true)}
          title={t("legend.collapse")}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {/* Nodes column */}
        <div className="flex flex-col gap-2 min-w-[70px]">
          <div className="font-bold text-gray-900 border-b pb-1 mb-1">
            {t("legend.nodes")}
          </div>
          <div className="flex items-center gap-2">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className="shrink-0"
              aria-hidden="true"
            >
              {/* Bubble ring (hollow, drawn first) */}
              <circle
                cx="6"
                cy="6"
                r="5"
                fill="none"
                stroke="#facc15"
                strokeWidth="1.2"
              />
              {/* Node fill */}
              <circle cx="6" cy="6" r="2.5" fill="#93c5fd" />
            </svg>
            <span>{t("legend.best")}</span>
          </div>
          {showErrorNodes && hasErrorNodes && (
            <div className="flex items-center gap-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="5"
                  fill="#f1f5f9"
                  stroke="#ef4444"
                  strokeWidth="1.2"
                />
                <line
                  x1="3.5"
                  y1="3.5"
                  x2="8.5"
                  y2="8.5"
                  stroke="#ef4444"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <line
                  x1="8.5"
                  y1="3.5"
                  x2="3.5"
                  y2="8.5"
                  stroke="#ef4444"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              </svg>
              <span>{t("common.error")}</span>
            </div>
          )}
          {showTimeoutNodes && hasTimeoutNodes && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-100 border-2 border-red-500"></span>
              <span>{t("details.timeout")}</span>
            </div>
          )}
          {hasHumanNodes && (
            <div className="flex items-center gap-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="5"
                  fill="#1e40af"
                  stroke="#363636"
                  strokeWidth="0.8"
                />
                <text
                  x="6"
                  y="6"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="8"
                  fontWeight="bold"
                >
                  H
                </text>
              </svg>
              <span>{t("legend.human")}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <PatchShapeIcon type="init" />
            <span>{t("legend.init")}</span>
          </div>
        </div>

        {/* Patches column */}
        <div className="flex flex-col gap-2 min-w-[70px]">
          <div className="font-bold text-gray-900 border-b pb-1 mb-1">
            {t("legend.patches")}
          </div>
          {(() => {
            const filtered = patchTypes.filter(
              (t) => t !== "start" && t !== "init",
            );
            const items: { key: string; label: string }[] = [];
            if (unifyMutationTypes) {
              // Merge diff/full into a single "mutation" entry
              const hasDiffOrFull = filtered.some(
                (t) => t === "diff" || t === "full",
              );
              if (hasDiffOrFull)
                items.push({ key: "mutation", label: "mutation" });
              for (const t of filtered) {
                if (t !== "diff" && t !== "full")
                  items.push({ key: t, label: t });
              }
            } else {
              for (const t of filtered) {
                items.push({ key: t, label: t });
              }
            }
            if (items.length === 0)
              return (
                <span className="text-gray-400">
                  {t("details.notAvailable")}
                </span>
              );
            return items.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <PatchShapeIcon type={key} />
                <span>{translatePatchType(t, label)}</span>
              </div>
            ));
          })()}
        </div>

        {/* Colors column */}
        <div className="flex flex-col gap-2 min-w-[100px]">
          <div className="font-bold text-gray-900 border-b pb-1 mb-1">
            {t("common.performance")}
          </div>
          <div className="flex flex-col gap-1 w-24">
            {/* Avg pill + vertical bar + gradient bar */}
            <div
              className={`relative ${averageScore !== undefined && Number.isFinite(averageScore) && maxScore > minScore ? "mt-6 mb-1" : ""}`}
            >
              {/* Avg pill + connector line — spans from above the bar through it */}
              {averageScore !== undefined &&
                Number.isFinite(averageScore) &&
                averageScoreColor &&
                maxScore > minScore && (
                  <button
                    type="button"
                    className={`absolute flex flex-col items-center cursor-pointer z-10 ${
                      isAverageFilterActive
                        ? "opacity-100"
                        : "opacity-90 hover:opacity-100"
                    }`}
                    style={{
                      left: `${((averageScore - minScore) / (maxScore - minScore)) * 100}%`,
                      bottom: 0,
                      transform: "translateX(-50%)",
                    }}
                    title={
                      isAverageFilterActive
                        ? t("legend.clearAverageFilter")
                        : t("legend.applyAverageFilter")
                    }
                    onClick={onToggleAverageFilter}
                  >
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: averageScoreColor,
                        color: (() => {
                          const c = averageScoreColor;
                          let r = 0;
                          let g = 0;
                          let b = 0;
                          const hex = c.match(
                            /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i,
                          );
                          const rgb = c.match(
                            /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
                          );
                          if (hex) {
                            r = Number.parseInt(hex[1], 16);
                            g = Number.parseInt(hex[2], 16);
                            b = Number.parseInt(hex[3], 16);
                          } else if (rgb) {
                            r = Number.parseInt(rgb[1], 10);
                            g = Number.parseInt(rgb[2], 10);
                            b = Number.parseInt(rgb[3], 10);
                          } else {
                            return "#374151";
                          }
                          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                          return lum < 0.5 ? "#ffffff" : "#374151";
                        })(),
                      }}
                    >
                      {averageScore.toFixed(2)}
                    </span>
                    {/* Single continuous line from pill to bottom of bar */}
                    <span
                      className="w-px bg-gray-700"
                      style={{ height: "calc(1.5px + 0.75rem)" }}
                    />
                  </button>
                )}
              {/* Gradient bar */}
              <div className="relative w-full h-3 rounded overflow-hidden">
                <div
                  className="absolute inset-0 rounded"
                  style={{ background: PERFORMANCE_GRADIENTS[colorScheme] }}
                />
                {/* Fade-out overlay on the left (below-avg) portion when filter active */}
                {isAverageFilterActive &&
                  averageScore !== undefined &&
                  Number.isFinite(averageScore) &&
                  maxScore > minScore && (
                    <div
                      className="absolute top-0 left-0 h-full bg-white/70 transition-all duration-200"
                      style={{
                        width: `${((averageScore - minScore) / (maxScore - minScore)) * 100}%`,
                      }}
                    />
                  )}
              </div>
            </div>
            {/* Min / Max labels */}
            <div className="flex flex-row justify-between text-[10px] text-gray-600">
              <span className="truncate" title={minScore.toFixed(4)}>
                {minScore.toFixed(2)}
              </span>
              <span className="truncate" title={maxScore.toFixed(4)}>
                {maxScore.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="font-bold text-gray-900 border-b pb-1 mb-1 mt-1">
            {t("settings.dissimilarity")}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-600">
              {t("legend.chordLinks")}
            </span>
            <div
              className="w-24 h-3 rounded"
              style={{
                background:
                  "linear-gradient(to right, #fef2f2, #fca5a5, #b91c1c)",
              }}
            ></div>
            <div className="flex flex-row justify-between text-[10px] text-gray-600 w-24">
              <span>{t("legend.similarScale")}</span>
              <span>{t("legend.differentScale")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resize handle */}
      {resizeHandles}
    </div>
  );
}
