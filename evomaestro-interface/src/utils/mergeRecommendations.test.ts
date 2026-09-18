import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Program } from "@/types";
import { computeMergeRecommendations } from "./mergeRecommendations";
import {
  DEFAULT_MERGE_DIVERSITY_WEIGHT,
  resolveMergeRecommendationWeights,
} from "./mergeRecommendationWeights";

function makeProgram(id: string, score: number, embedding?: number[]): Program {
  return {
    id,
    parent_id: null,
    generation: 0,
    combined_score: score,
    correct: true,
    code: "",
    embedding,
    island_idx: 0,
    in_archive: false,
  };
}

const selected = makeProgram("selected", 5, [1, 0]);
const highQuality = makeProgram("quality", 10, [1, 0]);
const highDiversity = makeProgram("diversity", 0, [-1, 0]);
const candidates = [highQuality, highDiversity];

describe("merge recommendation weights", () => {
  test("constrains the persisted diversity value and derives a complementary quality weight", () => {
    assert.deepEqual(resolveMergeRecommendationWeights(-0.5), {
      diversity: 0,
      quality: 1,
    });
    assert.deepEqual(resolveMergeRecommendationWeights(1.5), {
      diversity: 1,
      quality: 0,
    });
    assert.deepEqual(resolveMergeRecommendationWeights("invalid"), {
      diversity: DEFAULT_MERGE_DIVERSITY_WEIGHT,
      quality: 1 - DEFAULT_MERGE_DIVERSITY_WEIGHT,
    });
  });

  test("quality and diversity endpoints select their respective strongest candidate", () => {
    const qualityFirst = computeMergeRecommendations(
      selected,
      candidates,
      new Set(),
      { diversityWeight: 0 },
    );
    const diversityFirst = computeMergeRecommendations(
      selected,
      candidates,
      new Set(),
      { diversityWeight: 1 },
    );

    assert.equal(qualityFirst[0]?.program.id, highQuality.id);
    assert.equal(diversityFirst[0]?.program.id, highDiversity.id);
  });

  test("uses the documented 60 percent diversity balance by default", () => {
    const result = computeMergeRecommendations(selected, candidates, new Set());

    assert.equal(result[0]?.program.id, highDiversity.id);
    assert.equal(result[0]?.score, DEFAULT_MERGE_DIVERSITY_WEIGHT);
  });

  test("reranks immediately when the balance crosses the quality-diversity tradeoff", () => {
    const qualityLeaning = computeMergeRecommendations(
      selected,
      candidates,
      new Set(),
      { diversityWeight: 0.4 },
    );
    const diversityLeaning = computeMergeRecommendations(
      selected,
      candidates,
      new Set(),
      { diversityWeight: 0.6 },
    );

    assert.equal(qualityLeaning[0]?.program.id, highQuality.id);
    assert.equal(diversityLeaning[0]?.program.id, highDiversity.id);
  });

  test("falls back to quality-only ranking when embeddings are unavailable", () => {
    const selectedWithoutEmbedding = makeProgram("selected-no-embedding", 5);
    const result = computeMergeRecommendations(
      selectedWithoutEmbedding,
      [makeProgram("low", 0), makeProgram("high", 10)],
      new Set(),
      { diversityWeight: 1 },
    );

    assert.equal(result[0]?.program.id, "high");
    assert.equal(result[0]?.cosineDistance, null);
    assert.equal(result[0]?.diversityScore, 0);
    assert.equal(result[0]?.score, result[0]?.qualityScore);
    assert.equal(result[0]?.usesEmbeddingDiversity, false);
  });
});
