export const DEFAULT_MERGE_DIVERSITY_WEIGHT = 0.6;
export const MIN_MERGE_DIVERSITY_WEIGHT = 0;
export const MAX_MERGE_DIVERSITY_WEIGHT = 1;
export const MERGE_DIVERSITY_WEIGHT_STEP = 0.05;

export interface MergeRecommendationWeights {
  diversity: number;
  quality: number;
}

export function normalizeMergeDiversityWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MERGE_DIVERSITY_WEIGHT;
  }
  return Math.min(
    MAX_MERGE_DIVERSITY_WEIGHT,
    Math.max(MIN_MERGE_DIVERSITY_WEIGHT, value),
  );
}

export function resolveMergeRecommendationWeights(
  diversityWeight: unknown,
): MergeRecommendationWeights {
  const diversity = normalizeMergeDiversityWeight(diversityWeight);
  return { diversity, quality: 1 - diversity };
}
