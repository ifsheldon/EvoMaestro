/**
 * treeSimulation.ts — Physics-based radial layout using d3-force with custom forces.
 *
 * Custom forces:
 *   - forceSector: constrains nodes to their assigned sector wedge
 *   - forceParentGravity: pulls child nodes toward their parent's angular position
 *
 * Post-simulation processing:
 *   - Snap-to-ring: projects nodes onto their target depth ring
 *   - Angular collision resolution: spreads overlapping nodes within a ring
 *   - Topology-preserving reorder: sorts nodes by parent angle to avoid crossings
 */

import * as d3 from "d3";
import type { SectorBounds } from "./treeConstants";
import { LAYOUT } from "./treeConstants";
import type { NodeDatum } from "./treeProcessing";
import { ISLAND_ROOT_ID, VIRTUAL_ROOT_ID } from "./treeProcessing";

// ── Types ────────────────────────────────────────────────────────────────

type SimNode = d3.SimulationNodeDatum & {
  nodeId: string;
  depth: number;
  targetRadius: number;
  sectorMin: number;
  sectorMax: number;
  parentNodeId: string | null;
};

// ── Custom forces ────────────────────────────────────────────────────────

function forceSector(strength: number, center: { x: number; y: number }) {
  let ns: SimNode[] = [];
  const force = (alpha: number) => {
    for (const sn of ns) {
      if (sn.fx !== undefined || sn.x === undefined || sn.y === undefined)
        continue;
      const dx = sn.x - center.x;
      const dy = sn.y - center.y;
      const angle = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy);
      if (r < 1) continue;

      const sectorCenter = (sn.sectorMin + sn.sectorMax) / 2;
      const halfWidth = (sn.sectorMax - sn.sectorMin) / 2;
      let diff = angle - sectorCenter;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;

      let correction = 0;
      if (diff < -halfWidth) correction = -halfWidth - diff;
      else if (diff > halfWidth) correction = halfWidth - diff;

      if (correction !== 0) {
        const f = correction * strength * alpha;
        sn.vx = (sn.vx ?? 0) + -Math.sin(angle) * f * r;
        sn.vy = (sn.vy ?? 0) + Math.cos(angle) * f * r;
      }
    }
  };
  force.initialize = (nodes: SimNode[]) => {
    ns = nodes;
  };
  return force;
}

function forceParentGravity(
  strength: number,
  center: { x: number; y: number },
  simNodeById: Map<string, SimNode>,
  nodeBranchIndexMap: Map<string, number>,
) {
  let ns: SimNode[] = [];
  const force = (alpha: number) => {
    for (const sn of ns) {
      if (sn.fx !== undefined || sn.x === undefined || sn.y === undefined)
        continue;
      if (!sn.parentNodeId) continue;
      const parent = simNodeById.get(sn.parentNodeId);
      if (!parent || parent.x === undefined || parent.y === undefined) continue;

      // Skip parent gravity when child and parent are on different islands —
      // the cross-island pull fights the sector force and makes the layout messy.
      const childIsland = nodeBranchIndexMap.get(sn.nodeId);
      const parentIsland = nodeBranchIndexMap.get(sn.parentNodeId);
      if (
        childIsland !== undefined &&
        parentIsland !== undefined &&
        childIsland !== parentIsland
      )
        continue;

      const childAngle = Math.atan2(sn.y - center.y, sn.x - center.x);
      const parentAngle = Math.atan2(parent.y - center.y, parent.x - center.x);

      let angleDiff = parentAngle - childAngle;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const r = Math.hypot(sn.x - center.x, sn.y - center.y);
      if (r < 1) continue;

      const f = angleDiff * strength * alpha;
      sn.vx = (sn.vx ?? 0) + -Math.sin(childAngle) * f * r;
      sn.vy = (sn.vy ?? 0) + Math.cos(childAngle) * f * r;
    }
  };
  force.initialize = (nodes: SimNode[]) => {
    ns = nodes;
  };
  return force;
}

// ── Post-simulation: snap to rings + angular collision + topology reorder ─

function snapToRings(simNodes: SimNode[], center: { x: number; y: number }) {
  for (const sn of simNodes) {
    if (sn.fx !== undefined) continue;
    if (sn.x === undefined || sn.y === undefined) continue;
    const dx = sn.x - center.x;
    const dy = sn.y - center.y;
    const r = Math.hypot(dx, dy);
    if (r > 0) {
      sn.x = center.x + (dx / r) * sn.targetRadius;
      sn.y = center.y + (dy / r) * sn.targetRadius;
    }
  }
}

function resolveAngularCollisions(
  simNodes: SimNode[],
  center: { x: number; y: number },
) {
  const sectorRingMap = new Map<string, SimNode[]>();
  for (const sn of simNodes) {
    if (sn.x === undefined || sn.y === undefined) continue;
    const key = `${sn.sectorMin.toFixed(4)}_${sn.depth}`;
    const bucket = sectorRingMap.get(key) ?? [];
    bucket.push(sn);
    sectorRingMap.set(key, bucket);
  }

  const minNodeDist = LAYOUT.minNodeDistance;

  for (const [, ringNodes] of sectorRingMap) {
    if (ringNodes.length < 2) continue;
    const radius = ringNodes[0].targetRadius;
    if (radius < minNodeDist / 2) continue;

    const minDelta = 2 * Math.asin(minNodeDist / (2 * radius));
    if (!Number.isFinite(minDelta) || minDelta <= 0) continue;

    const sectorCenter = (ringNodes[0].sectorMin + ringNodes[0].sectorMax) / 2;
    const halfWidth = (ringNodes[0].sectorMax - ringNodes[0].sectorMin) / 2;

    const entries = ringNodes.map((sn) => {
      const raw = Math.atan2((sn.y ?? 0) - center.y, (sn.x ?? 0) - center.x);
      let off = raw - sectorCenter;
      if (off > Math.PI) off -= Math.PI * 2;
      if (off < -Math.PI) off += Math.PI * 2;
      return { sn, offset: off };
    });
    entries.sort((a, b) => a.offset - b.offset);

    for (let iter = 0; iter < LAYOUT.collisionMaxIterations; iter++) {
      let moved = false;
      for (let i = 0; i < entries.length - 1; i++) {
        const cur = entries[i];
        const nxt = entries[i + 1];
        const diff = nxt.offset - cur.offset;
        if (diff < minDelta) {
          const overlap = minDelta - diff;
          if (cur.sn.fx === undefined) cur.offset -= overlap / 2;
          if (nxt.sn.fx === undefined) nxt.offset += overlap / 2;
          moved = true;
        }
      }
      if (!moved) break;
      entries.sort((a, b) => a.offset - b.offset);
    }

    for (const e of entries) {
      const clamped = Math.min(halfWidth, Math.max(-halfWidth, e.offset));
      const finalAngle = sectorCenter + clamped;
      e.sn.x = center.x + Math.cos(finalAngle) * radius;
      e.sn.y = center.y + Math.sin(finalAngle) * radius;
    }
  }

  return sectorRingMap;
}

function topologyPreservingReorder(
  sectorRingMap: Map<string, SimNode[]>,
  center: { x: number; y: number },
  simNodeById: Map<string, SimNode>,
) {
  for (const [, ringNodes] of sectorRingMap) {
    if (ringNodes.length < 2) continue;
    const radius = ringNodes[0].targetRadius;
    if (radius <= 0) continue;

    const sectorCenter = (ringNodes[0].sectorMin + ringNodes[0].sectorMax) / 2;

    const angleOf = (sn: SimNode) => {
      let off =
        Math.atan2((sn.y ?? 0) - center.y, (sn.x ?? 0) - center.x) -
        sectorCenter;
      if (off > Math.PI) off -= Math.PI * 2;
      if (off < -Math.PI) off += Math.PI * 2;
      return off;
    };

    const slots = ringNodes.map(angleOf).sort((a, b) => a - b);

    const parentAngleCache = new Map<string, number>();
    const getParentAngle = (sn: SimNode) => {
      if (!sn.parentNodeId) return 0;
      const cached = parentAngleCache.get(sn.parentNodeId);
      if (cached !== undefined) return cached;
      const p = simNodeById.get(sn.parentNodeId);
      if (!p || p.x === undefined || p.y === undefined) return 0;
      let off = Math.atan2(p.y - center.y, p.x - center.x) - sectorCenter;
      if (off > Math.PI) off -= Math.PI * 2;
      if (off < -Math.PI) off += Math.PI * 2;
      parentAngleCache.set(sn.parentNodeId, off);
      return off;
    };

    const sorted = [...ringNodes].sort((a, b) => {
      const pa = getParentAngle(a);
      const pb = getParentAngle(b);
      if (Math.abs(pa - pb) > 1e-9) return pa - pb;
      return angleOf(a) - angleOf(b);
    });

    for (let i = 0; i < sorted.length; i++) {
      const sn = sorted[i];
      if (sn.fx !== undefined) continue;
      const finalAngle = sectorCenter + slots[i];
      sn.x = center.x + Math.cos(finalAngle) * radius;
      sn.y = center.y + Math.sin(finalAngle) * radius;
    }
  }
}

// ── Main simulation entry point ──────────────────────────────────────────

export function runPhysicsSimulation(
  nodes: NodeDatum[],
  center: { x: number; y: number },
  branchRoots: NodeDatum[],
  sectorBounds: Map<number, SectorBounds>,
  prevPositions: Map<string, { x: number; y: number }>,
  filterSettingsChanged: boolean,
  getIslandIdxForNodeId?: (nodeId: string) => number | null | undefined,
): void {
  const nodeHeight = LAYOUT.nodeHeight;
  const wedgeInsetPadding = LAYOUT.wedgeInsetPadding;

  const nodeById = new Map(nodes.map((n) => [n.data.id, n]));

  // Build branch index map: nodeId → sectorIndex (= island_idx)
  // Use each node's own island_idx so cross-island children go to their actual island's sector.
  const nodeBranchIndexMap = new Map<string, number>();
  if (getIslandIdxForNodeId) {
    for (const node of nodes) {
      if (node.data.id === ISLAND_ROOT_ID || node.data.id === VIRTUAL_ROOT_ID)
        continue;
      const islandIdx = getIslandIdxForNodeId(node.data.id);
      if (islandIdx != null) {
        nodeBranchIndexMap.set(node.data.id, islandIdx);
      }
    }
  } else {
    branchRoots.forEach((branchRoot) => {
      const sectorIdx = branchRoot.data.island_idx ?? 0;
      for (const d of branchRoot.descendants()) {
        if (d.data.id !== ISLAND_ROOT_ID) {
          nodeBranchIndexMap.set(d.data.id, sectorIdx);
        }
      }
    });
  }

  // Compute depth relative to branch root
  const nodeDepthMap = new Map<string, number>();
  branchRoots.forEach((branchRoot) => {
    const walk = (node: NodeDatum, depth: number) => {
      nodeDepthMap.set(node.data.id, depth);
      if (node.children) {
        for (const ch of node.children) walk(ch, depth + 1);
      }
    };
    walk(branchRoot, 0);
  });

  const simNodes: SimNode[] = [];
  const simNodeById = new Map<string, SimNode>();

  for (const node of nodes) {
    if (node.data.id === ISLAND_ROOT_ID || node.data.id === VIRTUAL_ROOT_ID)
      continue;

    const branchIdx = nodeBranchIndexMap.get(node.data.id);
    if (branchIdx === undefined) continue;

    const bounds = sectorBounds.get(branchIdx);
    if (!bounds) continue;

    const depth = nodeDepthMap.get(node.data.id) ?? 0;
    const targetRadius = (depth + 1) * nodeHeight;
    const sectorMin = bounds.start + wedgeInsetPadding;
    const sectorMax = bounds.start + bounds.width - wedgeInsetPadding;
    const centerlineAngle = bounds.start + bounds.width / 2;

    const prev = prevPositions.get(node.data.id);
    const isNewNode = !prev;
    let initX: number;
    let initY: number;

    if (prev) {
      initX = prev.x;
      initY = prev.y;
    } else {
      const parentPos = prevPositions.get(node.data._parentId ?? "");
      if (parentPos) {
        const pAngle = Math.atan2(
          parentPos.y - center.y,
          parentPos.x - center.x,
        );
        initX = center.x + Math.cos(pAngle) * targetRadius;
        initY = center.y + Math.sin(pAngle) * targetRadius;
      } else {
        initX = center.x + Math.cos(centerlineAngle) * targetRadius;
        initY = center.y + Math.sin(centerlineAngle) * targetRadius;
      }
    }

    const sn: SimNode = {
      nodeId: node.data.id,
      depth,
      targetRadius,
      sectorMin,
      sectorMax,
      parentNodeId: node.data._parentId,
      x: initX,
      y: initY,
    };

    if (depth === 0) {
      sn.fx = center.x + Math.cos(centerlineAngle) * targetRadius;
      sn.fy = center.y + Math.sin(centerlineAngle) * targetRadius;
    } else if (!isNewNode && !filterSettingsChanged) {
      sn.fx = initX;
      sn.fy = initY;
    }

    simNodes.push(sn);
    simNodeById.set(node.data.id, sn);
  }

  // Run simulation
  const simulation = d3
    .forceSimulation<SimNode>(simNodes)
    .force(
      "radial",
      d3
        .forceRadial<SimNode>((d) => d.targetRadius, center.x, center.y)
        .strength(LAYOUT.forceRadialStrength),
    )
    .force("collide", d3.forceCollide<SimNode>(LAYOUT.forceCollideRadius))
    .force("sector", forceSector(LAYOUT.forceSectorStrength, center))
    .force(
      "gravity",
      forceParentGravity(
        LAYOUT.forceRadialGravity,
        center,
        simNodeById,
        nodeBranchIndexMap,
      ),
    )
    .stop();

  if (LAYOUT.simulationMode === "instant") {
    simulation.tick(LAYOUT.simulationTicks);
  }

  // Release temporary pins
  for (const sn of simNodes) {
    if (sn.depth > 0 && sn.fx != null) {
      sn.x = sn.fx;
      sn.y = sn.fy ?? sn.y;
      sn.fx = undefined;
      sn.fy = undefined;
    }
  }

  // Post-simulation: snap, resolve collisions, reorder
  snapToRings(simNodes, center);
  const sectorRingMap = resolveAngularCollisions(simNodes, center);
  topologyPreservingReorder(sectorRingMap, center, simNodeById);

  // Write simulation results back to hierarchy nodes
  for (const sn of simNodes) {
    const hierNode = nodeById.get(sn.nodeId);
    if (hierNode) {
      hierNode.x = sn.x ?? hierNode.x;
      hierNode.y = sn.y ?? hierNode.y;
    }
  }
}
