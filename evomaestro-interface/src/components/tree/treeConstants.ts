/**
 * treeConstants.ts — Shared layout tuning parameters and settings type.
 */

export const LAYOUT = {
  nodeHeight: 200,
  minNodeDistance: 56,
  wedgeInsetPadding: 0.08,
  simulationMode: "instant" as "instant" | "animated",
  simulationTicks: 300,
  forceRadialStrength: 1.0,
  forceCollideRadius: 28,
  forceSectorStrength: 0.6,
  forceRadialGravity: 0.2,
  showDashedArcs: true,

  // Proportional sector sizing
  minSectorWidth: 0.15, // rad (~8.6°) — floor for any real island
  maxSectorWidth: (170 * Math.PI) / 180, // rad (170°) — cap for any island
  twoIslandEmptyMin: Math.PI / 3, // rad (60°) — min empty sector when 2 islands

  // Angular collision resolution
  collisionMaxIterations: 20,

  // Node ring radii (px, relative to node center)
  globalBestRingRadius: 35,
  islandBestRingScale: 0.65, // multiplied by globalBestRingRadius
  interactionRingRadius: 24, // highlight, merge-selected, merge-modal

  // Ring animation
  ringAnimCycleMs: 2000,
  ringAnimScaleAmplitude: 0.1,

  // Generation ring arc inset (px, divided by arc radius for angular padding)
  generationRingArcInsetPx: 8,
};

export interface LayoutSettings {
  showErrorNodes: boolean;
  showTimeoutNodes: boolean;
  includeErrorInStats: boolean;
  includeTimeoutInStats: boolean;
  proportionalSectors: boolean;
  embeddingSource: "code" | "reasoning";
  colorMap: "blues" | "viridis";
  colorMidpoint: "median" | "average";
  dissimilarityThreshold: number;
}

/** Per-branch sector bounds computed by the layout engine. */
export interface SectorBounds {
  /** Starting angle in radians (measured from -π/2). */
  start: number;
  /** Angular width in radians. */
  width: number;
}
