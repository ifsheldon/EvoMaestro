"use client";

import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useWorkspacePanelTab } from "@/contexts/WorkspacePanelTabContext";
import type { Program } from "@/types";
import { getErrorType, isTimeoutProgram } from "@/utils/program";
import { TreeLegend } from "../tree/TreeLegend";
import { renderAllDecorations } from "../tree/treeDecorations";
import {
  computeTreeLayout,
  ISLAND_ROOT_ID,
  type LayoutResult,
  VIRTUAL_ROOT_ID,
} from "../tree/treeLayoutEngine";
import { stopRingAnimationLoop } from "../tree/treeNodeRenderer";
import {
  type AnimationState,
  applyTransitions,
  applyZOrdering,
  ensureSvgGroups,
  type RenderCallbacks,
  renderBookmarks,
  renderLinks,
  renderNodes,
  setupCanvasHandlers,
  type VisualState,
} from "../tree/treeRenderer";
import type { TreeVisualizationProps } from "../tree/treeTypes";
import { isHumanOrigin } from "../tree/treeUtils";
import { useLegendData } from "../tree/useLegendData";
import { useTreeData } from "../tree/useTreeData";

export default function TreeVisualizationNew({
  programs,
  selectedProgramId,
  interactions,
  scoreThreshold,
  scoreHandlers,
  numIslands,
}: TreeVisualizationProps) {
  const {
    onSelectProgram,
    onDoubleClickProgram,
    onDeselect,
    onNodeContextMenu,
    onCanvasContextMenu,
    onReviewPriorityClick,
  } = interactions;
  const { onClearScoreThreshold, onSetScoreThreshold } = scoreHandlers ?? {};

  // ── Context & derived state ────────────────────────────────────────────
  const {
    state: shellState,
    toggleMergeSelect,
    highlightProgram,
  } = useEvolveShell();

  const mergeSelectedIds = useMemo(
    () => new Set(shellState.mergeSelection.map((p) => p.id)),
    [shellState.mergeSelection],
  );
  const recommendedIds = useMemo(
    () => new Set(shellState.recommendedPartnerIds),
    [shellState.recommendedPartnerIds],
  );
  const mergeModalIds = useMemo(
    () => new Set(shellState.mergeModalProgramIds),
    [shellState.mergeModalProgramIds],
  );

  // ── Refs ───────────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const treeData = useTreeData(programs);
  const lastLayoutProgramsRef = useRef<Program[] | null>(null);
  const lastLayoutRef = useRef<LayoutResult | null>(null);
  const prevHighlightedIdRef = useRef<string | null>(null);
  const transitionEndTimeRef = useRef<number>(0);
  const deferredRenderRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prevFilterSettingsRef = useRef({
    showErrorNodes: shellState.settings.showErrorNodes,
    showTimeoutNodes: shellState.settings.showTimeoutNodes,
    proportionalSectors: shellState.settings.proportionalSectors,
  });

  // ── Filter state ──────────────────────────────────────────────────────
  const [averageComparisonTarget, setAverageComparisonTarget] = useState<
    string | null
  >(null);
  const [islandFilterIslandIdx, setIslandFilterIslandIdx] = useState<
    number | null
  >(null);

  // Clear tree filters when distribution threshold is active
  useEffect(() => {
    if (scoreThreshold != null) {
      setAverageComparisonTarget(null);
      setIslandFilterIslandIdx(null);
    }
  }, [scoreThreshold]);

  const legendData = useLegendData(programs);

  // ── Dataset flags for legend visibility ─────────────────────────────
  const hasErrorNodes = useMemo(
    () => programs.some((p) => getErrorType(p) && !isTimeoutProgram(p)),
    [programs],
  );
  const hasTimeoutNodes = useMemo(
    () => programs.some((p) => isTimeoutProgram(p)),
    [programs],
  );
  const hasHumanNodes = useMemo(
    () => programs.some((p) => isHumanOrigin(p)),
    [programs],
  );

  // ── Average score state for legend ──────────────────────────────────
  const [avgScoreInfo, setAvgScoreInfo] = useState<{
    score: number;
    color: string;
  } | null>(null);

  // ── Effective stats flags ──────────────────────────────────────────────
  const includeErrorInStats =
    shellState.settings.showErrorNodes &&
    shellState.settings.includeErrorInStats;
  const includeTimeoutInStats =
    shellState.settings.showTimeoutNodes &&
    shellState.settings.includeTimeoutInStats;

  // ══════════════════════════════════════════════════════════════════════
  // MAIN RENDER EFFECT
  // ══════════════════════════════════════════════════════════════════════
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeData contains stable refs
  useEffect(() => {
    if (!programs.length || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);

    // ── Initialize zoom ──────────────────────────────────────────────
    if (!zoomRef.current) {
      zoomRef.current = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => {
          svg.select("g.main-container").attr("transform", event.transform);
          updateTourOverlays();
        });
      svg.call(zoomRef.current);
      svg.on("dblclick.zoom", null);
    }

    // ── Transition guard ─────────────────────────────────────────────
    const isDataChange = lastLayoutProgramsRef.current !== programs;
    const now = Date.now();
    if (!isDataChange && now < transitionEndTimeRef.current) {
      if (deferredRenderRef.current) clearTimeout(deferredRenderRef.current);
      const remaining = transitionEndTimeRef.current - now + 20;
      deferredRenderRef.current = setTimeout(() => {
        deferredRenderRef.current = null;
        transitionEndTimeRef.current = 0;
        setRenderTick((t) => t + 1);
      }, remaining);
      return;
    }
    if (deferredRenderRef.current) {
      clearTimeout(deferredRenderRef.current);
      deferredRenderRef.current = null;
    }

    // ── Determine incremental vs full reset ──────────────────────────
    const prevPositions = treeData.prevPositions.current;
    const isIncremental =
      prevPositions.size > 0 && !treeData.isFirstRender.current;
    const isFullReset = !isIncremental;

    // ── Compute or reuse layout ──────────────────────────────────────
    // Only track settings that affect the node set or physical layout.
    // Embedding source, color map, and dissimilarity threshold are
    // analytics-only — they should NOT trigger physics re-simulation.
    const filterSettingsChanged =
      prevFilterSettingsRef.current.showErrorNodes !==
        shellState.settings.showErrorNodes ||
      prevFilterSettingsRef.current.showTimeoutNodes !==
        shellState.settings.showTimeoutNodes ||
      prevFilterSettingsRef.current.proportionalSectors !==
        shellState.settings.proportionalSectors;
    prevFilterSettingsRef.current = {
      showErrorNodes: shellState.settings.showErrorNodes,
      showTimeoutNodes: shellState.settings.showTimeoutNodes,
      proportionalSectors: shellState.settings.proportionalSectors,
    };

    const layoutSettings = {
      showErrorNodes: shellState.settings.showErrorNodes,
      showTimeoutNodes: shellState.settings.showTimeoutNodes,
      includeErrorInStats,
      includeTimeoutInStats,
      proportionalSectors: shellState.settings.proportionalSectors,
      embeddingSource: shellState.settings.embeddingSource,
      colorMap: shellState.settings.colorMap,
      colorMidpoint: shellState.settings.colorMidpoint,
      dissimilarityThreshold: shellState.settings.dissimilarityThreshold,
    };

    let layout: LayoutResult | null;
    if (isDataChange || filterSettingsChanged || !lastLayoutRef.current) {
      layout = computeTreeLayout(
        programs,
        layoutSettings,
        prevPositions,
        treeData.isFirstRender.current,
        filterSettingsChanged,
        selectedProgramId,
        numIslands,
      );
      lastLayoutProgramsRef.current = programs;
      lastLayoutRef.current = layout;
    } else {
      // Visual-only change: reuse cached layout, update selected path
      layout = computeTreeLayout(
        programs,
        layoutSettings,
        prevPositions,
        treeData.isFirstRender.current,
        false,
        selectedProgramId,
        numIslands,
      );
      // Restore cached positions
      if (layout) {
        for (const node of layout.nodes) {
          const cached = prevPositions.get(node.data.id);
          if (cached) {
            node.x = cached.x;
            node.y = cached.y;
          }
        }
      }
      lastLayoutRef.current = layout;
    }

    if (!layout) return;

    // ── Update average score info for legend ──────────────────────────
    if (
      layout.averageAllNodeScore !== undefined &&
      Number.isFinite(layout.averageAllNodeScore)
    ) {
      const color = layout.colorScale(layout.averageAllNodeScore);
      setAvgScoreInfo({ score: layout.averageAllNodeScore, color });
    } else {
      setAvgScoreInfo(null);
    }

    // ── SVG groups ───────────────────────────────────────────────────
    const zoomTransform = d3.zoomTransform(svg.node() as Element);
    const groups = ensureSvgGroups(svg, isFullReset, zoomTransform);

    // ── Assemble visual state ────────────────────────────────────────
    const visualState: VisualState = {
      selectedProgramId,
      highlightedProgramId: shellState.highlightedProgramId,
      mergeSelectedIds,
      mergeModalIds,
      recommendedIds,
      markedNodeIds: new Set(shellState.markedNodeIds),
      bannedNodeIds: new Set(shellState.bannedNodeIds),
      nodeNotes: shellState.nodeNotes,
      scoreThreshold: scoreThreshold ?? null,
      averageComparisonTarget,
      islandFilterIslandIdx,
      showCrossLinks: shellState.settings.showCrossLinks,
      unifyMutationTypes: shellState.settings.unifyMutationTypes,
      showScoreChangeIndicator: shellState.settings.showScoreChangeIndicator,
    };

    const animState: AnimationState = {
      isIncremental,
      prevPositions,
    };

    const callbacks: RenderCallbacks = {
      programs,
      onSelectProgram,
      onDoubleClickProgram,
      onNodeContextMenu,
      onReviewPriorityClick,
      highlightProgram,
      toggleMergeSelect,
      setAverageComparisonTarget,
      setIslandFilterIslandIdx,
      onClearScoreThreshold,
      onDeselect,
      onCanvasContextMenu,
    };

    // ── Canvas handlers ──────────────────────────────────────────────
    setupCanvasHandlers(svg, callbacks);

    // ── Decorations (rebuilt each render) ─────────────────────────────
    renderAllDecorations(
      groups.g,
      layout,
      shellState.settings.showCrossLinks,
      includeErrorInStats,
      includeTimeoutInStats,
      setAverageComparisonTarget,
      setIslandFilterIslandIdx,
      onClearScoreThreshold,
    );

    // ── Links (keyed data join) ──────────────────────────────────────
    const linkSel = renderLinks(groups.linksG, layout, animState, visualState);

    // ── Nodes (nested data joins — NO clear-and-rebuild) ─────────────
    const { nodeSel } = renderNodes(
      groups.nodesG,
      layout,
      visualState,
      animState,
      callbacks,
    );

    // ── Bookmarks ────────────────────────────────────────────────────
    renderBookmarks(
      nodeSel,
      new Set(shellState.markedNodeIds),
      shellState.nodeNotes,
    );

    // ── Z-ordering ───────────────────────────────────────────────────
    applyZOrdering(groups.g, groups.linksG, groups.nodesG, selectedProgramId);

    // ── Transitions ──────────────────────────────────────────────────
    const animDuration = applyTransitions(nodeSel, linkSel, layout, animState);
    if (animDuration > 0) {
      transitionEndTimeRef.current = Date.now() + animDuration;
    }

    // ── Save positions ───────────────────────────────────────────────
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const n of layout.nodes) {
      newPositions.set(n.data.id, { x: n.x, y: n.y });
    }
    treeData.savePrevPositions(newPositions);

    // ── Initial viewport ─────────────────────────────────────────────
    if (treeData.isFirstRender.current) {
      const xExtent = d3.extent(layout.nodes, (d) => d.x) as [number, number];
      const yExtent = d3.extent(layout.nodes, (d) => d.y) as [number, number];
      const marginX = 200;
      const marginY = 200;
      const fullWidth = xExtent[1] - xExtent[0] + marginX * 2;
      const fullHeight = yExtent[1] - yExtent[0] + marginY * 2;
      const centerX = (xExtent[0] + xExtent[1]) / 2;
      const centerY = (yExtent[0] + yExtent[1]) / 2;
      const scale = Math.min(width / fullWidth, height / fullHeight, 1);
      const initialTransform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
      if (zoomRef.current) {
        svg.call(zoomRef.current.transform, initialTransform);
      }
      treeData.markRendered();
    }

    // ── Zoom to highlighted node ─────────────────────────────────────
    if (
      shellState.highlightedProgramId &&
      shellState.highlightedProgramId !== prevHighlightedIdRef.current
    ) {
      const targetNode = layout.nodes.find(
        (n) => n.data.id === shellState.highlightedProgramId,
      );
      if (targetNode && zoomRef.current) {
        const currentTransform = d3.zoomTransform(svg.node() as Element);
        const targetScale = Math.max(currentTransform.k, 1.2);
        const targetX = width / 2 - targetNode.x * targetScale;
        const targetY = height / 2 - targetNode.y * targetScale;
        const newTransform = d3.zoomIdentity
          .translate(targetX, targetY)
          .scale(targetScale);
        svg
          .transition()
          .duration(750)
          .call(zoomRef.current.transform, newTransform);
      }
    }
    prevHighlightedIdRef.current = shellState.highlightedProgramId;
  }, [
    programs,
    selectedProgramId,
    onSelectProgram,
    onDoubleClickProgram,
    onDeselect,
    onNodeContextMenu,
    onCanvasContextMenu,
    onReviewPriorityClick,
    scoreThreshold,
    mergeSelectedIds,
    mergeModalIds,
    recommendedIds,
    toggleMergeSelect,
    highlightProgram,
    shellState.highlightedProgramId,
    shellState.settings,
    shellState.markedNodeIds,
    shellState.nodeNotes,
    averageComparisonTarget,
    islandFilterIslandIdx,
    onClearScoreThreshold,
    includeErrorInStats,
    includeTimeoutInStats,
    renderTick,
  ]);

  // Clean up global side effects when this component unmounts
  useEffect(() => {
    return () => {
      stopRingAnimationLoop();
      // Remove any orphaned tooltips appended to document.body by D3 handlers
      for (const el of document.querySelectorAll(
        ".ring-sector-tooltip, .node-tooltip",
      )) {
        el.remove();
      }
    };
  }, []);

  // ── Focus-node zoom ────────────────────────────────────────────────
  const tabCtx = useWorkspacePanelTab();
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggers only on focusNodeId
  useEffect(() => {
    const nodeId = tabCtx?.focusNodeId;
    if (!nodeId || !svgRef.current || !zoomRef.current || !containerRef.current)
      return;
    const pos = treeData.prevPositions.current.get(nodeId);
    if (!pos) return;
    const svg = d3.select(svgRef.current);
    const { width, height } = containerRef.current.getBoundingClientRect();
    const scale = 1.2;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-pos.x, -pos.y);
    svg
      .transition()
      .duration(600)
      // biome-ignore lint/suspicious/noExplicitAny: d3 transition .call() type mismatch
      .call(zoomRef.current.transform as any, transform);
    tabCtx.clearFocusNode();
  }, [tabCtx?.focusNodeId]);

  // ── Average filter toggle handler ─────────────────────────────────
  const handleToggleAverageFilter = useMemo(() => {
    if (!onSetScoreThreshold || !avgScoreInfo) return undefined;
    return () => {
      // Toggle: if scoreThreshold matches the avg, clear it; otherwise set it
      if (scoreThreshold != null && scoreThreshold === avgScoreInfo.score) {
        onSetScoreThreshold(null);
      } else {
        onSetScoreThreshold(avgScoreInfo.score);
      }
    };
  }, [onSetScoreThreshold, avgScoreInfo, scoreThreshold]);

  const isAverageFilterActive =
    scoreThreshold != null &&
    avgScoreInfo != null &&
    scoreThreshold === avgScoreInfo.score;

  // ── Tour overlays for guided tour (HTML divs tracking SVG elements) ──
  const chordOverlayRef = useRef<HTMLDivElement>(null);
  const bestNodeOverlayRef = useRef<HTMLDivElement>(null);
  const crossoverOverlayRef = useRef<HTMLDivElement>(null);
  const islandRootOverlayRef = useRef<HTMLDivElement>(null);
  const ringArcOverlayRef = useRef<HTMLDivElement>(null);

  const updateTourOverlays = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;
    const containerRect = container.getBoundingClientRect();

    // Helper to position an overlay div over an SVG element
    const positionOverlay = (
      overlay: HTMLDivElement | null,
      selector: string,
      pad: number,
      requireChildren = false,
    ) => {
      if (!overlay) return;
      const el = svg.querySelector(selector);
      if (!el || (requireChildren && !el.children.length)) {
        overlay.style.display = "none";
        return;
      }
      const rect = el.getBoundingClientRect();
      overlay.style.display = "";
      overlay.style.left = `${rect.left - containerRect.left - pad}px`;
      overlay.style.top = `${rect.top - containerRect.top - pad}px`;
      overlay.style.width = `${rect.width + pad * 2}px`;
      overlay.style.height = `${rect.height + pad * 2}px`;
    };

    positionOverlay(chordOverlayRef.current, "g.island-chord-links", 20, true);
    positionOverlay(
      bestNodeOverlayRef.current,
      '[data-tour="global-best-node"]',
      24,
    );
  }, []);

  // Update overlays after each render tick
  // biome-ignore lint/correctness/useExhaustiveDependencies: needs renderTick to track re-renders
  useEffect(() => {
    updateTourOverlays();
  }, [renderTick, updateTourOverlays]);

  // ── Guided tour: fit-view event listener ────────────────────────
  useEffect(() => {
    const handleFitView = () => {
      const svg = svgRef.current;
      const container = containerRef.current;
      const layout = lastLayoutRef.current;
      if (!svg || !container || !zoomRef.current || !layout) return;

      const { width, height } = container.getBoundingClientRect();
      const xExtent = d3.extent(layout.nodes, (d) => d.x) as [number, number];
      const yExtent = d3.extent(layout.nodes, (d) => d.y) as [number, number];
      const marginX = 200;
      const marginY = 200;
      const fullWidth = xExtent[1] - xExtent[0] + marginX * 2;
      const fullHeight = yExtent[1] - yExtent[0] + marginY * 2;
      const centerX = (xExtent[0] + xExtent[1]) / 2;
      const centerY = (yExtent[0] + yExtent[1]) / 2;
      const scale = Math.min(width / fullWidth, height / fullHeight, 1);
      const fitTransform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
      d3.select(svg)
        .transition()
        .duration(750)
        .call(zoomRef.current.transform, fitTransform)
        .on("end", () => {
          updateTourOverlays();
          window.dispatchEvent(new CustomEvent("tour:viewport-ready"));
        });
    };

    const handleZoomToNode = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      const svg = svgRef.current;
      const container = containerRef.current;
      const layout = lastLayoutRef.current;
      if (!svg || !container || !zoomRef.current || !layout) return;

      const targetNode = layout.nodes.find((n) => n.data.id === nodeId);
      if (!targetNode) return;

      const { width, height } = container.getBoundingClientRect();
      const targetScale = 1.5;
      const targetX = width / 2 - targetNode.x * targetScale;
      const targetY = height / 2 - targetNode.y * targetScale;
      const zoomTransform = d3.zoomIdentity
        .translate(targetX, targetY)
        .scale(targetScale);

      d3.select(svg)
        .transition()
        .duration(750)
        .call(zoomRef.current.transform, zoomTransform)
        .on("end", () => {
          updateTourOverlays();
          // After zoom, read node's screen position and notify
          const allNodeEls = svg.querySelectorAll("g.node");
          for (const el of allNodeEls) {
            // biome-ignore lint/suspicious/noExplicitAny: accessing d3 internal data binding
            const d = (el as any).__data__;
            if (d?.data?.id === nodeId) {
              const shape = el.querySelector("path.node-shape") ?? el;
              const rect = shape.getBoundingClientRect();
              window.dispatchEvent(
                new CustomEvent("tour:node-ready", {
                  detail: {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  },
                }),
              );
              break;
            }
          }
        });
    };

    // Generic helper: zoom to SVG coords and position an overlay, then dispatch ready event
    const zoomAndOverlay = (
      x: number,
      y: number,
      overlayRef: React.RefObject<HTMLDivElement | null>,
      selector: string,
      pad: number,
      readyEvent: string,
      scale = 1.5,
      /** Re-apply the data-tour-focus attribute after zoom (D3 may recreate elements). */
      retag?: () => void,
    ) => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container || !zoomRef.current) return;

      const { width, height } = container.getBoundingClientRect();
      const tx = width / 2 - x * scale;
      const ty = height / 2 - y * scale;
      const zt = d3.zoomIdentity.translate(tx, ty).scale(scale);

      d3.select(svg)
        .transition()
        .duration(750)
        .call(zoomRef.current.transform, zt)
        .on("end", () => {
          updateTourOverlays();
          // Re-tag the target element (D3 may have recreated it)
          retag?.();
          // Position the specific overlay
          const overlay = overlayRef.current;
          const el = svg.querySelector(selector);
          if (overlay && el) {
            const cr = container.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            overlay.style.display = "";
            overlay.style.left = `${er.left - cr.left - pad}px`;
            overlay.style.top = `${er.top - cr.top - pad}px`;
            overlay.style.width = `${er.width + pad * 2}px`;
            overlay.style.height = `${er.height + pad * 2}px`;
          }
          // Dispatch after frames so the overlay position is painted
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent(readyEvent));
            });
          });
        });
    };

    /** Find a g.node by program ID and set data-tour-focus on it. */
    const tagNodeById = (nodeId: string, focusValue: string) => {
      const svg = svgRef.current;
      if (!svg) return;
      for (const el of svg.querySelectorAll("g.node")) {
        // biome-ignore lint/suspicious/noExplicitAny: d3 data binding
        if ((el as any).__data__?.data?.id === nodeId) {
          el.setAttribute("data-tour-focus", focusValue);
          return;
        }
      }
    };

    const handleFocusCrossover = () => {
      const layout = lastLayoutRef.current;
      if (!layout || layout.crossLinks.length === 0) {
        // No crossover nodes — signal skip
        window.dispatchEvent(new CustomEvent("tour:element-skip"));
        return;
      }
      // Pick first crossover — use the target node (the child in the other island)
      const cl = layout.crossLinks[0];
      const targetNode = cl.target;
      tagNodeById(targetNode.data.id, "crossover");
      zoomAndOverlay(
        targetNode.x,
        targetNode.y,
        crossoverOverlayRef,
        '[data-tour-focus="crossover"]',
        30,
        "tour:element-ready",
        1.5,
        () => tagNodeById(targetNode.data.id, "crossover"),
      );
    };

    const handleFocusIslandRoot = () => {
      const layout = lastLayoutRef.current;
      if (!layout) return;
      const islandRoot = layout.nodes.find(
        (n) =>
          n.parent?.data.id === ISLAND_ROOT_ID &&
          n.data.id !== ISLAND_ROOT_ID &&
          n.data.id !== VIRTUAL_ROOT_ID,
      );
      if (!islandRoot) return;
      tagNodeById(islandRoot.data.id, "island-root");
      zoomAndOverlay(
        islandRoot.x,
        islandRoot.y,
        islandRootOverlayRef,
        '[data-tour-focus="island-root"]',
        30,
        "tour:element-ready",
        1.5,
        () => tagNodeById(islandRoot.data.id, "island-root"),
      );
    };

    const handleFocusRingArc = () => {
      const layout = lastLayoutRef.current;
      const svg = svgRef.current;
      if (!layout || !svg) return;
      // Find the first ring arc path in node-ring-sections
      const ringSection = svg.querySelector("g.node-ring-sections");
      if (!ringSection) return;
      const firstArc = ringSection.querySelector("path");
      if (!firstArc) return;
      firstArc.setAttribute("data-tour-focus", "ring-arc");
      // Ring sections are translated to center, so use center coords
      const center = layout.center;
      if (!center) return;
      zoomAndOverlay(
        center.x,
        center.y,
        ringArcOverlayRef,
        '[data-tour-focus="ring-arc"]',
        20,
        "tour:element-ready",
        1.0,
        () => {
          // D3 may recreate ring section paths — re-tag the first arc
          const rs = svgRef.current?.querySelector("g.node-ring-sections");
          const arc = rs?.querySelector("path");
          if (arc) arc.setAttribute("data-tour-focus", "ring-arc");
        },
      );
    };

    const handleCancel = () => {
      if (svgRef.current) d3.select(svgRef.current).interrupt();
    };
    window.addEventListener("tour:cancel", handleCancel);
    window.addEventListener("tour:fit-view", handleFitView);
    window.addEventListener("tour:zoom-to-node", handleZoomToNode);
    window.addEventListener("tour:focus-crossover", handleFocusCrossover);
    window.addEventListener("tour:focus-island-root", handleFocusIslandRoot);
    const handleHideOverlays = () => {
      for (const ref of [
        crossoverOverlayRef,
        islandRootOverlayRef,
        ringArcOverlayRef,
      ]) {
        if (ref.current) ref.current.style.display = "none";
      }
      // Clean up data-tour-focus attributes
      const svg = svgRef.current;
      if (svg) {
        for (const el of svg.querySelectorAll("[data-tour-focus]")) {
          el.removeAttribute("data-tour-focus");
        }
      }
    };

    window.addEventListener("tour:focus-ring-arc", handleFocusRingArc);
    window.addEventListener("tour:hide-overlays", handleHideOverlays);
    return () => {
      window.removeEventListener("tour:cancel", handleCancel);
      window.removeEventListener("tour:fit-view", handleFitView);
      window.removeEventListener("tour:zoom-to-node", handleZoomToNode);
      window.removeEventListener("tour:focus-crossover", handleFocusCrossover);
      window.removeEventListener(
        "tour:focus-island-root",
        handleFocusIslandRoot,
      );
      window.removeEventListener("tour:focus-ring-arc", handleFocusRingArc);
      window.removeEventListener("tour:hide-overlays", handleHideOverlays);
    };
  }, [updateTourOverlays]);

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#F6F6F6] relative"
      data-tour="tree-canvas"
    >
      <svg ref={svgRef} className="w-full h-full" />
      {/* Invisible anchors for guided tour — rendered after hydration to avoid SSR mismatch */}
      {mounted && (
        <>
          <div
            ref={chordOverlayRef}
            data-tour="chord-links"
            className="absolute pointer-events-none"
            style={{ display: "none" }}
          />
          <div
            ref={bestNodeOverlayRef}
            data-tour="best-node-overlay"
            className="absolute pointer-events-none"
            style={{ display: "none" }}
          />
          <div
            ref={crossoverOverlayRef}
            data-tour="crossover-overlay"
            className="absolute pointer-events-none"
            style={{ display: "none" }}
          />
          <div
            ref={islandRootOverlayRef}
            data-tour="island-root-overlay"
            className="absolute pointer-events-none"
            style={{ display: "none" }}
          />
          <div
            ref={ringArcOverlayRef}
            data-tour="ring-arc-overlay"
            className="absolute pointer-events-none"
            style={{ display: "none" }}
          />
        </>
      )}
      <TreeLegend
        patchTypes={legendData.patchTypes}
        minScore={legendData.minScore}
        maxScore={legendData.maxScore}
        colorScheme={shellState.settings.colorMap}
        averageScore={avgScoreInfo?.score}
        averageScoreColor={avgScoreInfo?.color}
        isAverageFilterActive={isAverageFilterActive}
        onToggleAverageFilter={handleToggleAverageFilter}
        showErrorNodes={shellState.settings.showErrorNodes}
        showTimeoutNodes={shellState.settings.showTimeoutNodes}
        hasErrorNodes={hasErrorNodes}
        hasTimeoutNodes={hasTimeoutNodes}
        hasHumanNodes={hasHumanNodes}
        unifyMutationTypes={shellState.settings.unifyMutationTypes}
      />
    </div>
  );
}
