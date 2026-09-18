/**
 * treeAnalytics.ts — Score computation, best-path tracking, chord links, and cross links.
 */

import * as d3 from "d3";
import { getActiveEmbedding } from "@/utils/embeddingAccessors";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import type { LayoutSettings } from "./treeConstants";
import { LAYOUT } from "./treeConstants";
import type {
  ChordLinkDatum,
  CrossLinkDatum,
  LayoutResult,
} from "./treeLayoutEngine";
import type { NodeDatum, ProcessedProgram } from "./treeProcessing";
import {
  cosineSimilarity,
  findBestProgram,
  ISLAND_ROOT_ID,
  VIRTUAL_ROOT_ID,
} from "./treeProcessing";

/** Analytics result — everything except structural layout data. */
export type AnalyticsResult = Omit<
  LayoutResult,
  | "nodes"
  | "links"
  | "centerNode"
  | "center"
  | "branchRoots"
  | "branchNodes"
  | "effectiveSectorCount"
  | "occupiedSectors"
  | "sectorBounds"
  | "nodeById"
  | "processed"
  | "processedById"
  | "getIslandIdxForNodeId"
>;

export function computeAnalytics(
  nodes: NodeDatum[],
  processed: ProcessedProgram[],
  branchNodes: NodeDatum[],
  nodeById: Map<string, NodeDatum>,
  settings: LayoutSettings,
  selectedProgramId: string | null,
  effectiveSectorCount: number,
  getIslandIdxForNodeId?: (nodeId: string) => number | null | undefined,
): AnalyticsResult {
  const { includeErrorInStats, includeTimeoutInStats } = settings;
  const nodeHeight = LAYOUT.nodeHeight;

  // Score values
  const scoreValues = processed
    .filter((p) => isCorrectProgram(p))
    .map((p) => getProgramScore(p))
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

  const allNodeScoreValues = processed
    .filter((p) => {
      if (isCorrectProgram(p)) return true;
      if (isTimeoutProgram(p)) return includeTimeoutInStats;
      return includeErrorInStats;
    })
    .map((p) => getProgramScore(p))
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

  const averageAllNodeScore = d3.mean(allNodeScoreValues);
  const minScore = scoreValues.length ? Math.min(...scoreValues) : 0;
  const maxScore = scoreValues.length ? Math.max(...scoreValues) : 1;
  const interpolator =
    settings.colorMap === "viridis"
      ? d3.interpolateViridis
      : d3.interpolateBlues;
  // Use a data-driven midpoint so above-mid nodes get more color resolution.
  // scaleSequential only supports two-point domains, so we use a linear
  // scale that maps [min, mid, max] → [0, 0.5, 1] and feed it to the interpolator.
  const medianAllNodeScore = d3.median(allNodeScoreValues);
  const mid =
    settings.colorMidpoint === "average"
      ? (averageAllNodeScore ?? (minScore + maxScore) / 2)
      : (medianAllNodeScore ?? (minScore + maxScore) / 2);
  const colorNorm = d3
    .scaleLinear()
    .domain([minScore, mid, maxScore])
    .range([0, 0.5, 1])
    .clamp(true);
  const colorScale = Object.assign((v: number) => interpolator(colorNorm(v)), {
    domain: () => [minScore, maxScore] as [number, number],
  }) as d3.ScaleSequential<string>;

  // Best node
  const bestNode = findBestProgram(processed, settings);
  const nodeMap = new Map(processed.map((p) => [p.id, p]));

  // Best path
  const bestPathIds = new Set<string>();
  if (bestNode) {
    let current: ProcessedProgram | undefined = bestNode;
    while (current) {
      bestPathIds.add(current.id);
      if (!current._parentId) break;
      current = nodeMap.get(current._parentId);
    }
  }

  // Selected path
  const selectedPathIds = new Set<string>();
  if (selectedProgramId) {
    selectedPathIds.add(selectedProgramId);
    const selectedNode = nodeById.get(selectedProgramId);
    if (selectedNode) {
      for (const ancestor of selectedNode.ancestors()) {
        selectedPathIds.add(ancestor.data.id);
      }
    }
  }

  // Island best paths
  const globalBestPathLinkIds = new Set<string>();
  const secondaryIslandBestPathLinkIds = new Set<string>();
  const globalBestPathNodeIds = new Set<string>();
  const secondaryIslandBestPathNodeIds = new Set<string>();
  const localBestNodeIds = new Set<string>();
  const islandBestProgramByIslandIdx = new Map<number, ProcessedProgram>();
  const islandAvgScoreByIslandIdx = new Map<number, number>();

  /** Walk from target node up to the island root, collecting link/node IDs.
   *  If any ancestor along the path belongs to a different island than `islandIdx`,
   *  the path crosses islands — skip it entirely to avoid messy cross-sector lines. */
  const addPathLinksToIslandRoot = (
    targetNodeId: string,
    islandIdx: number,
    targetSet: Set<string>,
    nodeSet: Set<string>,
  ) => {
    // First pass: check if the path stays within the same island
    let cursor = nodeMap.get(targetNodeId);
    while (cursor?._parentId) {
      const parentId = cursor._parentId;
      if (parentId === ISLAND_ROOT_ID || parentId === VIRTUAL_ROOT_ID) break;
      const parentIsland = getIslandIdxForNodeId?.(parentId);
      if (parentIsland != null && parentIsland !== islandIdx) {
        // Path crosses islands — don't highlight it
        return;
      }
      cursor = nodeMap.get(parentId);
    }
    // Second pass: safe to add all links
    let current = nodeMap.get(targetNodeId);
    while (current?._parentId) {
      const parentId = current._parentId;
      nodeSet.add(current.id);
      nodeSet.add(parentId);
      targetSet.add(`${parentId}->${current.id}`);
      if (parentId === ISLAND_ROOT_ID || parentId === VIRTUAL_ROOT_ID) break;
      current = nodeMap.get(parentId);
    }
  };

  // Group all programs by their actual island_idx (not by tree descendancy)
  const programsByIsland = new Map<number, ProcessedProgram[]>();
  for (const p of processed) {
    if (p.id === ISLAND_ROOT_ID || p.id === VIRTUAL_ROOT_ID) continue;
    const idx = getIslandIdxForNodeId?.(p.id);
    if (idx == null) continue;
    const group = programsByIsland.get(idx) ?? [];
    group.push(p);
    programsByIsland.set(idx, group);
  }

  for (const [islandIdx, islandPrograms] of programsByIsland) {
    const islandScoringNodes = islandPrograms.filter((program) => {
      const score = getProgramScore(program);
      if (score === null || Number.isNaN(score)) return false;
      if (isCorrectProgram(program)) return true;
      if (isTimeoutProgram(program)) return includeTimeoutInStats;
      return includeErrorInStats;
    });

    const islandFallbackNodes = islandPrograms.filter((program) => {
      const score = getProgramScore(program);
      if (score === null || Number.isNaN(score)) return false;
      return isCorrectProgram(program);
    });

    const scoresForAvg = islandScoringNodes
      .map((p) => getProgramScore(p))
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    const avgScore =
      scoresForAvg.length > 0
        ? d3.mean(scoresForAvg)
        : islandFallbackNodes.length > 0
          ? d3.mean(
              islandFallbackNodes
                .map((p) => getProgramScore(p))
                .filter((v): v is number => v !== null && !Number.isNaN(v)),
            )
          : null;
    if (avgScore !== undefined && avgScore !== null) {
      islandAvgScoreByIslandIdx.set(islandIdx, avgScore);
    }

    const islandBest =
      islandScoringNodes.length > 0
        ? islandScoringNodes.reduce((a, b) =>
            (getProgramScore(a) ?? -Infinity) >
            (getProgramScore(b) ?? -Infinity)
              ? a
              : b,
          )
        : islandFallbackNodes.length > 0
          ? islandFallbackNodes.reduce((a, b) =>
              (getProgramScore(a) ?? -Infinity) >
              (getProgramScore(b) ?? -Infinity)
                ? a
                : b,
            )
          : null;

    if (islandBest) {
      localBestNodeIds.add(islandBest.id);
      islandBestProgramByIslandIdx.set(islandIdx, islandBest);
      if (bestNode && islandBest.id === bestNode.id) {
        addPathLinksToIslandRoot(
          islandBest.id,
          islandIdx,
          globalBestPathLinkIds,
          globalBestPathNodeIds,
        );
      } else {
        addPathLinksToIslandRoot(
          islandBest.id,
          islandIdx,
          secondaryIslandBestPathLinkIds,
          secondaryIslandBestPathNodeIds,
        );
      }
    }
  }

  // Top-K chord links
  const topKChordLinks = computeTopKChordLinks(
    processed,
    nodeById,
    settings,
    bestNode,
  );

  // Island best chord links (anchored at initial program nodes)
  const islandChordLinks = computeIslandChordLinks(
    islandBestProgramByIslandIdx,
    branchNodes,
    nodeById,
    settings,
    getIslandIdxForNodeId,
  );

  // Cross-links
  const crossLinks = computeCrossLinks(processed, nodeById);

  // Average comparison data
  const { nodeAverageComparisonState, nodeAverageComparisonGroupKey } =
    computeAverageComparison(nodes, settings, effectiveSectorCount, nodeHeight);

  return {
    bestNode,
    bestPathIds,
    selectedPathIds,
    globalBestPathLinkIds,
    globalBestPathNodeIds,
    secondaryIslandBestPathLinkIds,
    secondaryIslandBestPathNodeIds,
    localBestNodeIds,
    islandBestProgramByIslandIdx,
    islandAvgScoreByIslandIdx,
    colorScale,
    minScore,
    maxScore,
    averageAllNodeScore,
    crossLinks,
    topKChordLinks,
    islandChordLinks,
    nodeAverageComparisonState,
    nodeAverageComparisonGroupKey,
  };
}

// ── Top-K chord links ────────────────────────────────────────────────────

function computeTopKChordLinks(
  processed: ProcessedProgram[],
  nodeById: Map<string, NodeDatum>,
  settings: LayoutSettings,
  bestNode: ProcessedProgram | null,
): ChordLinkDatum[] {
  const topKCount = 5;
  const DISSIMILARITY_THRESHOLD = settings.dissimilarityThreshold;
  const { includeErrorInStats, includeTimeoutInStats } = settings;

  const scoringNodes = processed.filter((p) => {
    const score = getProgramScore(p);
    if (score === null || Number.isNaN(score)) return false;
    if (isCorrectProgram(p)) return true;
    if (isTimeoutProgram(p)) return includeTimeoutInStats;
    return includeErrorInStats;
  });
  const fallbackNodes = processed.filter((p) => {
    const score = getProgramScore(p);
    if (score === null || Number.isNaN(score)) return false;
    return isCorrectProgram(p);
  });
  const rankingSource = scoringNodes.length > 0 ? scoringNodes : fallbackNodes;
  const rankCandidates = rankingSource.filter(
    (p) => p.id !== ISLAND_ROOT_ID && p.id !== VIRTUAL_ROOT_ID,
  );
  const topKNodes = rankCandidates
    .slice()
    .sort((a, b) => {
      const scoreDelta =
        (getProgramScore(b) ?? -Infinity) - (getProgramScore(a) ?? -Infinity);
      if (scoreDelta !== 0) return scoreDelta;
      if (bestNode) {
        if (a.id === bestNode.id && b.id !== bestNode.id) return -1;
        if (b.id === bestNode.id && a.id !== bestNode.id) return 1;
      }
      return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    })
    .slice(0, topKCount);

  const links: ChordLinkDatum[] = [];
  for (let i = 0; i < topKNodes.length; i += 1) {
    for (let j = i + 1; j < topKNodes.length; j += 1) {
      const leftProgram = topKNodes[i];
      const rightProgram = topKNodes[j];
      if (
        leftProgram.id === ISLAND_ROOT_ID ||
        rightProgram.id === ISLAND_ROOT_ID ||
        leftProgram.id === VIRTUAL_ROOT_ID ||
        rightProgram.id === VIRTUAL_ROOT_ID
      )
        continue;
      const leftEmb = getActiveEmbedding(leftProgram, settings.embeddingSource);
      const leftEmbedding = Array.isArray(leftEmb) ? leftEmb : null;
      const rightEmb = getActiveEmbedding(
        rightProgram,
        settings.embeddingSource,
      );
      const rightEmbedding = Array.isArray(rightEmb) ? rightEmb : null;
      if (!leftEmbedding || !rightEmbedding) continue;

      const similarity = cosineSimilarity(leftEmbedding, rightEmbedding);
      if (similarity === null || Number.isNaN(similarity)) continue;

      const dissimilarity = 1 - similarity;
      if (dissimilarity <= DISSIMILARITY_THRESHOLD) continue;

      const source = nodeById.get(leftProgram.id);
      const target = nodeById.get(rightProgram.id);
      if (!source || !target) continue;

      links.push({ source, target, dissimilarity });
    }
  }
  return links;
}

// ── Island best chord links ──────────────────────────────────────────────

function computeIslandChordLinks(
  islandBestProgramByIslandIdx: Map<number, ProcessedProgram>,
  branchNodes: NodeDatum[],
  _nodeById: Map<string, NodeDatum>,
  settings: LayoutSettings,
  getIslandIdxForNodeId?: (nodeId: string) => number | null | undefined,
): ChordLinkDatum[] {
  const DISSIMILARITY_THRESHOLD = settings.dissimilarityThreshold;

  // Build a map from island_idx → first branch root node on that island
  // (used as chord anchor points — the initial program nodes near the center).
  const anchorByIsland = new Map<number, NodeDatum>();
  for (const br of branchNodes) {
    const idx = getIslandIdxForNodeId?.(br.data.id);
    if (idx != null && !anchorByIsland.has(idx)) {
      anchorByIsland.set(idx, br);
    }
  }

  const islandEntries = Array.from(islandBestProgramByIslandIdx.entries())
    .map(([islandIdx, bestProgram]) => {
      const anchor = anchorByIsland.get(islandIdx);
      if (!anchor) return null;
      const emb = getActiveEmbedding(bestProgram, settings.embeddingSource);
      const embedding = Array.isArray(emb) ? emb : null;
      if (!embedding) return null;
      return { anchor, embedding };
    })
    .filter(
      (
        value,
      ): value is {
        anchor: NodeDatum;
        embedding: number[];
      } => Boolean(value),
    );

  const links: ChordLinkDatum[] = [];
  for (let i = 0; i < islandEntries.length; i += 1) {
    for (let j = i + 1; j < islandEntries.length; j += 1) {
      const left = islandEntries[i];
      const right = islandEntries[j];
      const similarity = cosineSimilarity(left.embedding, right.embedding);
      if (similarity === null || Number.isNaN(similarity)) continue;

      const dissimilarity = 1 - similarity;
      if (dissimilarity <= DISSIMILARITY_THRESHOLD) continue;

      links.push({
        source: left.anchor,
        target: right.anchor,
        dissimilarity,
      });
    }
  }
  return links;
}

// ── Cross-links ──────────────────────────────────────────────────────────

function computeCrossLinks(
  processed: ProcessedProgram[],
  nodeById: Map<string, NodeDatum>,
): CrossLinkDatum[] {
  return processed
    .filter((program) => program.metadata?.patch_type === "cross")
    .map((program) => {
      const inspirationId =
        program.top_k_inspiration_ids?.[0] ??
        program.archive_inspiration_ids?.[0] ??
        null;
      if (!inspirationId) return null;
      const crossNode = nodeById.get(program.id);
      const inspirationNode = nodeById.get(inspirationId);
      if (!crossNode || !inspirationNode) return null;
      return { source: inspirationNode, target: crossNode };
    })
    .filter((link): link is CrossLinkDatum => Boolean(link));
}

// ── Average comparison data ──────────────────────────────────────────────

function computeAverageComparison(
  nodes: NodeDatum[],
  settings: LayoutSettings,
  effectiveSectorCount: number,
  nodeHeight: number,
): {
  nodeAverageComparisonState: Map<string, "above" | "below" | "equal">;
  nodeAverageComparisonGroupKey: Map<string, string>;
} {
  const { includeErrorInStats, includeTimeoutInStats } = settings;
  const nodeAverageComparisonState = new Map<
    string,
    "above" | "below" | "equal"
  >();
  const nodeAverageComparisonGroupKey = new Map<string, string>();

  const centerNode =
    nodes.find((d) => d.data.id === ISLAND_ROOT_ID) ??
    nodes.find((d) => d.data.generation === 0) ??
    null;

  if (!centerNode) {
    return { nodeAverageComparisonState, nodeAverageComparisonGroupKey };
  }

  const center = { x: centerNode.x, y: centerNode.y };
  const twoPi = Math.PI * 2;
  const sectorStartAngle = -Math.PI / 2;
  const sectorStep =
    effectiveSectorCount > 0 ? twoPi / effectiveSectorCount : twoPi;

  const normalize = (angle: number) => {
    let normalized = angle;
    while (normalized < 0) normalized += twoPi;
    while (normalized >= twoPi) normalized -= twoPi;
    return normalized;
  };

  type GroupedRingNode = {
    node: NodeDatum;
    angle: number;
  };

  const groupKey = (sectorIndex: number, ringIndex: number) =>
    `${sectorIndex}:${ringIndex}`;
  const groupedNodes = new Map<string, GroupedRingNode[]>();

  const ringNodes = nodes
    .filter(
      (node) => node.data.generation > 0 && node.data.id !== ISLAND_ROOT_ID,
    )
    .map((node) => {
      const radius = Math.hypot(node.x - center.x, node.y - center.y);
      const ringIndex = Math.max(1, Math.round(radius / nodeHeight));
      const angle = normalize(Math.atan2(node.y - center.y, node.x - center.x));
      const shifted = normalize(angle - normalize(sectorStartAngle));
      const rawSectorIndex = Math.floor(shifted / sectorStep);
      const sectorIndex = Math.max(
        0,
        Math.min(effectiveSectorCount - 1, rawSectorIndex),
      );
      return { node, ringIndex, angle, sectorIndex };
    });

  ringNodes.forEach((entry) => {
    const key = groupKey(entry.sectorIndex, entry.ringIndex);
    const bucket = groupedNodes.get(key) ?? [];
    bucket.push({ node: entry.node, angle: entry.angle });
    groupedNodes.set(key, bucket);
  });

  for (const [key, entries] of groupedNodes.entries()) {
    if (entries.length <= 1) continue;

    const statsEntries = entries.filter((entry) => {
      const p = entry.node.data;
      if (isCorrectProgram(p)) return true;
      if (isTimeoutProgram(p)) return includeTimeoutInStats;
      return includeErrorInStats;
    });
    const groupScores = statsEntries
      .map((entry) => getProgramScore(entry.node.data))
      .filter(
        (score): score is number => score !== null && Number.isFinite(score),
      );
    if (groupScores.length === 0) continue;

    const averageScore = d3.mean(groupScores);
    if (averageScore === undefined || !Number.isFinite(averageScore)) continue;

    statsEntries.forEach((entry) => {
      const score = getProgramScore(entry.node.data);
      if (score === null || !Number.isFinite(score)) return;
      if (score > averageScore) {
        nodeAverageComparisonState.set(entry.node.data.id, "above");
        nodeAverageComparisonGroupKey.set(entry.node.data.id, key);
      } else if (score < averageScore) {
        nodeAverageComparisonState.set(entry.node.data.id, "below");
        nodeAverageComparisonGroupKey.set(entry.node.data.id, key);
      } else {
        nodeAverageComparisonState.set(entry.node.data.id, "equal");
        nodeAverageComparisonGroupKey.set(entry.node.data.id, key);
      }
    });
  }

  return { nodeAverageComparisonState, nodeAverageComparisonGroupKey };
}
