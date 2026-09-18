/**
 * treeNodeRenderer.ts — Node shape, ring, label, and error-cross rendering
 * using nested D3 data joins for flicker-free updates.
 */

import * as d3 from "d3";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import { LAYOUT } from "./treeConstants";
import type {
  LayoutResult,
  NodeDatum,
  ProcessedProgram,
} from "./treeLayoutEngine";
import { ISLAND_ROOT_ID, VIRTUAL_ROOT_ID } from "./treeLayoutEngine";
import type { RenderCallbacks, VisualState } from "./treeRenderer";
import { patchShapeMap, patchShapeMapSplit } from "./treeTypes";
import { isHumanOrigin } from "./treeUtils";

// ── RAF-driven ring animation (immune to DOM mutations) ──────────────────

let _ringAnimRAF: number | null = null;
let _ringAnimStart: number | null = null;

/** Start the global ring animation loop (idempotent). */
function ensureRingAnimationLoop(): void {
  if (_ringAnimRAF !== null) return;
  _ringAnimStart = null;

  const tick = (timestamp: number) => {
    if (_ringAnimStart === null) _ringAnimStart = timestamp;
    const elapsed = timestamp - _ringAnimStart;
    const cycle = LAYOUT.ringAnimCycleMs;
    const phase = (elapsed % cycle) / cycle;
    // Ease: sin curve  0→1→0
    const t = Math.sin(phase * Math.PI * 2);
    // scale: 1 → 1+amplitude → 1
    const scale = 1 + LAYOUT.ringAnimScaleAmplitude * (0.5 + 0.5 * t);
    // opacity multiplier: base → 1 → base (we store base in data-base-opacity)
    const opacityMul = 0.5 + 0.5 * t; // 0→1 range

    const circles = document.querySelectorAll<SVGCircleElement>(
      "circle.ring-animated",
    );
    for (const circle of circles) {
      const baseOpacity =
        Number(circle.getAttribute("data-base-opacity")) || 0.8;
      const opacity = baseOpacity + (1 - baseOpacity) * opacityMul;
      circle.setAttribute("transform", `scale(${scale})`);
      circle.setAttribute("opacity", String(opacity));
    }

    _ringAnimRAF = requestAnimationFrame(tick);
  };

  _ringAnimRAF = requestAnimationFrame(tick);
}

/** Stop the global ring animation loop. */
export function stopRingAnimationLoop(): void {
  if (_ringAnimRAF !== null) {
    cancelAnimationFrame(_ringAnimRAF);
    _ringAnimRAF = null;
    _ringAnimStart = null;
  }
}

// ── Style helpers ────────────────────────────────────────────────────────

export function getNodeFillColor(
  nodeData: ProcessedProgram,
  layout: LayoutResult,
): string {
  if (nodeData.id === ISLAND_ROOT_ID) return "none";
  // Queued (ghost) nodes: light blue-gray to indicate pending evaluation
  if (nodeData._lifecycle === "queued") return "#cbd5e1";
  if (nodeData.id === layout.bestNode?.id) {
    const score = getProgramScore(nodeData);
    return score !== null ? layout.colorScale(score) : "#3498db";
  }
  if (!isCorrectProgram(nodeData)) {
    return "#f1f5f9";
  }
  const score = getProgramScore(nodeData);
  if (score !== null) return layout.colorScale(score);
  return "#3498db";
}

export function getContrastingTextColor(fillColor: string): string {
  const c = d3.color(fillColor);
  if (!c) return "#374151";
  const rgb = c.rgb();
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.5 ? "#ffffff" : "#374151";
}

function isStartNode(d: NodeDatum): boolean {
  return (
    d.data.id === ISLAND_ROOT_ID ||
    (!d.data._parentId && d.data.generation === 0)
  );
}

// ── Node shapes ──────────────────────────────────────────────────────────

export function updateNodeShapes(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  layout: LayoutResult,
  visualState: VisualState,
): void {
  const symbol = d3.symbol().size(700);

  // Mark the global best node for guided tour targeting
  nodeSel.attr("data-tour", (d) =>
    layout.bestNode && d.data.id === layout.bestNode.id
      ? "global-best-node"
      : null,
  );

  nodeSel
    .select<SVGPathElement>("path.node-shape")
    .attr("d", (d) => {
      if (d.data.id === ISLAND_ROOT_ID) {
        symbol.type(d3.symbolCircle);
        symbol.size(0);
        return symbol();
      }
      const patchType = d.data.metadata?.patch_type || "full";
      const shapeMap = visualState.unifyMutationTypes
        ? patchShapeMap
        : patchShapeMapSplit;
      symbol.type(shapeMap[patchType] || d3.symbolCircle);
      symbol.size(patchType === "init" ? 400 : 700);
      return symbol();
    })
    .attr("fill", (d) => {
      if (d.data.id === ISLAND_ROOT_ID) return "none";
      return getNodeFillColor(d.data, layout);
    })
    .attr("stroke", (d) => {
      if (d.data.id === ISLAND_ROOT_ID) return "none";
      if (d.data._parentId === ISLAND_ROOT_ID) {
        const avgScore = layout.islandAvgScoreByIslandIdx.get(
          layout.getIslandIdxForNodeId(d.data.id) ?? -1,
        );
        return layout.colorScale(avgScore ?? layout.minScore);
      }
      if (
        d.data.id === visualState.selectedProgramId &&
        d.data.id !== ISLAND_ROOT_ID
      )
        return "#ff8c00";
      if (layout.selectedPathIds.has(d.data.id) && d.data.id !== ISLAND_ROOT_ID)
        return "#ff8c00";
      if (d.data.id === visualState.highlightedProgramId) return "#000";
      if (!isCorrectProgram(d.data)) return "#ef4444";
      if (layout.globalBestPathNodeIds.has(d.data.id)) return "gold";
      if (layout.secondaryIslandBestPathNodeIds.has(d.data.id))
        return "#ffe571";
      if (layout.bestPathIds.has(d.data.id)) return "gold";
      return "#363636";
    })
    .attr("stroke-width", (d) => {
      if (d.data.id === ISLAND_ROOT_ID) return 0;
      if (d.data._parentId === ISLAND_ROOT_ID) return 7.5;
      if (
        d.data.id === visualState.selectedProgramId &&
        d.data.id !== ISLAND_ROOT_ID
      )
        return 4;
      if (layout.selectedPathIds.has(d.data.id) && d.data.id !== ISLAND_ROOT_ID)
        return 4;
      if (d.data.id === visualState.highlightedProgramId) return 2.5;
      if (layout.globalBestPathNodeIds.has(d.data.id)) return 3.5;
      if (layout.secondaryIslandBestPathNodeIds.has(d.data.id)) return 2.5;
      if (layout.bestPathIds.has(d.data.id)) return 3.5;
      return 1.5;
    })
    .attr("stroke-dasharray", (d) =>
      d.data._lifecycle === "queued" ? "4,3" : null,
    )
    .style("opacity", (d) => (d.data._lifecycle === "queued" ? 0.6 : 1))
    .style("filter", (d) => {
      if (d.data._parentId === ISLAND_ROOT_ID) return "none";
      if (
        d.data.id === visualState.selectedProgramId &&
        d.data.id !== ISLAND_ROOT_ID
      )
        return "drop-shadow(0px 4px 8px rgba(255, 140, 0, 0.6))";
      if (layout.selectedPathIds.has(d.data.id) && d.data.id !== ISLAND_ROOT_ID)
        return "drop-shadow(0px 3px 6px rgba(255, 140, 0, 0.5))";
      if (d.data.id === visualState.highlightedProgramId)
        return "drop-shadow(0px 2px 4px rgba(0,0,0,0.2))";
      if (d.data.id === layout.bestNode?.id)
        return "drop-shadow(0px 3px 6px rgba(255, 215, 0, 0.5))";
      if (visualState.mergeModalIds.has(d.data.id))
        return "drop-shadow(0px 3px 6px rgba(34, 197, 94, 0.5))";
      if (visualState.mergeSelectedIds.has(d.data.id))
        return "drop-shadow(0px 3px 6px rgba(155, 89, 182, 0.5))";
      if (visualState.recommendedIds.has(d.data.id))
        return "drop-shadow(0px 3px 6px rgba(13, 148, 136, 0.5))";
      return "drop-shadow(0px 2px 4px rgba(0,0,0,0.2))";
    });
}

// ── Node rings (nested data join) ────────────────────────────────────────

type RingDatum = {
  type: string;
  r: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashArray: string | null;
  filter: string | null;
  /** Whether to add SVG SMIL pulse animation (scale + opacity). */
  animated: boolean;
};

function computeNodeRings(
  d: NodeDatum,
  layout: LayoutResult,
  visualState: VisualState,
): RingDatum[] {
  const rings: RingDatum[] = [];
  const globalBestRingR = LAYOUT.globalBestRingRadius;
  const islandBestRingR = globalBestRingR * LAYOUT.islandBestRingScale;

  if (
    layout.bestNode &&
    d.data.id === layout.bestNode.id &&
    layout.localBestNodeIds.has(d.data.id) &&
    !isStartNode(d)
  ) {
    rings.push({
      type: "ring-global-best",
      r: globalBestRingR,
      stroke: "#facc15",
      strokeWidth: 3.5,
      opacity: 0.8,
      dashArray: null,
      filter: "drop-shadow(0px 0px 24px rgba(250, 204, 21, 1))",
      animated: false,
    });
  }

  if (
    layout.localBestNodeIds.has(d.data.id) &&
    d.data.id !== layout.bestNode?.id &&
    !isStartNode(d)
  ) {
    rings.push({
      type: "ring-island-best",
      r: islandBestRingR,
      stroke: "#facc15",
      strokeWidth: 3,
      opacity: 0.8,
      dashArray: null,
      filter: "drop-shadow(0px 0px 24px rgba(250, 204, 21, 1))",
      animated: false,
    });
  }

  if (
    visualState.highlightedProgramId &&
    d.data.id === visualState.highlightedProgramId &&
    d.data.id !== visualState.selectedProgramId &&
    !visualState.mergeModalIds.has(d.data.id)
  ) {
    rings.push({
      type: "ring-highlighted",
      r: LAYOUT.interactionRingRadius,
      stroke: "#ef4444",
      strokeWidth: 3,
      opacity: 0.8,
      dashArray: "5,3",
      filter: null,
      animated: true,
    });
  }

  if (visualState.mergeModalIds.has(d.data.id)) {
    rings.push({
      type: "ring-merge-modal",
      r: LAYOUT.interactionRingRadius,
      stroke: "#22c55e",
      strokeWidth: 3,
      opacity: 0.8,
      dashArray: "5,3",
      filter: null,
      animated: true,
    });
  }

  if (
    visualState.mergeSelectedIds.has(d.data.id) &&
    !visualState.mergeModalIds.has(d.data.id) &&
    d.data.id !== visualState.highlightedProgramId
  ) {
    rings.push({
      type: "ring-merge-selected",
      r: LAYOUT.interactionRingRadius,
      stroke: "#9b59b6",
      strokeWidth: 3,
      opacity: 0.8,
      dashArray: "5,3",
      filter: null,
      animated: true,
    });
  }

  if (
    visualState.recommendedIds.has(d.data.id) &&
    !visualState.mergeSelectedIds.has(d.data.id) &&
    d.data.id !== visualState.selectedProgramId &&
    d.data.id !== visualState.highlightedProgramId
  ) {
    rings.push({
      type: "ring-recommended",
      r: 26,
      stroke: "#0d9488",
      strokeWidth: 2.5,
      opacity: 0.7,
      dashArray: "4,4",
      filter: null,
      animated: false,
    });
  }

  return rings;
}

export function updateNodeRings(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  layout: LayoutResult,
  visualState: VisualState,
): void {
  nodeSel.each(function (d) {
    const ringsG = d3.select(this).select<SVGGElement>("g.node-rings");
    const rings = computeNodeRings(d, layout, visualState);

    ringsG
      .selectAll<SVGCircleElement, RingDatum>("circle")
      .data(rings, (r) => r.type)
      .join(
        (enter) => {
          const circles = enter
            .append("circle")
            .attr("fill", "none")
            .attr("r", (r) => r.r)
            .style("stroke", (r) => r.stroke)
            .style("stroke-width", (r) => r.strokeWidth)
            .style("stroke-dasharray", (r) => r.dashArray)
            .style("opacity", (r) => r.opacity)
            .style("filter", (r) => r.filter);

          // Mark animated rings with a class + data attribute.
          // A global requestAnimationFrame loop drives the animation
          // imperatively — completely immune to DOM mutations.
          circles
            .filter((r) => r.animated)
            .classed("ring-animated", true)
            .attr("data-base-opacity", (r) => r.opacity);

          return circles;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    // Ensure the RAF loop is running if there are any animated rings
    if (rings.some((r) => r.animated)) {
      ensureRingAnimationLoop();
    }
  });
}

// ── Node labels (nested data join) ───────────────────────────────────────

export function updateNodeLabels(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  layout: LayoutResult,
  callbacks: RenderCallbacks,
): void {
  nodeSel.each(function (d) {
    const labelsG = d3.select(this).select<SVGGElement>("g.node-labels");

    // Human badge
    const humanData = isHumanOrigin(d.data) ? [d] : [];
    labelsG
      .selectAll<SVGTextElement, NodeDatum>("text.label-human")
      .data(humanData, () => "human")
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "label-human")
            .attr("x", 0)
            .attr("y", 0)
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .text("H"),
        (update) => update,
        (exit) => exit.remove(),
      )
      .style("fill", () =>
        getContrastingTextColor(getNodeFillColor(d.data, layout)),
      );

    // Review Priority bulb
    const reviewPriorityData =
      d.data.id !== ISLAND_ROOT_ID &&
      d.data.id !== VIRTUAL_ROOT_ID &&
      (d.data.review_priority_level === "moderate" ||
        d.data.review_priority_level === "high")
        ? [d]
        : [];
    labelsG
      .selectAll<SVGTextElement, NodeDatum>("text.label-review-priority")
      .data(reviewPriorityData, () => "reviewPriority")
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "label-review-priority")
            .attr("x", 0)
            .attr("y", -20)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("pointer-events", "auto")
            .style("cursor", "pointer")
            .text("\u{1F4A1}"),
        (update) => update,
        (exit) => exit.remove(),
      )
      .style("filter", () =>
        d.data.review_priority_level === "high"
          ? "drop-shadow(0px 0px 6px rgba(255, 165, 0, 0.9))"
          : "drop-shadow(0px 0px 5px rgba(250, 204, 21, 0.7))",
      )
      .on("click", (event) => {
        event.stopPropagation();
        callbacks.onReviewPriorityClick?.(d.data);
      });
  });
}

// ── Error crosses (nested data join) ─────────────────────────────────────

export function updateErrorCrosses(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
): void {
  const errorCrossR = 7;
  const errorCrossLines = [
    { x1: -errorCrossR, y1: -errorCrossR, x2: errorCrossR, y2: errorCrossR },
    { x1: errorCrossR, y1: -errorCrossR, x2: -errorCrossR, y2: errorCrossR },
  ];

  nodeSel.each(function (d) {
    const crossG = d3.select(this).select<SVGGElement>("g.node-error-cross");

    const showCross =
      d.data.id !== ISLAND_ROOT_ID &&
      d.data.id !== VIRTUAL_ROOT_ID &&
      !isCorrectProgram(d.data) &&
      !isTimeoutProgram(d.data);

    const data = showCross ? errorCrossLines : [];

    crossG
      .attr("clip-path", showCross ? "url(#error-node-clip)" : null)
      .attr("stroke", showCross ? "#ef4444" : "none")
      .attr("stroke-width", showCross ? 1 : 0)
      .attr("stroke-linecap", "round")
      .attr("fill", "none")
      .selectAll<SVGLineElement, (typeof errorCrossLines)[0]>("line")
      .data(data)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("x1", (l) => l.x1)
            .attr("y1", (l) => l.y1)
            .attr("x2", (l) => l.x2)
            .attr("y2", (l) => l.y2),
        (update) => update,
        (exit) => exit.remove(),
      );
  });
}

// ── Bookmarks (nested data join) ─────────────────────────────────────────

export function renderBookmarks(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  markedNodeIds: Set<string>,
  nodeNotes: Record<string, string>,
): void {
  const notedSet = new Set(Object.keys(nodeNotes));

  nodeSel.each(function (d) {
    const labelsG = d3.select(this).select<SVGGElement>("g.node-labels");

    const showBookmark =
      d.data.id !== ISLAND_ROOT_ID &&
      d.data.id !== VIRTUAL_ROOT_ID &&
      (markedNodeIds.has(d.data.id) || notedSet.has(d.data.id));

    const bookmarkData = showBookmark ? [d] : [];

    labelsG
      .selectAll<SVGPathElement, NodeDatum>("path.label-bookmark")
      .data(bookmarkData, () => "bookmark")
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "label-bookmark")
            .attr("d", "M-3.5,-12 L-3.5,-5.5 L0,-7.5 L3.5,-5.5 L3.5,-12 Z")
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.5)
            .style("pointer-events", "none"),
        (update) => update,
        (exit) => exit.remove(),
      )
      .attr("fill", () => (notedSet.has(d.data.id) ? "#0d9488" : "#f59e0b"));
  });
}
