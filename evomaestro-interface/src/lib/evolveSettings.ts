import {
  DEFAULT_MERGE_DIVERSITY_WEIGHT,
  normalizeMergeDiversityWeight,
} from "@/utils/mergeRecommendationWeights";

export interface EvolveSettings {
  showErrorNodes: boolean;
  showTimeoutNodes: boolean;
  includeErrorInStats: boolean;
  includeTimeoutInStats: boolean;
  showCrossLinks: boolean;
  proportionalSectors: boolean;
  embeddingSource: "code" | "reasoning";
  colorMap: "blues" | "viridis";
  colorMidpoint: "median" | "average";
  dissimilarityThreshold: number;
  mergeDiversityWeight: number;
  unifyMutationTypes: boolean;
  showScoreChangeIndicator: boolean;
}

export const DEFAULT_SETTINGS: EvolveSettings = {
  showErrorNodes: true,
  showTimeoutNodes: true,
  includeErrorInStats: false,
  includeTimeoutInStats: false,
  showCrossLinks: true,
  proportionalSectors: false,
  embeddingSource: "code",
  colorMap: "blues",
  colorMidpoint: "median",
  dissimilarityThreshold: 0.01,
  mergeDiversityWeight: DEFAULT_MERGE_DIVERSITY_WEIGHT,
  unifyMutationTypes: true,
  showScoreChangeIndicator: true,
};

/** Restore only current preferences from browser storage. */
export function parseSettings(saved: string | null): EvolveSettings {
  if (!saved) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_SETTINGS;
    }
    const savedSettings = Object.fromEntries(
      Object.entries(parsed).filter(([key]) =>
        Object.hasOwn(DEFAULT_SETTINGS, key),
      ),
    ) as Partial<EvolveSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      mergeDiversityWeight: normalizeMergeDiversityWeight(
        savedSettings.mergeDiversityWeight,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
