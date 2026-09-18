import assert from "node:assert/strict";
import { test } from "node:test";
import * as d3 from "d3";
import { computeAnalytics } from "@/components/tree/treeAnalytics";
import type { LayoutSettings } from "@/components/tree/treeConstants";
import type { ProcessedProgram } from "@/components/tree/treeProcessing";
import { ISLAND_ROOT_ID } from "@/components/tree/treeProcessing";
import type { Program } from "@/types";
import {
  getActiveClusterId,
  getActiveEmbedding,
  getActivePca2d,
  haveCompatibleDimensions,
} from "./embeddingAccessors";
import { computeSimilarityMatrix, cosineSimilarity } from "./math";
import { computeMergeRecommendations } from "./mergeRecommendations";

function program(id: string, reasoning: number[] = [], score = 1): Program {
  return {
    id,
    parent_id: null,
    generation: 0,
    code: "",
    correct: true,
    combined_score: score,
    embedding: [1, 0],
    reasoning_embedding: reasoning,
    reasoning_embedding_pca_2d: [9, 9],
    reasoning_embedding_cluster_id: 2,
  };
}

test("unusable vectors cannot expose stale reasoning coordinates or clusters", () => {
  for (const vector of [[], [0, 0], [NaN, 1], [Infinity, 1]]) {
    const node = program("invalid", vector);
    assert.equal(getActiveEmbedding(node, "reasoning"), undefined);
    assert.equal(getActivePca2d(node, "reasoning"), undefined);
    assert.equal(getActiveClusterId(node, "reasoning"), undefined);
    assert.deepEqual(getActiveEmbedding(node, "code"), [1, 0]);
  }
  const valid = program("valid", [1, 2]);
  valid.reasoning_embedding_pca_2d = [0, 0];
  assert.deepEqual(getActivePca2d(valid, "reasoning"), [0, 0]);
  assert.equal(getActiveClusterId(valid, "reasoning"), 2);
});

test("similarity calculations reject incompatible data and retain real distances", () => {
  assert.equal(cosineSimilarity([1, 0], [1]), null);
  assert.equal(cosineSimilarity([NaN, 1], [1, 0]), null);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), null);
  assert.equal(
    haveCompatibleDimensions([
      [1, 0],
      [1, 0, 0],
    ]),
    false,
  );
  assert.deepEqual(
    computeSimilarityMatrix([
      [1, 0],
      [-1, 0],
    ]),
    [
      [1, -1],
      [-1, 1],
    ],
  );
  assert.throws(
    () => computeSimilarityMatrix([[1, 0], [1]]),
    /matching dimensions/,
  );
});

test("Merge preserves neutral diversity for missing or incompatible candidates", () => {
  const selected = program("selected", [1, 0]);
  const candidates = [
    program("aligned", [1, 0], 10),
    program("opposite", [-1, 0], 0),
    program("missing", [], 5),
    program("mismatched", [1], 5),
  ];
  const recommendations = computeMergeRecommendations(
    selected,
    candidates,
    new Set(),
    { embeddingSource: "reasoning", diversityWeight: 0.6 },
  );
  for (const id of ["missing", "mismatched"]) {
    const recommendation = recommendations.find(
      (item) => item.program.id === id,
    );
    assert.ok(recommendation);
    assert.equal(recommendation.cosineDistance, null);
    assert.equal(recommendation.diversityScore, 0.25);
    assert.equal(recommendation.score, 0.35);
  }
  const withoutSelected = computeMergeRecommendations(
    program("seed", [0, 0]),
    candidates,
    new Set(),
    { embeddingSource: "reasoning", diversityWeight: 1 },
  );
  assert.equal(withoutSelected[0]?.program.id, "aligned");
  assert.ok(
    withoutSelected.every(
      (item) => item.cosineDistance === null && !item.usesEmbeddingDiversity,
    ),
  );
});

test("chords use valid vectors while island chords retain root anchors", () => {
  const source: ProcessedProgram[] = [
    { ...program(ISLAND_ROOT_ID), correct: false, _parentId: null },
    { ...program("root-a", [], 1), island_idx: 0, _parentId: ISLAND_ROOT_ID },
    { ...program("root-b", [], 1), island_idx: 1, _parentId: ISLAND_ROOT_ID },
    { ...program("best-a", [1, 0], 10), island_idx: 0, _parentId: "root-a" },
    { ...program("best-b", [-1, 0], 9), island_idx: 1, _parentId: "root-b" },
  ];
  const settings: LayoutSettings = {
    showErrorNodes: false,
    showTimeoutNodes: false,
    includeErrorInStats: false,
    includeTimeoutInStats: false,
    proportionalSectors: false,
    embeddingSource: "reasoning",
    colorMap: "blues",
    colorMidpoint: "median",
    dissimilarityThreshold: 0.2,
  };
  const root = d3.tree<ProcessedProgram>()(
    d3
      .stratify<ProcessedProgram>()
      .id((node) => node.id)
      .parentId((node) => node._parentId)(source),
  );
  const nodes = root.descendants();
  const nodeById = new Map(nodes.map((node) => [node.data.id, node]));
  const analyze = () =>
    computeAnalytics(
      nodes,
      source,
      root.children ?? [],
      nodeById,
      settings,
      null,
      2,
      (id) => nodeById.get(id)?.data.island_idx,
    );
  const result = analyze();
  assert.equal(result.topKChordLinks.length, 1);
  assert.deepEqual(
    new Set([
      result.topKChordLinks[0]?.source.data.id,
      result.topKChordLinks[0]?.target.data.id,
    ]),
    new Set(["best-a", "best-b"]),
  );
  assert.equal(result.islandChordLinks.length, 1);
  assert.deepEqual(
    new Set([
      result.islandChordLinks[0]?.source.data.id,
      result.islandChordLinks[0]?.target.data.id,
    ]),
    new Set(["root-a", "root-b"]),
  );
  const bestB = source.find((node) => node.id === "best-b");
  assert.ok(bestB);
  bestB.reasoning_embedding = [NaN, 1];
  assert.equal(analyze().topKChordLinks.length, 0);
  assert.equal(analyze().islandChordLinks.length, 0);
});
