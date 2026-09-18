/**
 * treeRenderer.ts — Flicker-free node and link rendering orchestrator.
 *
 * Delegates to:
 *   - treeNodeRenderer.ts  — shape, ring, label, error-cross, bookmark rendering
 *   - treeInteractions.ts  — click/hover/contextmenu handlers
 *
 * The key architectural change vs the old approach:
 *   OLD: `node.selectAll("*").remove()` then rebuild all children every render
 *   NEW: Nested data joins that update existing elements in-place
 */

import * as d3 from "d3";
import type { Program } from "@/types";
import { getProgramScore } from "@/utils/program";
import {
  attachNodeInteractions,
  setupCanvasHandlers as setupCanvasHandlersImpl,
} from "./treeInteractions";
import type { LayoutResult, LinkDatum, NodeDatum } from "./treeLayoutEngine";
import { ISLAND_ROOT_ID, VIRTUAL_ROOT_ID } from "./treeLayoutEngine";
import {
  renderBookmarks as renderBookmarksImpl,
  updateErrorCrosses,
  updateNodeLabels,
  updateNodeRings,
  updateNodeShapes,
} from "./treeNodeRenderer";

// ── Types ────────────────────────────────────────────────────────────────

export interface VisualState {
  selectedProgramId: string | null;
  highlightedProgramId: string | null;
  mergeSelectedIds: Set<string>;
  mergeModalIds: Set<string>;
  recommendedIds: Set<string>;
  markedNodeIds: Set<string>;
  bannedNodeIds: Set<string>;
  nodeNotes: Record<string, string>;
  scoreThreshold: number | null;
  averageComparisonTarget: string | null;
  islandFilterIslandIdx: number | null;
  showCrossLinks: boolean;
  unifyMutationTypes: boolean;
  showScoreChangeIndicator: boolean;
}

export interface RenderCallbacks {
  programs: Program[];
  onSelectProgram: (program: Program) => void;
  onDoubleClickProgram?: (program: Program) => void;
  onNodeContextMenu?: (
    program: Program,
    screenX: number,
    screenY: number,
  ) => void;
  onReviewPriorityClick?: (program: Program) => void;
  highlightProgram: (id: string | null) => void;
  toggleMergeSelect: (program: Program) => void;
  setAverageComparisonTarget: (
    updater: (prev: string | null) => string | null,
  ) => void;
  setIslandFilterIslandIdx: (
    updater: (prev: number | null) => number | null,
  ) => void;
  onClearScoreThreshold?: () => void;
  onDeselect?: () => void;
  onCanvasContextMenu?: (screenX: number, screenY: number) => void;
}

export interface AnimationState {
  isIncremental: boolean;
  prevPositions: Map<string, { x: number; y: number }>;
}

// ── SVG group management ─────────────────────────────────────────────────

export interface SvgGroups {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  linksG: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodesG: d3.Selection<SVGGElement, unknown, null, undefined>;
}

export function ensureSvgGroups(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  isFullReset: boolean,
  zoomTransform: d3.ZoomTransform,
): SvgGroups {
  if (isFullReset) {
    svg.selectAll("*").remove();
  }

  let g = svg.select<SVGGElement>("g.main-container");
  if (g.empty()) {
    g = svg.append("g").attr("class", "main-container");
  }
  g.attr("transform", zoomTransform.toString());

  let linksG = g.select<SVGGElement>("g.links");
  if (linksG.empty()) {
    linksG = g.append("g").attr("class", "links");
  }

  let nodesG = g.select<SVGGElement>("g.nodes");
  if (nodesG.empty()) {
    nodesG = g.append("g").attr("class", "nodes");
  }

  return { g, linksG, nodesG };
}

// ── Node opacity computation ─────────────────────────────────────────────

export function computeNodeOpacity(
  d: NodeDatum,
  layout: LayoutResult,
  visualState: VisualState,
  animState: AnimationState,
): number {
  if (animState.isIncremental && !animState.prevPositions.has(d.data.id))
    return 0;

  let baseOpacity = 1;

  // Average comparison filter
  if (visualState.averageComparisonTarget) {
    if (
      d.data.id !== ISLAND_ROOT_ID &&
      d.data.id !== VIRTUAL_ROOT_ID &&
      d.data.id !== visualState.selectedProgramId &&
      d.data.id !== visualState.highlightedProgramId
    ) {
      let inGroup = true;
      if (visualState.averageComparisonTarget !== "__all__") {
        const groupKey = layout.nodeAverageComparisonGroupKey.get(d.data.id);
        if (groupKey !== visualState.averageComparisonTarget) inGroup = false;
      }
      if (inGroup) {
        const state = layout.nodeAverageComparisonState.get(d.data.id);
        if (state === "below") baseOpacity = 0.28;
        else if (state === "equal") baseOpacity = 0.65;
      }
    }
  }

  // Island avg filter — dim nodes on the filtered island with below-avg scores
  if (visualState.islandFilterIslandIdx != null) {
    if (
      d.data.id !== ISLAND_ROOT_ID &&
      d.data.id !== VIRTUAL_ROOT_ID &&
      d.data.id !== visualState.selectedProgramId &&
      d.data.id !== visualState.highlightedProgramId
    ) {
      const nodeIslandIdx = layout.getIslandIdxForNodeId(d.data.id);
      if (nodeIslandIdx === visualState.islandFilterIslandIdx) {
        const islandAvg = layout.islandAvgScoreByIslandIdx.get(
          visualState.islandFilterIslandIdx,
        );
        if (islandAvg !== undefined && islandAvg !== null) {
          const nodeScore = getProgramScore(d.data);
          if (
            nodeScore === null ||
            Number.isNaN(nodeScore) ||
            nodeScore < islandAvg
          ) {
            baseOpacity = Math.min(baseOpacity, 0.28);
          }
        }
      }
    }
  }

  // Banned nodes — permanently dimmed
  if (visualState.bannedNodeIds.has(d.data.id)) {
    baseOpacity = Math.min(baseOpacity, 0.15);
  }

  // Score threshold filter
  if (visualState.scoreThreshold != null) {
    if (d.data.id !== ISLAND_ROOT_ID && d.data.id !== VIRTUAL_ROOT_ID) {
      const errorType = d.data.metadata?.error_type;
      if (errorType) {
        baseOpacity = Math.min(baseOpacity, 0.15);
      } else {
        const nodeScore = getProgramScore(d.data);
        if (nodeScore === null || nodeScore < visualState.scoreThreshold) {
          baseOpacity = Math.min(baseOpacity, 0.15);
        }
      }
    }
  }

  return baseOpacity;
}

// ── Radial curve builder ─────────────────────────────────────────────────

export function buildRadialCurve(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  treeCx: number,
  treeCy: number,
): string {
  const sr = Math.hypot(sx - treeCx, sy - treeCy);
  const tr = Math.hypot(tx - treeCx, ty - treeCy);

  if (sr < 1 || tr < 1) return `M${sx},${sy}L${tx},${ty}`;

  const sux = (sx - treeCx) / sr;
  const suy = (sy - treeCy) / sr;
  const tux = (tx - treeCx) / tr;
  const tuy = (ty - treeCy) / tr;

  const cpDist = Math.abs(tr - sr) / 3;
  const c1x = sx + sux * cpDist;
  const c1y = sy + suy * cpDist;
  const c2x = tx - tux * cpDist;
  const c2y = ty - tuy * cpDist;

  return `M${sx},${sy}C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
}

// ── Link rendering ──────────────────────────────────────────────────────

export function renderLinks(
  linksG: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
  animState: AnimationState,
  visualState: VisualState,
): d3.Selection<SVGPathElement, LinkDatum, SVGGElement, unknown> {
  const treeCx = layout.centerNode?.x ?? 0;
  const treeCy = layout.centerNode?.y ?? 0;

  const linkGen = (d: LinkDatum): string =>
    buildRadialCurve(
      d.source.x,
      d.source.y,
      d.target.x,
      d.target.y,
      treeCx,
      treeCy,
    );

  const initialLinkPath = (d: LinkDatum) => {
    if (animState.isIncremental) {
      const sOld = animState.prevPositions.get(d.source.data.id);
      const tOld = animState.prevPositions.get(d.target.data.id);
      if (sOld || tOld) {
        const sx = sOld?.x ?? d.source.x;
        const sy = sOld?.y ?? d.source.y;
        const tx = tOld?.x ?? sOld?.x ?? d.source.x;
        const ty = tOld?.y ?? sOld?.y ?? d.source.y;
        return buildRadialCurve(sx, sy, tx, ty, treeCx, treeCy);
      }
    }
    return linkGen(d);
  };

  const linkKey = (d: LinkDatum) => `${d.source.data.id}->${d.target.data.id}`;

  const linkPaths = linksG
    .selectAll<SVGPathElement, LinkDatum>("path.link")
    .data(layout.links, linkKey)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "link")
          .attr("fill", "none")
          .attr("d", initialLinkPath),
      (update) => update,
      (exit) =>
        exit.transition("exit").duration(200).style("opacity", 0).remove(),
    );

  // The last segment of the selected path is rendered by overlays
  // (only when the setting is on and parent/child have different scores)
  const isLastSelectedSeg = (d: LinkDatum) => {
    if (!visualState.showScoreChangeIndicator) return false;
    if (
      visualState.selectedProgramId == null ||
      d.target.data.id !== visualState.selectedProgramId ||
      !layout.selectedPathIds.has(d.source.data.id)
    )
      return false;
    const ps = getProgramScore(d.source.data) ?? -Infinity;
    const cs = getProgramScore(d.target.data) ?? -Infinity;
    return ps !== cs;
  };

  // Update styling for all links (enter + update)
  linkPaths
    .attr("stroke", (d) => {
      const linkId = `${d.source.data.id}->${d.target.data.id}`;
      if (isLastSelectedSeg(d)) return "transparent";
      if (
        layout.selectedPathIds.has(d.source.data.id) &&
        layout.selectedPathIds.has(d.target.data.id)
      )
        return "#ff8c00";
      if (layout.globalBestPathLinkIds.has(linkId)) return "gold";
      if (layout.secondaryIslandBestPathLinkIds.has(linkId)) return "gold";
      return "#b9b9b9";
    })
    .attr("stroke-width", (d) => {
      const linkId = `${d.source.data.id}->${d.target.data.id}`;
      if (
        layout.selectedPathIds.has(d.source.data.id) &&
        layout.selectedPathIds.has(d.target.data.id)
      )
        return 5;
      if (
        layout.globalBestPathLinkIds.has(linkId) ||
        layout.secondaryIslandBestPathLinkIds.has(linkId)
      )
        return 4;
      return 1.5;
    })
    .attr("stroke-opacity", (d) => {
      const linkId = `${d.source.data.id}->${d.target.data.id}`;
      if (
        layout.selectedPathIds.has(d.source.data.id) &&
        layout.selectedPathIds.has(d.target.data.id)
      )
        return 1;
      if (
        layout.globalBestPathLinkIds.has(linkId) ||
        layout.secondaryIslandBestPathLinkIds.has(linkId)
      )
        return 1;
      return 0.8;
    });

  // ── Last-segment score indicator (half solid / half dashed) ──────────
  // On the link ending at the selected node, show whether the child
  // improved or degraded vs its parent:
  //   child better  → first half dashed, second half solid
  //   parent better → first half solid, second half dashed
  //
  // Implemented with two overlay paths using pathLength=100 normalization:
  //   "solid half":  dasharray="50 100" (draws 50, gaps the rest)
  //   "dashed half": dasharray="4 4" + dashoffset to shift to the other half
  const selectedId = visualState.selectedProgramId;
  let lastSegG = linksG.select<SVGGElement>("g.last-seg-overlay");
  if (lastSegG.empty()) {
    lastSegG = linksG.append("g").attr("class", "last-seg-overlay");
  }

  const lastSegData =
    selectedId && visualState.showScoreChangeIndicator
      ? layout.links.filter((d) => {
          if (
            d.target.data.id !== selectedId ||
            !layout.selectedPathIds.has(d.source.data.id)
          )
            return false;
          // Skip overlay when scores are equal — base link stays solid
          const ps = getProgramScore(d.source.data) ?? -Infinity;
          const cs = getProgramScore(d.target.data) ?? -Infinity;
          return ps !== cs;
        })
      : [];

  // Solid-half overlay
  lastSegG
    .selectAll<SVGPathElement, LinkDatum>("path.last-seg-solid")
    .data(lastSegData, (d) => `${d.source.data.id}->${d.target.data.id}`)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "last-seg-solid")
          .attr("fill", "none"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("d", (d) => linkGen(d))
    .attr("stroke", "#ff8c00")
    .attr("stroke-width", 5)
    .attr("stroke-opacity", 1)
    .attr("pathLength", 100)
    .each(function (d) {
      const parentScore = getProgramScore(d.source.data) ?? -Infinity;
      const childScore = getProgramScore(d.target.data) ?? -Infinity;
      const childBetter = childScore > parentScore;
      // childBetter: solid = second half (offset -50)
      // parentBetter: solid = first half (offset 0)
      d3.select(this)
        .attr("stroke-dasharray", "50 100")
        .attr("stroke-dashoffset", childBetter ? -50 : 0);
    });

  // Dashed-half overlay
  lastSegG
    .selectAll<SVGPathElement, LinkDatum>("path.last-seg-dashed")
    .data(lastSegData, (d) => `d-${d.source.data.id}->${d.target.data.id}`)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "last-seg-dashed")
          .attr("fill", "none"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("d", (d) => linkGen(d))
    .attr("stroke", "#ff8c00")
    .attr("stroke-width", 5)
    .attr("stroke-opacity", 1)
    .attr("pathLength", 100)
    .each(function (d) {
      const parentScore = getProgramScore(d.source.data) ?? -Infinity;
      const childScore = getProgramScore(d.target.data) ?? -Infinity;
      const childBetter = childScore > parentScore;
      // childBetter: dashed = first half → offset 0, draw 50 of dashes then gap
      // parentBetter: dashed = second half → offset -50
      const dashSize = 3;
      // Build a dasharray that covers exactly 50 units of dashes then 50 units of gap
      // We use repeating "3 3" dashes but only for half the path
      // Trick: "3 3 3 3 ... 3 97" → dashes for ~50 units then huge gap
      const numDashes = Math.floor(50 / (dashSize * 2));
      const pattern = Array(numDashes)
        .fill(`${dashSize} ${dashSize}`)
        .join(" ");
      d3.select(this)
        .attr("stroke-dasharray", `${pattern} 0 100`)
        .attr("stroke-dashoffset", childBetter ? 0 : -50);
    });

  return linkPaths;
}

// ── Node rendering (flicker-free with nested data joins) ─────────────────

function computeNodeTransform(
  d: NodeDatum,
  x: number,
  y: number,
  centerNode: NodeDatum | null,
): string {
  const patchType = d.data.metadata?.patch_type || "full";
  const isDiamond = patchType === "init";
  if (
    isDiamond &&
    centerNode &&
    d.data.id !== ISLAND_ROOT_ID &&
    d.data.id !== VIRTUAL_ROOT_ID
  ) {
    const angle = Math.atan2(centerNode.y - y, centerNode.x - x);
    const deg = ((angle + Math.PI / 2) * 180) / Math.PI;
    return `translate(${x},${y}) rotate(${deg})`;
  }
  return `translate(${x},${y})`;
}

export function renderNodes(
  nodesG: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
  visualState: VisualState,
  animState: AnimationState,
  callbacks: RenderCallbacks,
): {
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>;
} {
  const nodeKey = (d: NodeDatum) => d.data.id;

  const initialNodeTransform = (d: NodeDatum) => {
    let x: number;
    let y: number;
    if (animState.isIncremental) {
      const prev = animState.prevPositions.get(d.data.id);
      if (prev) {
        x = prev.x;
        y = prev.y;
      } else if (d.parent) {
        const pp = animState.prevPositions.get(d.parent.data.id);
        if (pp) {
          x = pp.x;
          y = pp.y;
        } else {
          x = d.x;
          y = d.y;
        }
      } else {
        x = d.x;
        y = d.y;
      }
    } else {
      x = d.x;
      y = d.y;
    }
    return computeNodeTransform(d, x, y, layout.centerNode);
  };

  const opacityFn = (d: NodeDatum) =>
    computeNodeOpacity(d, layout, visualState, animState);

  // Keyed data join for node groups
  const nodeSel = nodesG
    .selectAll<SVGGElement, NodeDatum>("g.node")
    .data(layout.nodes, nodeKey)
    .join(
      (enter) => {
        const g = enter
          .append("g")
          .attr("class", "node")
          .attr("transform", initialNodeTransform)
          .style("opacity", opacityFn);
        // Create initial child elements for new nodes
        g.append("path").attr("class", "node-shape");
        g.append("g").attr("class", "node-rings");
        g.append("g").attr("class", "node-labels");
        g.append("g").attr("class", "node-error-cross");
        return g;
      },
      (update) => update.style("opacity", opacityFn),
      (exit) =>
        exit.transition("exit").duration(200).style("opacity", 0).remove(),
    );

  // Delegate to sub-modules
  updateNodeShapes(nodeSel, layout, visualState);
  updateNodeRings(nodeSel, layout, visualState);
  updateNodeLabels(nodeSel, layout, callbacks);
  updateErrorCrosses(nodeSel);
  attachNodeInteractions(nodeSel, layout, visualState, callbacks);

  return { nodeSel };
}

// ── Re-export bookmark rendering ─────────────────────────────────────────

export const renderBookmarks = renderBookmarksImpl;

// ── Transitions ──────────────────────────────────────────────────────────

export function applyTransitions(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  linkSel: d3.Selection<SVGPathElement, LinkDatum, SVGGElement, unknown>,
  layout: LayoutResult,
  animState: AnimationState,
): number {
  if (!animState.isIncremental) return 0;

  const ANIM_DURATION = 350;
  const ease = d3.easeCubicOut;

  const linkGen = (d: LinkDatum): string => {
    const treeCx = layout.centerNode?.x ?? 0;
    const treeCy = layout.centerNode?.y ?? 0;
    return buildRadialCurve(
      d.source.x,
      d.source.y,
      d.target.x,
      d.target.y,
      treeCx,
      treeCy,
    );
  };

  nodeSel
    .transition("move")
    .duration(ANIM_DURATION)
    .ease(ease)
    .attr("transform", (d) =>
      computeNodeTransform(d, d.x, d.y, layout.centerNode),
    );

  nodeSel
    .filter((d) => !animState.prevPositions.has(d.data.id))
    .transition("fade")
    .duration(ANIM_DURATION)
    .ease(ease)
    .style("opacity", 1);

  linkSel
    .transition("links")
    .duration(ANIM_DURATION)
    .ease(ease)
    .attr("d", linkGen);

  return ANIM_DURATION;
}

// ── Z-ordering ───────────────────────────────────────────────────────────

/** Call `.raise()` only when the element isn't already the last child.
 *  Unconditional `.raise()` calls `parentNode.appendChild(this)` which
 *  detaches/re-attaches the node — restarting any SMIL animations inside. */
function raiseIfNeeded(
  sel: d3.Selection<SVGGElement, unknown, null | SVGGElement, unknown>,
): void {
  sel.each(function () {
    const parent = this.parentNode;
    if (parent && parent.lastChild !== this) {
      parent.appendChild(this);
    }
  });
}

export function applyZOrdering(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  linksG: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodesG: d3.Selection<SVGGElement, unknown, null, undefined>,
  selectedProgramId: string | null,
): void {
  raiseIfNeeded(linksG);
  raiseIfNeeded(g.select<SVGGElement>("g.cross-links"));
  if (selectedProgramId) {
    g.select("g.cross-links")
      .selectAll<
        SVGPathElement,
        { source: { data: { id: string } }; target: { data: { id: string } } }
      >("path")
      .filter((d) => d.target.data.id === selectedProgramId)
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 3.5)
      .attr("stroke-opacity", 0.9);
  }
  raiseIfNeeded(nodesG);
}

// ── Re-export canvas handlers ────────────────────────────────────────────

export const setupCanvasHandlers = setupCanvasHandlersImpl;
