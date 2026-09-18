"use client";

import { GripHorizontal, Network, X } from "lucide-react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import {
  getActiveEmbedding,
  getActivePca2d,
  haveCompatibleDimensions,
} from "@/utils/embeddingAccessors";
import { computeSimilarityMatrix } from "@/utils/math";
import { ProgramChips } from "../ProgramChips";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SimilarityAnalysisModalProps {
  programs: Program[];
  onClose: () => void;
}

export interface SimilarityAnalysisModalHandle {
  bringToFront: () => void;
}

const SimilarityAnalysisModal = forwardRef<
  SimilarityAnalysisModalHandle,
  SimilarityAnalysisModalProps
>(function SimilarityAnalysisModal({ programs, onClose }, ref) {
  const { t } = useI18n();
  const isWide = programs.length > 2;
  const {
    panelRef,
    panelStyle,
    dragHandlers,
    resizeHandles,
    bringToFront,
    size,
  } = useResizablePanel({
    defaultW: isWide ? 820 : 480,
    defaultH: isWide ? 480 : 420,
    minW: isWide ? 500 : 360,
    minH: isWide ? 300 : 280,
  });

  useImperativeHandle(ref, () => ({
    bringToFront,
  }));

  const { state } = useEvolveShell();
  const embeddingSource = state.settings.embeddingSource;
  const embeddingSourceLabel =
    embeddingSource === "reasoning"
      ? t("settings.reasoning")
      : t("common.code");

  // Track which programs have / are missing embeddings
  const { withEmbeddings, missingEmbeddingPrograms } = useMemo(() => {
    const withEmb: Program[] = [];
    const missing: Program[] = [];
    for (const p of programs) {
      const emb = getActiveEmbedding(p, embeddingSource);
      if (Array.isArray(emb) && emb.length > 0) {
        withEmb.push(p);
      } else {
        missing.push(p);
      }
    }
    return { withEmbeddings: withEmb, missingEmbeddingPrograms: missing };
  }, [programs, embeddingSource]);

  // Use only programs with embeddings for analysis
  const analysisPrograms =
    missingEmbeddingPrograms.length > 0 ? withEmbeddings : programs;

  // ── Axis labels ───────────────────────────────────────────────────────
  const axisLabels = analysisPrograms.map((p) =>
    t("common.generationValue", { value: p.generation }),
  );

  // ── Embeddings & similarity ───────────────────────────────────────────
  const embeddings = useMemo(
    () =>
      analysisPrograms
        .map((p) => getActiveEmbedding(p, embeddingSource))
        .filter((e): e is number[] => Array.isArray(e) && e.length > 0),
    [analysisPrograms, embeddingSource],
  );
  const incompatibleDimensions = !haveCompatibleDimensions(embeddings);
  const hasEmbeddings = embeddings.length >= 2 && !incompatibleDimensions;

  const dissimilarityMatrix = useMemo(() => {
    if (!hasEmbeddings) return null;
    const sim = computeSimilarityMatrix(embeddings);
    return sim.map((row) => row.map((v) => 1 - v));
  }, [embeddings, hasEmbeddings]);

  const cellText = useMemo(() => {
    if (!dissimilarityMatrix) return null;
    return dissimilarityMatrix.map((row) => row.map((v) => v.toFixed(3)));
  }, [dissimilarityMatrix]);

  const heatmapTrace: Data = {
    type: "heatmap",
    z: dissimilarityMatrix ?? [],
    x: axisLabels,
    y: axisLabels,
    text: cellText as unknown as string[],
    texttemplate: "%{text}",
    colorscale: "RdBu",
    zmin: 0,
    zmax: 2,
    showscale: true,
    hovertemplate: `%{y}<br>${t("common.vs")} %{x}<br>${t("settings.dissimilarity")}: %{z:.4f}<extra></extra>`,
  };

  // header (~41px) + padding (32px) + chips (~32px) + gaps (32px) + label (~20px) ≈ 160px
  const chartHeight = Math.max(120, size.h - 160);
  // padding (p-4 = 16px * 2 = 32px); for grid layout, halve width and subtract gap
  const chartWidth = isWide ? (size.w - 32 - 16) / 2 : size.w - 32;

  const heatmapLayout: Partial<Layout> = {
    width: chartWidth,
    height: chartHeight,
    margin: { l: 80, r: 16, t: 8, b: 80 },
    xaxis: { tickangle: -30, tickfont: { size: 10 }, automargin: true },
    yaxis: { tickfont: { size: 10 }, automargin: true },
    plot_bgcolor: "white",
    paper_bgcolor: "white",
  };

  // ── PCA ───────────────────────────────────────────────────────────────
  const pca2d = useMemo(
    () =>
      analysisPrograms
        .map((p) => getActivePca2d(p, embeddingSource))
        .filter((e): e is number[] => Array.isArray(e) && e.length >= 2),
    [analysisPrograms, embeddingSource],
  );
  const hasPca =
    !incompatibleDimensions &&
    pca2d.length === analysisPrograms.length &&
    pca2d.length >= 2;

  const pointColors = analysisPrograms.map(
    (_, i) => `hsl(${(i * 67 + 210) % 360}, 65%, 55%)`,
  );

  const scatterTrace: Data = {
    type: "scatter",
    mode: "text+markers",
    x: hasPca ? pca2d.map((p) => p[0]) : [],
    y: hasPca ? pca2d.map((p) => p[1]) : [],
    text: analysisPrograms.map((p) =>
      t("common.generationValue", { value: p.generation }),
    ),
    textposition: "top center",
    textfont: { size: 10 },
    marker: {
      size: 12,
      color: pointColors,
      line: { width: 1, color: "white" },
    },
    hovertemplate: analysisPrograms.map(
      (p) =>
        `${t("common.generationValue", { value: p.generation })}<br>${p.id}<extra></extra>`,
    ),
  };

  const scatterLayout: Partial<Layout> = {
    width: chartWidth,
    height: chartHeight,
    margin: { l: 45, r: 16, t: 8, b: 45 },
    xaxis: {
      title: { text: "PC1", font: { size: 11 } },
      tickfont: { size: 10 },
    },
    yaxis: {
      title: { text: "PC2", font: { size: 11 } },
      tickfont: { size: 10 },
    },
    showlegend: false,
    plot_bgcolor: "#fafafa",
    paper_bgcolor: "white",
  };

  const placeholder = (msg: string) => (
    <div
      className="flex items-center justify-center text-sm text-gray-400 border border-gray-100 rounded-lg bg-gray-50"
      style={{ height: chartHeight }}
    >
      {msg}
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="bg-white border border-indigo-300 rounded-xl shadow-xl flex flex-col"
      style={panelStyle}
      onPointerDownCapture={bringToFront}
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
          <GripHorizontal className="w-4 h-4 text-indigo-400" />
          <Network className="w-4 h-4" />
          {t("settings.dissimilarityAnalysis")}
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
      <div className="overflow-hidden p-4 flex flex-col gap-4">
        <ProgramChips
          programs={
            missingEmbeddingPrograms.length > 0 ? withEmbeddings : programs
          }
        />

        {missingEmbeddingPrograms.length > 0 && (
          <div className="border border-gray-100 rounded-lg bg-gray-50 p-3 mt-1">
            <p className="text-xs font-medium text-gray-500 mb-1">
              {t("similarity.missingEmbeddings", {
                source: embeddingSourceLabel,
              })}
            </p>
            <ProgramChips
              programs={missingEmbeddingPrograms}
              className="!gap-1"
            />
            {embeddingSource === "reasoning" && (
              <p className="text-[10px] text-gray-400 mt-1.5">
                {t("similarity.seedReasoning")}
              </p>
            )}
          </div>
        )}

        <div
          className={
            analysisPrograms.length > 2 ? "grid grid-cols-2 gap-4" : ""
          }
        >
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">
              {t("similarity.embeddingDissimilarity", {
                source: embeddingSourceLabel,
              })}
            </p>

            {hasEmbeddings ? (
              <Plot
                data={[heatmapTrace]}
                layout={heatmapLayout}
                useResizeHandler
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            ) : (
              placeholder(
                incompatibleDimensions
                  ? t("similarity.incompatibleDimensions")
                  : embeddings.length === 1
                    ? t("similarity.needTwoNodes")
                    : t("similarity.noEmbeddingData", {
                        source: embeddingSourceLabel,
                      }),
              )
            )}
          </div>

          {analysisPrograms.length > 2 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">
                {t("similarity.pcaView")}
              </p>
              {hasPca ? (
                <Plot
                  data={[scatterTrace]}
                  layout={scatterLayout}
                  useResizeHandler
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: "100%" }}
                />
              ) : (
                placeholder(t("similarity.noPcaData"))
              )}
            </div>
          )}
        </div>
      </div>

      {resizeHandles}
    </div>
  );
});

export default SimilarityAnalysisModal;
