"use client";

import * as d3 from "d3";
import { Activity, GripHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import {
  computeScoreStats,
  epanechnikovKernel,
  kernelDensityEstimator,
} from "@/utils/kde";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";

interface DistributionModalProps {
  programs: Program[];
  scoreThreshold: number | null;
  onThresholdChange: (threshold: number | null) => void;
  onClose: () => void;
}

export default function DistributionModal({
  programs,
  scoreThreshold,
  onThresholdChange,
  onClose,
}: DistributionModalProps) {
  const { t } = useI18n();
  const { state: shellState } = useEvolveShell();
  const { settings } = shellState;
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    panelRef,
    panelStyle: basePanelStyle,
    size,
    dragHandlers,
    resizeHandles,
  } = useResizablePanel({
    defaultW: 480,
    defaultH: 320,
    minW: 360,
    minH: 250,
    memoryKey: "distribution-modal",
    initialPos: (w) => ({
      x: window.innerWidth - w - 20,
      y: window.innerHeight - 360,
    }),
  });

  // Always apply explicit height — the chart area uses flex-1 which
  // needs a sized parent (the hook's default auto-height mode collapses it).
  const panelStyle = { ...basePanelStyle, height: size.h };

  // Extract valid scores — hidden nodes are never included in statistics
  const validScores = useMemo(() => {
    const effectiveIncludeError =
      settings.showErrorNodes && settings.includeErrorInStats;
    const effectiveIncludeTimeout =
      settings.showTimeoutNodes && settings.includeTimeoutInStats;

    return programs
      .filter((p) => {
        const isCorrect = isCorrectProgram(p);
        const isTimeout = isTimeoutProgram(p);

        if (!isCorrect) {
          if (isTimeout) {
            if (!effectiveIncludeTimeout) return false;
          } else {
            if (!effectiveIncludeError) return false;
          }
        }

        const score = getProgramScore(p);
        return score !== null && Number.isFinite(score);
      })
      .map((p) => getProgramScore(p) as number);
  }, [programs, settings]);

  const stats = useMemo(() => computeScoreStats(validScores), [validScores]);

  // Upper drag limit: the maximum score value.
  const dragUpperBound = useMemo(() => {
    if (validScores.length === 0) return Number.POSITIVE_INFINITY;
    return Math.max(...validScores);
  }, [validScores]);

  // Keep a stable ref for onThresholdChange so pointer handlers don't stale-close
  const onThresholdChangeRef = useRef(onThresholdChange);
  onThresholdChangeRef.current = onThresholdChange;

  // Refs to store D3 scale info so native pointer handlers can convert
  // pointer position → score value without re-creating handlers on each render.
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const xExtentRef = useRef<[number, number]>([0, 1]);
  const dragUpperBoundRef = useRef(dragUpperBound);
  dragUpperBoundRef.current = dragUpperBound;
  const marginLeftRef = useRef(20);
  const isDraggingRef = useRef(false);

  /** Convert a pointer event on the container div into a score value, or null
   *  if the scale isn't ready. Clamped to [dataMin, dragUpperBound]. */
  const pointerToScore = useCallback(
    (e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
      const xScale = xScaleRef.current;
      if (!xScale || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left - marginLeftRef.current;
      const xVal = xScale.invert(localX);
      // Clamp to [data min, mean of top-2 scores]
      return Math.max(
        xExtentRef.current[0],
        Math.min(dragUpperBoundRef.current, xVal),
      );
    },
    [],
  );

  /** Set the threshold directly (no reset logic — used during dragging). */
  const setThreshold = useCallback((score: number) => {
    onThresholdChangeRef.current(score);
  }, []);

  /** If the pointer is within the leftmost 2 % of the plot's pixel width,
   *  reset the filter. Uses the scale's range (which reflects current plot
   *  width after any resize) so it's independent of data distribution. */
  const finalizeThreshold = useCallback(
    (e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
      const xScale = xScaleRef.current;
      if (!xScale || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left - marginLeftRef.current;
      const plotW = xScale.range()[1]; // range is [0, plotW]
      if (localX <= plotW * 0.02) {
        onThresholdChangeRef.current(null);
      }
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to primary button on the chart area
      if (e.button !== 0) return;
      const score = pointerToScore(e);
      if (score === null) return;
      isDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setThreshold(score);
    },
    [pointerToScore, setThreshold],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const score = pointerToScore(e);
      if (score !== null) setThreshold(score);
    },
    [pointerToScore, setThreshold],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      finalizeThreshold(e);
    },
    [finalizeThreshold],
  );

  // Track container dimensions so the D3 effect re-fires after layout/resize
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize((prev) =>
        prev.w === Math.round(width) && prev.h === Math.round(height)
          ? prev
          : { w: Math.round(width), h: Math.round(height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // D3 rendering — SVG structure is created once, subsequent updates use transitions
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerSize triggers re-render on resize even though D3 reads dimensions from the DOM directly
  useEffect(() => {
    if (!containerRef.current) return;

    const container = d3.select(containerRef.current);

    if (validScores.length < 2) {
      container.selectAll("*").remove();
      return;
    }

    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width < 10 || height < 10) return;

    const margin = { top: 10, right: 20, bottom: 36, left: 20 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    if (plotW < 10 || plotH < 10) return;

    // --- Create SVG structure once, reuse on subsequent updates ---
    let svg = container.select<SVGSVGElement>("svg");
    const isNew = svg.empty();

    if (isNew) {
      svg = container.append("svg").style("pointer-events", "none");

      const defs = svg.append("defs");

      const filteredGradient = defs
        .append("linearGradient")
        .attr("id", "filtered-gradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      filteredGradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#bfdbfe") // blue-200
        .attr("stop-opacity", 0.5);
      filteredGradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#bfdbfe")
        .attr("stop-opacity", 0.0);

      const highlightGradient = defs
        .append("linearGradient")
        .attr("id", "highlight-gradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      highlightGradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#3b82f6") // blue-500
        .attr("stop-opacity", 0.5);
      highlightGradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#3b82f6")
        .attr("stop-opacity", 0.0);

      const clip = defs.append("clipPath").attr("id", "highlight-clip-modal");
      clip
        .append("rect")
        .attr("class", "highlight-clip-rect")
        .attr("y", -20)
        .attr("height", "150%")
        .attr("x", 0)
        .attr("width", 0);

      const gNew = svg.append("g").attr("class", "plot-area");

      const filteredGroup = gNew.append("g").attr("class", "filtered-group");
      filteredGroup.append("path").attr("class", "filtered-area");
      filteredGroup.append("path").attr("class", "filtered-line");
      filteredGroup.append("line").attr("class", "filtered-start-line");
      filteredGroup.append("line").attr("class", "filtered-end-line");

      const highlightGroup = gNew
        .append("g")
        .attr("class", "highlight-group")
        .attr("clip-path", "url(#highlight-clip-modal)");
      highlightGroup.append("path").attr("class", "highlight-area");
      highlightGroup.append("path").attr("class", "highlight-line");
      highlightGroup.append("line").attr("class", "highlight-start-line");
      highlightGroup.append("line").attr("class", "highlight-end-line");

      gNew.append("line").attr("class", "threshold-line").attr("opacity", 0);
      gNew.append("text").attr("class", "threshold-label").attr("opacity", 0);
      gNew.append("g").attr("class", "x-axis text-gray-400");
      gNew.append("text").attr("class", "axis-label");
    }

    svg.attr("width", width).attr("height", height);
    const g = svg.select<SVGGElement>("g.plot-area");
    g.attr("transform", `translate(${margin.left},${margin.top})`);

    // Transition duration: instant on first render or during drag, 300ms otherwise
    const duration = isNew || isDraggingRef.current ? 0 : 150;

    // --- Scales – extend to nice adaptive tick boundaries beyond min/max ---
    const xExtent = d3.extent(validScores) as [number, number];
    const xRange = xExtent[1] - xExtent[0];
    const x = d3.scaleLinear().domain(xExtent).nice().range([0, plotW]);

    // Save scale info to refs for the pointer handlers
    xScaleRef.current = x;
    xExtentRef.current = xExtent;
    marginLeftRef.current = margin.left;

    // --- KDE computation ---
    const sigma = d3.deviation(validScores) ?? 1;
    const bandwidth = Math.max(
      1.06 * sigma * validScores.length ** -0.2,
      xRange * 0.01 || 0.001,
    );
    const kernel = epanechnikovKernel(bandwidth);
    const thresholds = x.ticks(120);
    const density = kernelDensityEstimator(kernel, thresholds, validScores);

    const yMax = d3.max(density, (d) => d[1]) ?? 1;
    const y = d3.scaleLinear().domain([0, yMax]).range([plotH, 0]);

    // --- Area generator ---
    const area = d3
      .area<[number, number]>()
      .x((d) => x(d[0]))
      .y0(plotH)
      .y1((d) => y(d[1]))
      .curve(d3.curveBasis);

    const lineGen = d3
      .line<[number, number]>()
      .x((d) => x(d[0]))
      .y((d) => y(d[1]))
      .curve(d3.curveBasis);

    const firstPoint = density[0];
    const lastPoint = density[density.length - 1];

    // --- Density curves (transition) ---
    // Filtered area (light blue base)
    g.select<SVGPathElement>(".filtered-area")
      .datum(density)
      .transition()
      .duration(duration)
      .attr("fill", "url(#filtered-gradient)")
      .attr("stroke", "none")
      .attr("d", area);

    g.select<SVGPathElement>(".filtered-line")
      .datum(density)
      .transition()
      .duration(duration)
      .attr("fill", "none")
      .attr("stroke", "#93c5fd") // blue-300
      .attr("stroke-width", 1.5)
      .attr("d", lineGen);

    g.select<SVGLineElement>(".filtered-start-line")
      .transition()
      .duration(duration)
      .attr("x1", x(firstPoint[0]))
      .attr("x2", x(firstPoint[0]))
      .attr("y1", y(firstPoint[1]))
      .attr("y2", plotH)
      .attr("stroke", "#93c5fd")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4");

    g.select<SVGLineElement>(".filtered-end-line")
      .transition()
      .duration(duration)
      .attr("x1", x(lastPoint[0]))
      .attr("x2", x(lastPoint[0]))
      .attr("y1", y(lastPoint[1]))
      .attr("y2", plotH)
      .attr("stroke", "#93c5fd")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4");

    // Highlight area (strong blue foreground)
    g.select<SVGPathElement>(".highlight-area")
      .datum(density)
      .transition()
      .duration(duration)
      .attr("fill", "url(#highlight-gradient)")
      .attr("stroke", "none")
      .attr("d", area);

    g.select<SVGPathElement>(".highlight-line")
      .datum(density)
      .transition()
      .duration(duration)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6") // blue-500
      .attr("stroke-width", 2)
      .attr("d", lineGen);

    g.select<SVGLineElement>(".highlight-start-line")
      .transition()
      .duration(duration)
      .attr("x1", x(firstPoint[0]))
      .attr("x2", x(firstPoint[0]))
      .attr("y1", y(firstPoint[1]))
      .attr("y2", plotH)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4");

    g.select<SVGLineElement>(".highlight-end-line")
      .transition()
      .duration(duration)
      .attr("x1", x(lastPoint[0]))
      .attr("x2", x(lastPoint[0]))
      .attr("y1", y(lastPoint[1]))
      .attr("y2", plotH)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4");

    // Update clipping area
    const highlightX = scoreThreshold != null ? x(scoreThreshold) : 0;
    const highlightW = Math.max(0, plotW - highlightX + 50);
    svg
      .select(".highlight-clip-rect")
      .transition()
      .duration(duration)
      .attr("x", highlightX)
      .attr("width", highlightW);

    // --- Threshold elements ---
    if (scoreThreshold != null) {
      const xPos = x(scoreThreshold);

      // Threshold line
      const thresholdLine = g.select<SVGLineElement>(".threshold-line");
      const wasLineHidden =
        !thresholdLine.attr("opacity") ||
        Number(thresholdLine.attr("opacity")) === 0;
      if (wasLineHidden && duration > 0) {
        // Appearing: set position instantly, then fade in
        thresholdLine
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", plotH)
          .attr("stroke", "#ef4444")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "4,3")
          .transition()
          .duration(duration)
          .attr("opacity", 1);
      } else {
        thresholdLine
          .transition()
          .duration(duration)
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", plotH)
          .attr("stroke", "#ef4444")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "4,3")
          .attr("opacity", 1);
      }

      // Threshold label — show value and "Min" / "Max" when at drag limits
      const thresholdLabel = g.select<SVGTextElement>(".threshold-label");
      let labelText = scoreThreshold.toFixed(4);
      if (scoreThreshold <= xExtent[0]) {
        labelText = `${t("distribution.minimum")}: ${scoreThreshold.toFixed(4)}`;
      } else if (scoreThreshold >= dragUpperBound) {
        labelText = `${t("distribution.maximum")}: ${scoreThreshold.toFixed(4)}`;
      }
      if (labelText) {
        const labelX = xPos + 4 > plotW - 40 ? xPos - 45 : xPos + 6;
        const wasLabelHidden =
          !thresholdLabel.attr("opacity") ||
          Number(thresholdLabel.attr("opacity")) === 0;
        thresholdLabel
          .text(labelText)
          .style("font-size", "11px")
          .style("fill", "#ef4444")
          .style("font-weight", "600")
          .style("paint-order", "stroke")
          .style("stroke", "#ffffff")
          .style("stroke-width", "3px");
        if (wasLabelHidden && duration > 0) {
          thresholdLabel
            .attr("x", labelX)
            .attr("y", 12)
            .transition()
            .duration(duration)
            .attr("opacity", 1);
        } else {
          thresholdLabel
            .transition()
            .duration(duration)
            .attr("x", labelX)
            .attr("y", 12)
            .attr("opacity", 1);
        }
      } else {
        thresholdLabel.transition().duration(duration).attr("opacity", 0);
      }
    } else {
      // Hide threshold elements when no threshold is set
      g.select<SVGLineElement>(".threshold-line")
        .transition()
        .duration(duration)
        .attr("opacity", 0);
      g.select<SVGTextElement>(".threshold-label")
        .transition()
        .duration(duration)
        .attr("opacity", 0);
    }

    // --- X-axis (transition) ---
    const xAxisGroup = g
      .select<SVGGElement>(".x-axis")
      .attr("transform", `translate(0,${plotH})`);
    // biome-ignore lint/suspicious/noExplicitAny: d3 transition .call() type mismatch
    (xAxisGroup.transition().duration(duration) as any).call(
      d3.axisBottom(x).ticks(6).tickSizeOuter(0),
    );
    xAxisGroup
      .selectAll("text")
      .style("font-size", "11px")
      .style("fill", "#6b7280");
    xAxisGroup.selectAll("path, line").style("stroke", "#e5e7eb");

    // --- Axis label ---
    g.select<SVGTextElement>(".axis-label")
      .attr("x", plotW / 2)
      .attr("y", plotH + 32)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .style("fill", "#9ca3af")
      .text(t("common.score"));
  }, [validScores, scoreThreshold, dragUpperBound, containerSize, t]);

  const hasData = validScores.length >= 2;

  return (
    <div
      ref={panelRef}
      className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-2xl flex flex-col ring-1 ring-black/5"
      style={panelStyle}
    >
      {/* Drag handle header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 bg-gray-50/50 rounded-t-xl flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <GripHorizontal className="w-4 h-4 text-gray-400" />
          <Activity className="w-4 h-4 text-blue-500" />
          {t("distribution.title")}
        </div>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-gray-200/50 text-gray-500 transition-colors"
          title={t("common.close")}
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chart area — pointer events handled on the div, not the SVG */}
      {hasData ? (
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-hidden select-none"
          style={{
            cursor: "crosshair",
            WebkitUserSelect: "none",
            userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          {t("distribution.notEnoughData")}
        </div>
      )}

      {/* Preset buttons */}
      {hasData && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 mr-1 uppercase tracking-wider">
            {t("distribution.presets")}
          </span>
          <button
            type="button"
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
            onClick={() => onThresholdChange(stats.mean)}
          >
            {t("performance.averageShort")}
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
            onClick={() => onThresholdChange(stats.median)}
          >
            {t("settings.median")}
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
            onClick={() => onThresholdChange(stats.p75)}
          >
            75%
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
            onClick={() => onThresholdChange(stats.p25)}
          >
            25%
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-all shadow-sm"
            onClick={() => onThresholdChange(null)}
          >
            {t("common.reset")}
          </button>
        </div>
      )}

      {resizeHandles}
    </div>
  );
}
