"use client";

import { BarChart2, GripHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import type { Annotation, Data, Layout, Shape } from "plotly.js";
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { getProgramScore } from "@/utils/program";
import { ProgramChips } from "../ProgramChips";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface ComparePerformanceModalProps {
  programs: Program[];
  onClose: () => void;
}

export interface ComparePerformanceModalHandle {
  bringToFront: () => void;
}

/**
 * Floating draggable/resizable panel showing a bar chart of scores for the
 * selected programs, with a dashed average-score line.
 */
const ComparePerformanceModal = forwardRef<
  ComparePerformanceModalHandle,
  ComparePerformanceModalProps
>(function ComparePerformanceModal({ programs, onClose }, ref) {
  const { t } = useI18n();
  const {
    panelRef,
    panelStyle,
    dragHandlers,
    resizeHandles,
    bringToFront,
    size,
  } = useResizablePanel({
    defaultW: 620,
    defaultH: 420,
    minW: 400,
    minH: 280,
  });

  useImperativeHandle(ref, () => ({
    bringToFront,
  }));

  // ── Chart data ────────────────────────────────────────────────────────
  const { barTrace, shapes, annotations } = useMemo(() => {
    const scores = programs.map((p) => getProgramScore(p));
    const labels = programs.map((p) =>
      t("common.generationValue", { value: p.generation }),
    );
    const colors = programs.map(
      (_, i) => `hsl(${(i * 67 + 210) % 360}, 65%, 58%)`,
    );

    const validScores = scores.filter((s): s is number => s !== null);
    const avg =
      validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : null;

    const trace: Data = {
      type: "bar",
      x: labels,
      y: scores.map((s) => s ?? 0),
      marker: { color: colors },
      hovertemplate: `%{x}<br>${t("common.score")}: %{y:.6f}<extra></extra>`,
    };

    const shapeList: Partial<Shape>[] =
      avg != null
        ? [
            {
              type: "line",
              x0: -0.5,
              x1: programs.length - 0.5,
              y0: avg,
              y1: avg,
              line: { color: "rgba(80,80,80,0.65)", width: 1.5, dash: "dash" },
              xref: "x",
              yref: "y",
            },
          ]
        : [];

    const annotationList: Partial<Annotation>[] =
      avg != null
        ? [
            {
              x: programs.length - 0.5,
              y: avg,
              xanchor: "right",
              yanchor: "bottom",
              text: `${t("performance.averageShort")}: ${avg.toFixed(4)}`,
              showarrow: false,
              font: { size: 10, color: "rgba(80,80,80,0.9)" },
              xref: "x",
              yref: "y",
            },
          ]
        : [];

    return { barTrace: trace, shapes: shapeList, annotations: annotationList };
  }, [programs, t]);

  // header (~41px) + padding (32px) + chips (~32px) + gap (12px) ≈ 120px
  const chartHeight = Math.max(120, size.h - 120);
  // padding (p-4 = 16px * 2 = 32px)
  const chartWidth = size.w - 32;

  const layout: Partial<Layout> = {
    width: chartWidth,
    height: chartHeight,
    margin: { l: 55, r: 20, t: 8, b: 60 },
    xaxis: { tickangle: 0, tickfont: { size: 11 }, automargin: true },
    yaxis: {
      title: { text: t("common.score"), font: { size: 11 } },
      tickfont: { size: 11 },
    },
    shapes,
    annotations,
    plot_bgcolor: "#fafafa",
    paper_bgcolor: "white",
    bargap: 0.6,
  };

  return (
    <div
      ref={panelRef}
      className="bg-white border border-blue-300 rounded-xl shadow-xl flex flex-col"
      style={panelStyle}
      onPointerDownCapture={bringToFront}
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <GripHorizontal className="w-4 h-4 text-blue-400" />
          <BarChart2 className="w-4 h-4" />
          {t("performance.compare")}
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

      {/* Content */}
      <div className="overflow-hidden p-4 flex flex-col gap-3">
        <ProgramChips programs={programs} />

        <Plot
          data={[barTrace]}
          layout={layout}
          useResizeHandler
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
        />
      </div>

      {resizeHandles}
    </div>
  );
});

export default ComparePerformanceModal;
