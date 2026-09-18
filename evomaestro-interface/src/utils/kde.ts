import * as d3 from "d3";

/**
 * Epanechnikov kernel with given bandwidth.
 * Finite support (returns 0 when |v/bandwidth| > 1) for fast evaluation.
 */
export function epanechnikovKernel(bandwidth: number) {
  return (v: number): number => {
    const u = v / bandwidth;
    return Math.abs(u) <= 1 ? (0.75 * (1 - u * u)) / bandwidth : 0;
  };
}

/**
 * Kernel density estimation evaluated at the given thresholds.
 * Returns an array of [x, density] pairs.
 */
export function kernelDensityEstimator(
  kernel: (v: number) => number,
  thresholds: number[],
  data: number[],
): [number, number][] {
  return thresholds.map((t) => [t, d3.mean(data, (d) => kernel(t - d)) ?? 0]);
}

/**
 * Compute common statistics for score presets.
 */
export function computeScoreStats(scores: number[]) {
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = d3.mean(sorted) ?? 0;
  const median = d3.median(sorted) ?? 0;
  const p25 = d3.quantile(sorted, 0.25) ?? 0;
  const p75 = d3.quantile(sorted, 0.75) ?? 0;
  return { mean, median, p25, p75 };
}
