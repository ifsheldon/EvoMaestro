import type { EvolveSettings } from "@/lib/evolveSettings";
import type { Program } from "@/types";
import { getActiveEmbedding } from "@/utils/embeddingAccessors";
import { cosineSimilarity } from "@/utils/math";
import {
  DEFAULT_MERGE_DIVERSITY_WEIGHT,
  normalizeMergeDiversityWeight,
} from "@/utils/mergeRecommendationWeights";
import { getProgramScore, isCorrectProgram } from "@/utils/program";

export interface MergeRecommendation {
  program: Program;
  /** Combined ranking score in [0, 1], higher = better partner */
  score: number;
  /** Cosine distance from the selected program's embedding, or null if unavailable */
  cosineDistance: number | null;
  /** Normalized diversity score in [0, 1] */
  diversityScore: number;
  /** Normalized quality score in [0, 1] */
  qualityScore: number;
  /** Whether embedding diversity contributed to this recommendation run */
  usesEmbeddingDiversity: boolean;
}

export interface MergeRecommendationOptions {
  topN?: number;
  diversityWeight?: number;
  embeddingSource?: EvolveSettings["embeddingSource"];
}

function minMaxNormalize(values: number[]): number[] {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return values.map(() => 0);

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (max === min) {
    return values.map((value) => (Number.isFinite(value) ? 0.5 : 0));
  }
  return values.map((value) =>
    Number.isFinite(value) ? (value - min) / (max - min) : 0,
  );
}

/**
 * Compute the top-N merge partner recommendations for a selected program.
 *
 * Ranks candidates by a weighted combination of embedding diversity
 * (cosine distance) and quality (combined_score). Only correct programs
 * are considered. Falls back to score-only ranking when embeddings
 * are unavailable.
 */
export function computeMergeRecommendations(
  selected: Program,
  allPrograms: Program[],
  excludeIds: Set<string>,
  options: MergeRecommendationOptions = {},
): MergeRecommendation[] {
  const {
    topN = 5,
    diversityWeight = DEFAULT_MERGE_DIVERSITY_WEIGHT,
    embeddingSource = "code",
  } = options;
  const normalizedDiversityWeight =
    normalizeMergeDiversityWeight(diversityWeight);

  // Filter to correct programs, excluding selected and already-selected
  const candidates = allPrograms.filter(
    (p) => p.id !== selected.id && !excludeIds.has(p.id) && isCorrectProgram(p),
  );

  if (candidates.length === 0) return [];

  const selectedEmb = getActiveEmbedding(selected, embeddingSource);

  // Compute raw scores for each candidate
  const rawDiversities: (number | null)[] = candidates.map((c) => {
    const candEmb = getActiveEmbedding(c, embeddingSource);
    if (!selectedEmb || !candEmb) return null;
    const similarity = cosineSimilarity(selectedEmb, candEmb);
    return similarity === null ? null : 1 - similarity;
  });

  const rawQualities: number[] = candidates.map(
    (c) => getProgramScore(c) ?? -Infinity,
  );

  // Determine if we can use embedding-based ranking
  const validDiversities = rawDiversities.filter(
    (d): d is number => d !== null,
  );
  const useEmbeddings = validDiversities.length > 0;

  // Normalize
  const normQualities = minMaxNormalize(rawQualities);

  let normDiversities: number[];
  if (useEmbeddings) {
    // For candidates without embeddings, assign neutral midpoint before normalization
    const diversitiesForNorm = rawDiversities.map((d) =>
      d !== null ? d : 0.5,
    );
    normDiversities = minMaxNormalize(diversitiesForNorm);
  } else {
    normDiversities = candidates.map(() => 0);
  }

  // Apply bonuses and compute final scores
  const recommendations: MergeRecommendation[] = candidates.map((c, i) => {
    let diversity = normDiversities[i];
    let quality = normQualities[i];

    // Island diversity bonus
    if (
      selected.island_idx != null &&
      c.island_idx != null &&
      c.island_idx !== selected.island_idx
    ) {
      diversity = Math.min(1, diversity + 0.1);
    }

    // Archive member bonus
    if (c.in_archive) {
      quality = Math.min(1, quality + 0.05);
    }

    const effectiveDiversityWeight = useEmbeddings
      ? normalizedDiversityWeight
      : 0;
    const score =
      effectiveDiversityWeight * diversity +
      (1 - effectiveDiversityWeight) * quality;

    return {
      program: c,
      score,
      cosineDistance: rawDiversities[i],
      diversityScore: diversity,
      qualityScore: quality,
      usesEmbeddingDiversity: useEmbeddings,
    };
  });

  // Sort by descending score, return top N
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, topN);
}
