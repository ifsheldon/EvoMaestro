/**
 * treeLayoutEngine.ts — Orchestrator for tree layout computation.
 *
 * Delegates to:
 *   - treeProcessing.ts — program filtering, hierarchy construction
 *   - treeSimulation.ts — physics-based radial layout
 *   - treeAnalytics.ts  — score analytics, best paths, chord/cross links
 */

import * as d3 from "d3";
import type { Program } from "@/types";
import { computeAnalytics } from "./treeAnalytics";
import type { LayoutSettings, SectorBounds } from "./treeConstants";
import { LAYOUT } from "./treeConstants";
import type { NodeDatum, ProcessedProgram } from "./treeProcessing";
import {
  buildHierarchy,
  ISLAND_ROOT_ID,
  processPrograms,
  VIRTUAL_ROOT_ID,
} from "./treeProcessing";
import { runPhysicsSimulation } from "./treeSimulation";

// ── Re-exports ───────────────────────────────────────────────────────────
// These are the canonical imports for consumers.

export type { NodeDatum, ProcessedProgram } from "./treeProcessing";
export { ISLAND_ROOT_ID, VIRTUAL_ROOT_ID } from "./treeProcessing";

export type LinkDatum = d3.HierarchyPointLink<ProcessedProgram>;

export interface ChordLinkDatum {
  source: NodeDatum;
  target: NodeDatum;
  dissimilarity: number;
}

export interface CrossLinkDatum {
  source: NodeDatum;
  target: NodeDatum;
}

/** Result of layout computation — everything the renderer needs. */
export interface LayoutResult {
  nodes: NodeDatum[];
  links: LinkDatum[];
  centerNode: NodeDatum | null;
  center: { x: number; y: number } | null;
  branchRoots: NodeDatum[];
  branchNodes: NodeDatum[];
  effectiveSectorCount: number;
  occupiedSectors: Set<number>;
  sectorBounds: Map<number, SectorBounds>;
  nodeById: Map<string, NodeDatum>;
  processed: ProcessedProgram[];
  processedById: Map<string, ProcessedProgram>;
  getIslandIdxForNodeId: (nodeId: string) => number | null | undefined;

  // Score data
  colorScale: d3.ScaleSequential<string>;
  minScore: number;
  maxScore: number;
  averageAllNodeScore: number | undefined;

  // Best/path tracking
  bestNode: ProcessedProgram | null;
  bestPathIds: Set<string>;
  selectedPathIds: Set<string>;
  globalBestPathLinkIds: Set<string>;
  globalBestPathNodeIds: Set<string>;
  secondaryIslandBestPathLinkIds: Set<string>;
  secondaryIslandBestPathNodeIds: Set<string>;
  localBestNodeIds: Set<string>;

  // Island data
  islandBestProgramByIslandIdx: Map<number, ProcessedProgram>;
  islandAvgScoreByIslandIdx: Map<number, number>;

  // Chord / cross links
  crossLinks: CrossLinkDatum[];
  topKChordLinks: ChordLinkDatum[];
  islandChordLinks: ChordLinkDatum[];

  // Average comparison data
  nodeAverageComparisonState: Map<string, "above" | "below" | "equal">;
  nodeAverageComparisonGroupKey: Map<string, string>;
}

// ── Re-export constants ──────────────────────────────────────────────────

export type { LayoutSettings, SectorBounds } from "./treeConstants";
export { LAYOUT } from "./treeConstants";

// ── Sector bounds computation ───────────────────────────────────────

/**
 * Compute proportional sector widths based on per-generation node density.
 *
 * For each generation (depth), every branch's share = its node count / total
 * nodes at that depth × 2π.  Each branch's raw width is the *maximum* share
 * across all its generations, clamped to [minSectorWidth, maxSectorWidth],
 * then normalized so all widths (including phantom sectors for <3 islands)
 * sum to exactly 2π.
 */
function computeProportionalSectorBounds(
  islandDepthCounts: Map<number, Map<number, number>>,
  effectiveSectorCount: number,
): Map<number, SectorBounds> {
  const TWO_PI = Math.PI * 2;
  const { minSectorWidth, maxSectorWidth, twoIslandEmptyMin } = LAYOUT;

  const islandIndices = [...islandDepthCounts.keys()].sort((a, b) => a - b);

  // 1. Collect all depths present across all islands
  const allDepths = new Set<number>();
  for (const counts of islandDepthCounts.values()) {
    for (const d of counts.keys()) allDepths.add(d);
  }

  // 2. For each depth, compute each island's proportional share of 2π;
  //    track the max share per island across all depths.
  const rawWidthByIsland = new Map<number, number>();
  for (const idx of islandIndices) rawWidthByIsland.set(idx, 0);

  for (const depth of allDepths) {
    let totalAtDepth = 0;
    for (const counts of islandDepthCounts.values()) {
      totalAtDepth += counts.get(depth) ?? 0;
    }
    if (totalAtDepth === 0) continue;
    for (const idx of islandIndices) {
      const counts = islandDepthCounts.get(idx)!;
      const count = counts.get(depth) ?? 0;
      const share = (count / totalAtDepth) * TWO_PI;
      const current = rawWidthByIsland.get(idx) ?? 0;
      if (share > current) rawWidthByIsland.set(idx, share);
    }
  }

  // 3. Clamp each real island to [min, max]
  for (const idx of islandIndices) {
    const w = rawWidthByIsland.get(idx) ?? 0;
    rawWidthByIsland.set(
      idx,
      Math.max(minSectorWidth, Math.min(maxSectorWidth, w)),
    );
  }

  // 4. Build per-slot widths across all effectiveSectorCount slots.
  const slotWidths = new Array<number>(effectiveSectorCount).fill(0);
  const realSlots = new Set<number>();
  for (const idx of islandIndices) {
    if (idx < effectiveSectorCount) {
      slotWidths[idx] = rawWidthByIsland.get(idx) ?? 0;
      realSlots.add(idx);
    }
  }

  // Distribute remaining space to phantom (unoccupied) slots
  const phantomSlots = [];
  for (let s = 0; s < effectiveSectorCount; s++) {
    if (!realSlots.has(s)) phantomSlots.push(s);
  }
  const realSum = [...rawWidthByIsland.values()].reduce((a, b) => a + b, 0);
  if (phantomSlots.length > 0) {
    const phantomEach = Math.max(
      twoIslandEmptyMin / phantomSlots.length,
      (TWO_PI - realSum) / phantomSlots.length,
    );
    for (const s of phantomSlots) slotWidths[s] = phantomEach;
  }

  // 5. Normalize so all widths sum to 2π
  const total = slotWidths.reduce((a, b) => a + b, 0);
  const scale = TWO_PI / total;
  for (let i = 0; i < slotWidths.length; i++) {
    slotWidths[i] *= scale;
  }

  // 6. Assign cumulative start angles for all slots
  const result = new Map<number, SectorBounds>();
  let angle = -Math.PI / 2;
  for (let s = 0; s < effectiveSectorCount; s++) {
    result.set(s, { start: angle, width: slotWidths[s] });
    angle += slotWidths[s];
  }

  return result;
}

/**
 * Compute uniform sector bounds (the original equal-width approach).
 */
function computeUniformSectorBounds(
  effectiveSectorCount: number,
): Map<number, SectorBounds> {
  const wedgeAngle = (Math.PI * 2) / effectiveSectorCount;
  const result = new Map<number, SectorBounds>();
  for (let s = 0; s < effectiveSectorCount; s++) {
    const start = -Math.PI / 2 + s * wedgeAngle;
    result.set(s, { start, width: wedgeAngle });
  }
  return result;
}

// ── Main entry point ─────────────────────────────────────────────────────

export function computeTreeLayout(
  programs: Program[],
  settings: LayoutSettings,
  prevPositions: Map<string, { x: number; y: number }>,
  _isFirstRender: boolean,
  filterSettingsChanged: boolean,
  selectedProgramId: string | null,
  numIslands?: number,
): LayoutResult | null {
  if (!programs.length) return null;

  const { processed, getIslandIdxForNodeId } = processPrograms(
    programs,
    settings,
  );
  const hierarchy = buildHierarchy(processed);

  const nodeWidth = 100;
  const nodeHeight = LAYOUT.nodeHeight;
  const treeLayout = d3.tree<ProcessedProgram>();
  treeLayout.nodeSize([nodeWidth, nodeHeight]);
  const root = treeLayout(hierarchy);

  const nodes = root.descendants().filter((d) => d.data.id !== VIRTUAL_ROOT_ID);
  const links = root
    .links()
    .filter(
      (l) =>
        l.source.data.id !== VIRTUAL_ROOT_ID &&
        l.source.data.id !== ISLAND_ROOT_ID,
    );

  const nodeById = new Map(nodes.map((node) => [node.data.id, node]));

  const centerNode =
    nodes.find((d) => d.data.id === ISLAND_ROOT_ID) ??
    nodes.find((d) => d.data.generation === 0) ??
    null;

  const branchNodes = nodes.filter((d) => {
    if (!d.data._parentId) return false;
    const parent = nodeById.get(d.data._parentId);
    return parent?.data.id === ISLAND_ROOT_ID;
  });

  // Sort by island_idx so each branch always maps to the same sector,
  // regardless of arrival order during incremental updates.
  const branchRoots = branchNodes
    .slice()
    .sort((a, b) => (a.data.island_idx ?? 0) - (b.data.island_idx ?? 0));

  // Compute tree depth for each node by walking branch roots (matches the
  // simulation's ring placement). Then group by island_idx + tree depth.
  const nodeTreeDepth = new Map<string, number>();
  for (const branchRoot of branchRoots) {
    const walk = (node: NodeDatum, depth: number) => {
      nodeTreeDepth.set(node.data.id, depth);
      if (node.children) {
        for (const ch of node.children) walk(ch, depth + 1);
      }
    };
    walk(branchRoot, 0);
  }

  const islandDepthCounts = new Map<number, Map<number, number>>();
  const occupiedSectors = new Set<number>();
  for (const node of nodes) {
    if (node.data.id === ISLAND_ROOT_ID || node.data.id === VIRTUAL_ROOT_ID)
      continue;
    const idx = getIslandIdxForNodeId(node.data.id);
    if (idx == null) continue;
    occupiedSectors.add(idx);
    if (!islandDepthCounts.has(idx))
      islandDepthCounts.set(idx, new Map<number, number>());
    const depth = nodeTreeDepth.get(node.data.id) ?? 0;
    const depthMap = islandDepthCounts.get(idx)!;
    depthMap.set(depth, (depthMap.get(depth) ?? 0) + 1);
  }

  const effectiveSectorCount = Math.max(
    3,
    islandDepthCounts.size,
    numIslands ?? 1,
  );

  // Compute sector bounds (proportional or uniform)
  const sectorBounds = settings.proportionalSectors
    ? computeProportionalSectorBounds(islandDepthCounts, effectiveSectorCount)
    : computeUniformSectorBounds(effectiveSectorCount);

  // Run physics or restore cached positions
  if (centerNode && branchRoots.length > 0) {
    runPhysicsSimulation(
      nodes,
      { x: centerNode.x, y: centerNode.y },
      branchRoots,
      sectorBounds,
      prevPositions,
      filterSettingsChanged,
      getIslandIdxForNodeId,
    );
  }

  const processedById = new Map(processed.map((p) => [p.id, p]));
  const center = centerNode ? { x: centerNode.x, y: centerNode.y } : null;

  const analytics = computeAnalytics(
    nodes,
    processed,
    branchNodes,
    nodeById,
    settings,
    selectedProgramId,
    effectiveSectorCount,
    getIslandIdxForNodeId,
  );

  return {
    nodes,
    links,
    centerNode,
    center,
    branchRoots,
    branchNodes,
    effectiveSectorCount,
    occupiedSectors,
    sectorBounds,
    nodeById,
    processed,
    processedById,
    getIslandIdxForNodeId,
    ...analytics,
  };
}
