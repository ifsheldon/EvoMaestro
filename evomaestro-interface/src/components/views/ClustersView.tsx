"use client";

import dynamic from "next/dynamic";
import type { Data, PlotMouseEvent } from "plotly.js";
import type React from "react";
import { useMemo } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { getActiveClusterId, getActivePca2d } from "@/utils/embeddingAccessors";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface ClustersViewProps {
  data: Program[];
  onNodeSelect?: (nodeId: string) => void;
}

export const ClustersView: React.FC<ClustersViewProps> = ({
  data,
  onNodeSelect,
}) => {
  const { t } = useI18n();
  const { state } = useEvolveShell();
  const { settings } = state;
  const embeddingSource = settings.embeddingSource;

  // Keep the stored full-population projection when filtering so visible
  // nodes retain their positions and spatial context across filter changes.
  const traces = useMemo(() => {
    const isVisible = (p: Program) => {
      if (isCorrectProgram(p)) return true;
      if (isTimeoutProgram(p)) return settings.showTimeoutNodes;
      return settings.showErrorNodes;
    };

    const programsWithEmbeddings = data.filter(
      (p) =>
        isVisible(p) &&
        getActivePca2d(p, embeddingSource)?.length === 2 &&
        getActiveClusterId(p, embeddingSource) !== null &&
        getActiveClusterId(p, embeddingSource) !== undefined &&
        getProgramScore(p) != null,
    );

    if (programsWithEmbeddings.length === 0) return null;

    const bestProgram = programsWithEmbeddings.reduce((best, current) =>
      (getProgramScore(current) ?? -Infinity) >
      (getProgramScore(best) ?? -Infinity)
        ? current
        : best,
    );

    const scores = programsWithEmbeddings.map((p) => getProgramScore(p) ?? 0);
    const minS = Math.min(...scores);
    const maxS = Math.max(...scores);
    const midS = (minS + maxS) / 2;

    const getSize = (s: number) => {
      if (maxS === minS) return 10;
      return 5 + (15 * (s - minS)) / (maxS - minS);
    };

    // Group by cluster ID
    const clusterMap = new Map<number, Program[]>();
    for (const p of programsWithEmbeddings) {
      const cid = getActiveClusterId(p, embeddingSource) ?? 0;
      if (!clusterMap.has(cid)) clusterMap.set(cid, []);
      clusterMap.get(cid)?.push(p);
    }
    const clusterIds = Array.from(clusterMap.keys()).sort((a, b) => a - b);
    const N = clusterIds.length;

    // Each cluster → legend placeholder (fixed size) + data trace (variable size)
    const clusterTraces: Data[] = clusterIds.flatMap((cid, idx) => {
      const ps = clusterMap.get(cid) ?? [];
      const hue = Math.round((idx * 360) / Math.max(N, 1));
      const color = `hsl(${hue}, 65%, 50%)`;
      const group = `cluster-${cid}`;

      const legendTrace = {
        x: [null],
        y: [null],
        mode: "markers",
        type: "scatter",
        name: t("clusters.cluster", { id: cid }),
        legendgroup: group,
        legendgrouptitle:
          idx === 0 ? { text: t("clusters.clusterColor") } : undefined,
        showlegend: true,
        hoverinfo: "skip",
        marker: { color, size: 10, symbol: "circle" },
      } as unknown as Data;

      const dataTrace: Data = {
        x: ps.map((p) => getActivePca2d(p, embeddingSource)?.[0] ?? 0),
        y: ps.map((p) => getActivePca2d(p, embeddingSource)?.[1] ?? 0),
        mode: "markers",
        type: "scatter",
        name: t("clusters.cluster", { id: cid }),
        legendgroup: group,
        showlegend: false,
        customdata: ps.map((p) => p.id),
        text: ps.map(
          (p) =>
            `<b>${p.metadata?.patch_name ?? t("programs.unnamed")}</b><br>` +
            `${t("common.score")}: ${(getProgramScore(p) ?? 0).toFixed(4)}<br>` +
            `${t("clusters.clusterLabel")}: ${cid}`,
        ),
        hoverinfo: "text",
        marker: {
          color,
          size: ps.map((p) => getSize(getProgramScore(p) ?? 0)),
          symbol: ps.map((p) =>
            p.id === bestProgram.id ? "diamond" : "circle",
          ),
          line: {
            color: ps.map((p) => (p.id === bestProgram.id ? "gold" : "white")),
            width: ps.map((p) => (p.id === bestProgram.id ? 3 : 1)),
          },
        },
      };

      return [legendTrace, dataTrace];
    });

    // Score-size legend entries as Plotly traces (placed below cluster group)
    const sizeEntries =
      maxS > minS
        ? [
            {
              label: `${t("clusters.low")}: ${minS.toFixed(2)}`,
              size: getSize(minS),
            },
            {
              label: `${t("clusters.mid")}: ${midS.toFixed(2)}`,
              size: getSize(midS),
            },
            {
              label: `${t("clusters.high")}: ${maxS.toFixed(2)}`,
              size: getSize(maxS),
            },
          ]
        : [];

    const sizeTraces: Data[] = sizeEntries.map(
      ({ label, size }, idx) =>
        ({
          x: [null],
          y: [null],
          mode: "markers",
          type: "scatter",
          name: label,
          legendgroup: "size-legend",
          ...{
            legendgrouptitle:
              idx === 0 ? { text: t("clusters.scoreSize") } : undefined,
          },
          showlegend: true,
          hoverinfo: "skip",
          marker: { color: "#888", size, symbol: "circle" },
        }) as unknown as Data,
    );

    const shapeTrace = {
      x: [null],
      y: [null],
      mode: "markers",
      type: "scatter",
      name: t("clusters.bestProgram"),
      legendgroup: "shape-legend",
      ...{ legendgrouptitle: { text: t("clusters.shape") } },
      showlegend: true,
      hoverinfo: "skip",
      marker: { color: "#888", size: 10, symbol: "diamond" },
    } as unknown as Data;

    return [...clusterTraces, ...sizeTraces, shapeTrace];
  }, [
    data,
    settings.showErrorNodes,
    settings.showTimeoutNodes,
    embeddingSource,
    t,
  ]);

  if (!traces) {
    return (
      <div className="p-10 text-center text-gray-500">
        {t("clusters.noEmbeddings", {
          source:
            embeddingSource === "reasoning"
              ? t("clusters.reasoning")
              : t("common.code").toLowerCase(),
        })}
      </div>
    );
  }

  const handlePlotClick = (event: PlotMouseEvent) => {
    const nodeId = event?.points?.[0]?.customdata;
    if (typeof nodeId === "string" && onNodeSelect) {
      onNodeSelect(nodeId);
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#F6F6F6]">
      <div className="relative flex-1">
        <Plot
          data={traces}
          layout={{
            title: {
              text:
                embeddingSource === "reasoning"
                  ? t("clusters.reasoningPca")
                  : t("clusters.codePca"),
            },
            xaxis: { title: { text: "PC1" } },
            yaxis: { title: { text: "PC2" }, scaleanchor: "x", scaleratio: 1 },
            autosize: true,
            margin: { t: 40, b: 40, l: 40, r: 10 },
            hovermode: "closest",
            showlegend: true,
            legend: { orientation: "v", tracegroupgap: 4 },
            paper_bgcolor: "#F6F6F6",
            plot_bgcolor: "#F6F6F6",
          }}
          onClick={handlePlotClick}
          config={{ responsive: true, displayModeBar: false }}
          useResizeHandler={true}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
};
