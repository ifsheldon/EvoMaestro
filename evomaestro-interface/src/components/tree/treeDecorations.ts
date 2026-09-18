/**
 * treeDecorations.ts — Renders decorative SVG elements that are
 * rebuilt each render (not keyed/persistent like nodes and links).
 *
 * Includes: branch dividers, generation rings, best-branch gradient,
 * cross-links, chord links (top-K and island), ring sections.
 */

import * as d3 from "d3";
import { translateUi as t } from "@/i18n";
import {
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import type {
  ChordLinkDatum,
  CrossLinkDatum,
  LayoutResult,
  NodeDatum,
  SectorBounds,
} from "./treeLayoutEngine";
import { ISLAND_ROOT_ID, LAYOUT } from "./treeLayoutEngine";

// ── Sector lookup helpers ───────────────────────────────────────────────

/** Normalize an angle to [0, 2π). */
function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

/**
 * Find which sector index a given angle falls into, using variable-width
 * sector bounds.  Returns the branch index, or -1 if no sector matches.
 */
function findSectorIndex(
  angle: number,
  sectorBounds: Map<number, SectorBounds>,
): number {
  const na = normalizeAngle(angle);
  for (const [idx, bounds] of sectorBounds) {
    const start = normalizeAngle(bounds.start);
    const end = normalizeAngle(bounds.start + bounds.width);
    if (start < end) {
      if (na >= start && na < end) return idx;
    } else {
      // Sector wraps around 0/2π
      if (na >= start || na < end) return idx;
    }
  }
  return -1;
}

// ── Remove previous decorations ─────────────────────────────────────────

export function clearDecorations(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
): void {
  g.selectAll("g.branch-dividers").remove();
  g.selectAll("g.generation-rings").remove();
  g.selectAll("g.cross-links").remove();
  g.selectAll("g.node-ring-sections").remove();
  g.selectAll("g.topk-chord-links").remove();
  g.selectAll("g.topk-chord-labels").remove();
  g.selectAll("g.island-chord-links").remove();
  g.selectAll("g.island-chord-labels").remove();
  g.selectAll("path.best-branch-area").remove();
  g.selectAll("defs").remove();
  // Remove any orphaned ring-sector tooltips appended to document.body
  d3.selectAll(".ring-sector-tooltip").remove();
}

// ── Error node clip path ─────────────────────────────────────────────────

export function ensureClipPath(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
): void {
  g.append("defs")
    .append("clipPath")
    .attr("id", "error-node-clip")
    .append("circle")
    .attr("r", 12)
    .attr("cx", 0)
    .attr("cy", 0);
}

// ── Best-branch gradient area ────────────────────────────────────────────

export function renderBestBranchArea(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
): void {
  if (!layout.center || layout.branchNodes.length === 0) return;

  const { center, nodes, sectorBounds, bestNode } = layout;

  // Find best program among scored nodes (for guide purposes)
  const bestProgramForGuides = bestNode
    ? layout.nodeById.get(bestNode.id)
    : undefined;

  if (!bestProgramForGuides || bestProgramForGuides.data.generation === 0)
    return;

  const toArcAngle = (angle: number) => angle + Math.PI / 2;

  const bestAngle = Math.atan2(
    bestProgramForGuides.y - center.y,
    bestProgramForGuides.x - center.x,
  );
  const areaIndex = findSectorIndex(bestAngle, sectorBounds);
  const areaBounds = sectorBounds.get(areaIndex);
  if (!areaBounds) return;
  const areaStart = areaBounds.start;
  const areaEnd = areaBounds.start + areaBounds.width;

  const bestNodeRadius = Math.hypot(
    bestProgramForGuides.x - center.x,
    bestProgramForGuides.y - center.y,
  );

  const sectorOuterRadius = nodes.reduce((maxR, node) => {
    if (
      node.data.id === ISLAND_ROOT_ID ||
      (!node.data._parentId && node.data.generation === 0)
    )
      return maxR;
    const na = Math.atan2(node.y - center.y, node.x - center.x);
    if (findSectorIndex(na, sectorBounds) !== areaIndex) return maxR;
    return Math.max(maxR, Math.hypot(node.x - center.x, node.y - center.y));
  }, bestNodeRadius);

  const shadeOuterR = sectorOuterRadius;
  const fadeStart =
    shadeOuterR > 0 ? Math.min(1, bestNodeRadius / shadeOuterR) : 1;

  const gradientId = "best-branch-fade";
  const bestDefs = g.append("defs");
  const gradient = bestDefs
    .append("radialGradient")
    .attr("id", gradientId)
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", shadeOuterR);
  gradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#fff9db")
    .attr("stop-opacity", 0.35);
  gradient
    .append("stop")
    .attr("offset", `${fadeStart * 100}%`)
    .attr("stop-color", "#fff9db")
    .attr("stop-opacity", 0.35);
  gradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#fff9db")
    .attr("stop-opacity", 0);

  const areaPath = d3
    .arc<null>()
    .innerRadius(0)
    .outerRadius(shadeOuterR)
    .startAngle(toArcAngle(areaStart))
    .endAngle(toArcAngle(areaEnd))(null);

  if (areaPath) {
    g.append("path")
      .attr("class", "best-branch-area")
      .attr("transform", `translate(${center.x},${center.y})`)
      .attr("d", areaPath)
      .attr("fill", `url(#${gradientId})`)
      .attr("pointer-events", "none");
  }
}

// ── Branch dividers ──────────────────────────────────────────────────────

export function renderDividers(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
): void {
  if (!layout.center || layout.branchNodes.length === 0) return;

  const { center, nodes, sectorBounds } = layout;

  // Collect divider angles only at boundaries of occupied sectors
  const dividerAngles: number[] = [];
  const sortedBounds = [...sectorBounds.entries()]
    .filter(([idx]) => layout.occupiedSectors.has(idx))
    .sort((a, b) => a[1].start - b[1].start);
  for (const [, bounds] of sortedBounds) {
    dividerAngles.push(bounds.start);
  }
  // Close the last occupied sector's trailing edge
  if (sortedBounds.length > 0) {
    const last = sortedBounds[sortedBounds.length - 1][1];
    dividerAngles.push(last.start + last.width);
  }

  const farthestRadius = d3.max(nodes, (node) =>
    Math.hypot(node.x - center.x, node.y - center.y),
  );
  const radius = farthestRadius ?? 0;

  g.append("g")
    .attr("class", "branch-dividers")
    .selectAll("line")
    .data(dividerAngles)
    .join("line")
    .attr("x1", center.x)
    .attr("y1", center.y)
    .attr("x2", (angle) => center.x + Math.cos(angle) * radius)
    .attr("y2", (angle) => center.y + Math.sin(angle) * radius)
    .attr("stroke", "#555555")
    .attr("stroke-width", 3)
    .attr("stroke-opacity", 0.25)
    .attr("pointer-events", "none");
}

// ── Generation rings ─────────────────────────────────────────────────────

export function renderGenerationRings(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
): void {
  if (!layout.center || layout.branchNodes.length === 0) return;
  if (!LAYOUT.showDashedArcs) return;

  const { center, nodes, sectorBounds, bestNode } = layout;
  const nodeHeight = LAYOUT.nodeHeight;

  const toArcAngle = (angle: number) => angle + Math.PI / 2;

  // Classify each node into its sector and collect radii per sector
  const nodesBySectorRadii = new Map<number, Set<number>>();
  for (const idx of sectorBounds.keys()) {
    nodesBySectorRadii.set(idx, new Set<number>());
  }

  nodes.forEach((node) => {
    if (node.data.id === ISLAND_ROOT_ID) return;
    const dx = node.x - center.x;
    const dy = node.y - center.y;
    const radius = Math.hypot(dx, dy);
    if (!Number.isFinite(radius) || radius <= 0) return;

    const angle = Math.atan2(dy, dx);
    const sectorIndex = findSectorIndex(angle, sectorBounds);
    if (sectorIndex < 0) return;
    const snappedRadius = Math.round(radius / nodeHeight) * nodeHeight;
    if (snappedRadius > 0) {
      nodesBySectorRadii.get(sectorIndex)?.add(snappedRadius);
    }
  });

  const bestNodeForGuides = bestNode
    ? layout.nodeById.get(bestNode.id)
    : undefined;
  const bestNodeRadius = bestNodeForGuides
    ? Math.hypot(bestNodeForGuides.x - center.x, bestNodeForGuides.y - center.y)
    : null;
  const bestRingRadius =
    bestNodeRadius && bestNodeRadius > 0
      ? Math.round(bestNodeRadius / nodeHeight) * nodeHeight
      : null;
  const bestSectorIndex = bestNodeForGuides
    ? findSectorIndex(
        Math.atan2(
          bestNodeForGuides.y - center.y,
          bestNodeForGuides.x - center.x,
        ),
        sectorBounds,
      )
    : null;

  type SectorRingArc = {
    radius: number;
    startAngle: number;
    endAngle: number;
    isBestRing: boolean;
  };

  const sectorRingArcs: SectorRingArc[] = [];
  for (const [sectorIndex, bounds] of sectorBounds) {
    const sectorRadii = Array.from(nodesBySectorRadii.get(sectorIndex) ?? [])
      .filter((radius) => Number.isFinite(radius) && radius > 0)
      .sort((a, b) => a - b);
    if (sectorRadii.length === 0) continue;

    for (const radius of sectorRadii) {
      const padding = LAYOUT.generationRingArcInsetPx / radius;
      sectorRingArcs.push({
        radius,
        startAngle: bounds.start + padding,
        endAngle: bounds.start + bounds.width - padding,
        isBestRing:
          bestRingRadius !== null &&
          Math.abs(radius - bestRingRadius) < 1 &&
          bestSectorIndex === sectorIndex,
      });
    }
  }

  const ringArcPath = d3
    .arc<SectorRingArc>()
    .innerRadius((d) => d.radius)
    .outerRadius((d) => d.radius)
    .startAngle((d) => toArcAngle(d.startAngle))
    .endAngle((d) => toArcAngle(d.endAngle));

  g.append("g")
    .attr("class", "generation-rings")
    .attr("transform", `translate(${center.x},${center.y})`)
    .selectAll("path")
    .data(sectorRingArcs)
    .join("path")
    .attr("d", (d) => ringArcPath(d))
    .attr("fill", "none")
    .attr("stroke", (d) => (d.isBestRing ? "#facc15" : "#fecaca"))
    .attr("stroke-width", (d) => (d.isBestRing ? 2 : 1))
    .attr("stroke-dasharray", "3,3")
    .attr("stroke-opacity", (d) => (d.isBestRing ? 0.95 : 0.55))
    .attr("pointer-events", "none");
}

// ── Cross-links ──────────────────────────────────────────────────────────

export function renderCrossLinks(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
  showCrossLinks: boolean,
): void {
  if (layout.crossLinks.length === 0) return;

  const crossCx = layout.centerNode?.x ?? 0;
  const crossCy = layout.centerNode?.y ?? 0;

  const buildCrossLinkPath = (d: CrossLinkDatum) => {
    const sourceX = d.source.x;
    const sourceY = d.source.y;
    const targetX = d.target.x;
    const targetY = d.target.y;

    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;

    const srcAngle = Math.atan2(sourceY - crossCy, sourceX - crossCx);
    const tgtAngle = Math.atan2(targetY - crossCy, targetX - crossCx);
    let angDiff = Math.abs(tgtAngle - srcAngle);
    if (angDiff > Math.PI) angDiff = Math.PI * 2 - angDiff;
    const centerPull = 0.45 * (angDiff / Math.PI);

    const controlX = midX * (1 - centerPull) + crossCx * centerPull;
    const controlY = midY * (1 - centerPull) + crossCy * centerPull;

    return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;
  };

  g.append("g")
    .attr("class", "cross-links")
    .selectAll("path")
    .data(layout.crossLinks)
    .join("path")
    .attr("d", (d) => buildCrossLinkPath(d))
    .attr("fill", "none")
    .attr("stroke", "#60a5fa")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "8,4")
    .attr("stroke-opacity", showCrossLinks ? 0.5 : 0)
    .attr("pointer-events", "none");
}

// ── Chord links (Top-K) ──────────────────────────────────────────────────

export function renderTopKChords(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
): void {
  if (!layout.center || layout.topKChordLinks.length === 0) return;

  const { center, topKChordLinks } = layout;
  const minDissimilarity =
    d3.min(topKChordLinks, (link) => link.dissimilarity) ?? 0;
  const maxDissimilarity =
    d3.max(topKChordLinks, (link) => link.dissimilarity) ?? 1;
  const normalizeDissimilarity = (value: number) => {
    if (maxDissimilarity === minDissimilarity) return 0.5;
    return Math.max(
      0,
      Math.min(
        1,
        (value - minDissimilarity) / (maxDissimilarity - minDissimilarity),
      ),
    );
  };

  const getControlPoint = (source: NodeDatum, target: NodeDatum) => ({
    x: ((source.x + target.x) / 2) * 0.55 + center.x * 0.45,
    y: ((source.y + target.y) / 2) * 0.55 + center.y * 0.45,
  });

  const buildPath = (d: ChordLinkDatum) => {
    const cp = getControlPoint(d.source, d.target);
    return `M ${d.source.x} ${d.source.y} Q ${cp.x} ${cp.y} ${d.target.x} ${d.target.y}`;
  };

  const getLabelPos = (d: ChordLinkDatum) => {
    const cp = getControlPoint(d.source, d.target);
    return {
      x: 0.25 * d.source.x + 0.5 * cp.x + 0.25 * d.target.x,
      y: 0.25 * d.source.y + 0.5 * cp.y + 0.25 * d.target.y,
    };
  };

  g.append("g")
    .attr("class", "topk-chord-links")
    .selectAll("path")
    .data(topKChordLinks)
    .join("path")
    .attr("d", (d) => buildPath(d))
    .attr("fill", "none")
    .attr("stroke", "#676767")
    .attr(
      "stroke-width",
      (d) => 1.5 + normalizeDissimilarity(d.dissimilarity) * 0.2,
    )
    .attr("stroke-opacity", 0)
    .attr("pointer-events", "none");

  g.append("g")
    .attr("class", "topk-chord-labels")
    .selectAll("text")
    .data(topKChordLinks)
    .join("text")
    .attr("x", (d) => getLabelPos(d).x)
    .attr("y", (d) => getLabelPos(d).y)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-weight", "600")
    .style("fill", "#111827")
    .style("stroke", "white")
    .style("stroke-width", "3px")
    .style("paint-order", "stroke")
    .style("opacity", 0)
    .style("pointer-events", "none")
    .text((d) => d.dissimilarity.toFixed(3));
}

// ── Chord links (Island best) ────────────────────────────────────────────

export function renderIslandChords(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
): void {
  if (!layout.center || layout.islandChordLinks.length === 0) return;

  const { center, islandChordLinks } = layout;
  const dissimilarityColorScale = d3
    .scaleLinear<string>()
    .domain([0, 2])
    .range(["#fef2f2", "#b91c1c"])
    .clamp(true);

  const getControlPoint = (source: NodeDatum, target: NodeDatum) => ({
    x: ((source.x + target.x) / 2) * 0.55 + center.x * 0.45,
    y: ((source.y + target.y) / 2) * 0.55 + center.y * 0.45,
  });

  const buildPath = (d: ChordLinkDatum) => {
    const cp = getControlPoint(d.source, d.target);
    return `M ${d.source.x} ${d.source.y} Q ${cp.x} ${cp.y} ${d.target.x} ${d.target.y}`;
  };

  const getLabelPos = (d: ChordLinkDatum) => {
    const cp = getControlPoint(d.source, d.target);
    return {
      x: 0.25 * d.source.x + 0.5 * cp.x + 0.25 * d.target.x,
      y: 0.25 * d.source.y + 0.5 * cp.y + 0.25 * d.target.y,
    };
  };

  g.append("g")
    .attr("class", "island-chord-links")
    .selectAll("path")
    .data(islandChordLinks)
    .join("path")
    .attr("d", (d) => buildPath(d))
    .attr("fill", "none")
    .attr("stroke", (d) => dissimilarityColorScale(d.dissimilarity))
    .attr("stroke-width", 2.2)
    .attr("stroke-opacity", 0.85)
    .attr("pointer-events", "none");

  const labelGroups = g
    .append("g")
    .attr("class", "island-chord-labels")
    .selectAll("g")
    .data(islandChordLinks)
    .join("g")
    .attr("transform", (d) => {
      const pos = getLabelPos(d);
      return `translate(${pos.x},${pos.y})`;
    })
    .style("opacity", 0.95)
    .style("pointer-events", "none");

  labelGroups
    .append("rect")
    .attr("x", -18)
    .attr("y", -8)
    .attr("width", 36)
    .attr("height", 16)
    .attr("rx", 8)
    .attr("ry", 8)
    .style("fill", "white")
    .style("stroke", "#000000")
    .style("stroke-width", 0.8);

  labelGroups
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-weight", "600")
    .style("fill", "#000000")
    .text((d) => d.dissimilarity.toFixed(3));
}

// ── Ring sections (average comparison) ────────────────────────────────────

export function renderRingSections(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
  includeErrorInStats: boolean,
  includeTimeoutInStats: boolean,
  setAverageComparisonTarget: (
    updater: (prev: string | null) => string | null,
  ) => void,
  setIslandFilterIslandIdx: (
    updater: (prev: number | null) => number | null,
  ) => void,
  onClearScoreThreshold?: () => void,
): void {
  if (!layout.center || layout.branchNodes.length === 0) return;

  const { center, nodes, sectorBounds, colorScale } = layout;
  const nodeHeight = LAYOUT.nodeHeight;
  const ringThickness = 12;
  const ringInsetPx = 25;
  const areaPaddingPx = 10;
  const groupSpanPaddingPx = 8;
  const toArcAngle = (angle: number) => angle + Math.PI / 2;

  type GroupedRingNode = { node: NodeDatum; angle: number };

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
      const angle = normalizeAngle(
        Math.atan2(node.y - center.y, node.x - center.x),
      );
      const sectorIndex = findSectorIndex(angle, sectorBounds);
      return { node, ringIndex, angle, sectorIndex };
    });

  ringNodes.forEach((entry) => {
    const key = groupKey(entry.sectorIndex, entry.ringIndex);
    const bucket = groupedNodes.get(key) ?? [];
    bucket.push({ node: entry.node, angle: entry.angle });
    groupedNodes.set(key, bucket);
  });

  type RingSegment = {
    id: string;
    startAngle: number;
    endAngle: number;
    innerRadius: number;
    outerRadius: number;
    fill: string;
    aboveRatio: number;
    averageScore: number;
  };

  const ringSegments: RingSegment[] = [];

  for (const [key, entries] of groupedNodes.entries()) {
    if (entries.length <= 1) continue;

    const [sectorIndexText, ringIndexText] = key.split(":");
    const sectorIndex = Number(sectorIndexText);
    const ringIndex = Number(ringIndexText);
    if (!Number.isFinite(sectorIndex) || !Number.isFinite(ringIndex)) continue;

    const ringRadius = ringIndex * nodeHeight;
    if (!Number.isFinite(ringRadius) || ringRadius <= 0) continue;

    const areaPaddingArc = areaPaddingPx / ringRadius;
    const spanPaddingArc = groupSpanPaddingPx / ringRadius;
    const bounds = sectorBounds.get(sectorIndex);
    if (!bounds) continue;
    const sectorStart = bounds.start;
    const sectorEnd = bounds.start + bounds.width;

    const relativeAngles = entries
      .map((entry) => normalizeAngle(entry.angle - sectorStart))
      .filter((value) => Number.isFinite(value));
    if (relativeAngles.length <= 1) continue;

    const minRelative = d3.min(relativeAngles);
    const maxRelative = d3.max(relativeAngles);
    if (minRelative === undefined || maxRelative === undefined) continue;

    const rawStart = sectorStart + minRelative - spanPaddingArc;
    const rawEnd = sectorStart + maxRelative + spanPaddingArc;
    const clampedStart = Math.max(rawStart, sectorStart + areaPaddingArc);
    const clampedEnd = Math.min(rawEnd, sectorEnd - areaPaddingArc);
    if (!Number.isFinite(clampedStart) || !Number.isFinite(clampedEnd))
      continue;
    if (clampedEnd - clampedStart <= 0.0001) continue;

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

    let aboveCount = 0;
    let belowCount = 0;
    statsEntries.forEach((entry) => {
      const score = getProgramScore(entry.node.data);
      if (score === null || !Number.isFinite(score)) return;
      if (score > averageScore) aboveCount += 1;
      else if (score < averageScore) belowCount += 1;
    });

    const comparedCount = aboveCount + belowCount;
    const aboveRatio = comparedCount > 0 ? aboveCount / comparedCount : 0.5;

    ringSegments.push({
      id: key,
      startAngle: clampedStart,
      endAngle: clampedEnd,
      innerRadius: Math.max(0, ringRadius - ringInsetPx - ringThickness),
      outerRadius: Math.max(0, ringRadius - ringInsetPx),
      fill: colorScale(averageScore),
      aboveRatio,
      averageScore,
    });
  }

  const ringArc = d3
    .arc<RingSegment>()
    .innerRadius((d) => d.innerRadius)
    .outerRadius((d) => d.outerRadius)
    .startAngle((d) => toArcAngle(d.startAngle))
    .endAngle((d) => toArcAngle(d.endAngle));

  g.append("g")
    .attr("class", "node-ring-sections")
    .attr("transform", `translate(${center.x},${center.y})`)
    .selectAll("path")
    .data(ringSegments)
    .join("path")
    .attr("d", (d) => ringArc(d))
    .attr("fill", (d) => d.fill)
    .attr("fill-opacity", 0.88)
    .attr("stroke", "none")
    .style("cursor", "pointer")
    .attr("pointer-events", "all")
    .on("click", (event, d) => {
      event.stopPropagation();
      setAverageComparisonTarget((prev) => {
        const n = prev === d.id ? null : d.id;
        if (n !== null) {
          setIslandFilterIslandIdx(() => null);
          onClearScoreThreshold?.();
        }
        return n;
      });
    })
    .on("mouseover", (event, d) => {
      d3.selectAll(".ring-sector-tooltip").remove();
      d3.select("body")
        .append("div")
        .attr("class", "node-tooltip ring-sector-tooltip")
        .style("opacity", 0)
        .html(
          `<strong>${t("treeTooltip.generationAverage")}:</strong> ${d.averageScore.toFixed(4)}`,
        )
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 10}px`)
        .transition()
        .duration(100)
        .style("opacity", 1);
    })
    .on("mousemove", (event) => {
      d3.selectAll(".ring-sector-tooltip")
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 10}px`);
    })
    .on("mouseout", () => {
      d3.selectAll(".ring-sector-tooltip").remove();
    });
}

// ── All decorations in one call ──────────────────────────────────────────

export function renderAllDecorations(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LayoutResult,
  showCrossLinks: boolean,
  includeErrorInStats: boolean,
  includeTimeoutInStats: boolean,
  setAverageComparisonTarget: (
    updater: (prev: string | null) => string | null,
  ) => void,
  setIslandFilterIslandIdx: (
    updater: (prev: number | null) => number | null,
  ) => void,
  onClearScoreThreshold?: () => void,
): void {
  clearDecorations(g);
  ensureClipPath(g);
  renderBestBranchArea(g, layout);
  renderDividers(g, layout);
  renderGenerationRings(g, layout);
  renderRingSections(
    g,
    layout,
    includeErrorInStats,
    includeTimeoutInStats,
    setAverageComparisonTarget,
    setIslandFilterIslandIdx,
    onClearScoreThreshold,
  );
  renderCrossLinks(g, layout, showCrossLinks);
  renderTopKChords(g, layout);
  renderIslandChords(g, layout);
}
