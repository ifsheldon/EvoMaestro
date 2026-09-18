import { useMemo } from "react";
import type { Program } from "@/types";
import { getProgramScore, isCorrectProgram } from "@/utils/program";

export interface LegendData {
  patchTypes: string[];
  minScore: number;
  maxScore: number;
}

/**
 * Derive legend metadata (patch types and score range) from the
 * current program list.  The result is memoised on `programs`.
 */
export function useLegendData(programs: Program[]): LegendData {
  return useMemo(() => {
    const patchTypes = new Set<string>();
    const scoreValues: number[] = [];

    for (const p of programs) {
      if (p.metadata?.patch_type) patchTypes.add(p.metadata.patch_type);
      if (isCorrectProgram(p)) {
        const score = getProgramScore(p);
        if (typeof score === "number" && !Number.isNaN(score)) {
          scoreValues.push(score);
        }
      }
    }

    const minScore = scoreValues.length ? Math.min(...scoreValues) : 0;
    const maxScore = scoreValues.length ? Math.max(...scoreValues) : 1;

    return {
      patchTypes: Array.from(patchTypes),
      minScore,
      maxScore,
    };
  }, [programs]);
}
