/**
 * treeProcessing.ts — Program filtering, normalization, and hierarchy construction.
 */

import * as d3 from "d3";
import type { Program } from "@/types";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import { normalizeId } from "./treeUtils";

// ── Core types ───────────────────────────────────────────────────────────
export type ProcessedProgram = Program & { _parentId: string | null };
export type NodeDatum = d3.HierarchyPointNode<ProcessedProgram>;

export const ISLAND_ROOT_ID = "__island_root__";
export const VIRTUAL_ROOT_ID = "__virtual_root__";

// ── Helpers ──────────────────────────────────────────────────────────────

export { cosineSimilarity } from "@/utils/math";

export function findBestProgram(
  programs: ProcessedProgram[],
  settings: { includeErrorInStats: boolean; includeTimeoutInStats: boolean },
): ProcessedProgram | null {
  const scoringNodes = programs.filter((p) => {
    const score = getProgramScore(p);
    if (score === null || Number.isNaN(score)) return false;
    if (isCorrectProgram(p)) return true;
    if (isTimeoutProgram(p)) return settings.includeTimeoutInStats;
    return settings.includeErrorInStats;
  });

  const fallbackNodes = programs.filter((p) => {
    const score = getProgramScore(p);
    if (score === null || Number.isNaN(score)) return false;
    return isCorrectProgram(p);
  });

  const source = scoringNodes.length > 0 ? scoringNodes : fallbackNodes;
  if (source.length === 0) return null;

  return source.reduce((a, b) =>
    (getProgramScore(a) ?? -Infinity) > (getProgramScore(b) ?? -Infinity)
      ? a
      : b,
  );
}

// ── Process and filter programs ──────────────────────────────────────────

export function processPrograms(
  programs: Program[],
  settings: { showErrorNodes: boolean; showTimeoutNodes: boolean },
): {
  processed: ProcessedProgram[];
  getIslandIdxForNodeId: (nodeId: string) => number | null | undefined;
} {
  const filteredPrograms = programs.filter((p) => {
    if (p._lifecycle === "queued") return true; // always show ghost nodes
    if (isCorrectProgram(p)) return true;
    if (isTimeoutProgram(p)) return settings.showTimeoutNodes;
    return settings.showErrorNodes;
  });

  const idSet = new Set(filteredPrograms.map((p) => String(p.id)));
  const directIslandIdxByProgramId = new Map(
    filteredPrograms.map((p) => [String(p.id), p.island_idx]),
  );

  let processed: ProcessedProgram[] = filteredPrograms.map((p) => {
    const parent = normalizeId(p.parent_id);
    return {
      ...p,
      id: String(p.id),
      _parentId: parent && idSet.has(parent) ? parent : null,
    };
  });

  const rootPrograms = processed.filter((p) => p._parentId === null);
  const seed = rootPrograms[0] ?? processed[0];

  processed = processed.map((p) =>
    p._parentId === null ? { ...p, _parentId: ISLAND_ROOT_ID } : p,
  );

  if (seed) {
    processed.push({
      ...seed,
      id: ISLAND_ROOT_ID,
      parent_id: null,
      _parentId: null,
      generation: -1,
      metadata: {
        ...seed.metadata,
        patch_name: "Island Root",
        patch_type: "start",
      },
      island_idx: null,
      correct: true,
    });
  }

  const rootCandidates = processed.filter((p) => p._parentId === null);
  if (rootCandidates.length > 1) {
    processed = processed.map((p) =>
      p._parentId === null ? { ...p, _parentId: VIRTUAL_ROOT_ID } : p,
    );
    processed.push({
      id: VIRTUAL_ROOT_ID,
      parent_id: null,
      _parentId: null,
      generation: -1,
      code: "",
      language: "",
      metadata: { patch_name: "Virtual Root", patch_type: "init" },
      correct: true,
    } as ProcessedProgram);
  }

  // Build inherited island index resolver
  const processedById = new Map(processed.map((p) => [p.id, p]));
  const inheritedIslandCache = new Map<string, number | null | undefined>();

  const getIslandIdxForNodeId = (nodeId: string): number | null | undefined => {
    const key = String(nodeId);
    if (inheritedIslandCache.has(key)) {
      return inheritedIslandCache.get(key);
    }

    const node = processedById.get(key);
    const ownIslandIdx = directIslandIdxByProgramId.get(key);
    if (!node || !node._parentId) {
      inheritedIslandCache.set(key, ownIslandIdx);
      return ownIslandIdx;
    }

    const parentIslandIdx = getIslandIdxForNodeId(node._parentId);
    const resolvedIslandIdx =
      ownIslandIdx !== null && ownIslandIdx !== undefined
        ? ownIslandIdx
        : parentIslandIdx;

    inheritedIslandCache.set(key, resolvedIslandIdx);
    return resolvedIslandIdx;
  };

  return { processed, getIslandIdxForNodeId };
}

// ── Build hierarchy ──────────────────────────────────────────────────────

export function buildHierarchy(processed: ProcessedProgram[]) {
  const hierarchy = d3
    .stratify<ProcessedProgram>()
    .id((d) => d.id)
    .parentId((d) => d._parentId)(processed);

  hierarchy.sort((a, b) => {
    const genA = a.data.generation ?? 0;
    const genB = b.data.generation ?? 0;
    if (genA !== genB) return genA - genB;
    return (a.data.timestamp ?? 0) - (b.data.timestamp ?? 0);
  });

  return hierarchy;
}
