/**
 * treeInteractions.ts — Node click/hover/contextmenu handlers and tooltip rendering.
 */

import * as d3 from "d3";
import { SHOW_ISLAND_IN_TREE } from "@/config";
import { translateUi as t, translatePatchType } from "@/i18n";
import { getProgramName, getProgramScore } from "@/utils/program";
import type { LayoutResult, NodeDatum } from "./treeLayoutEngine";
import { ISLAND_ROOT_ID, VIRTUAL_ROOT_ID } from "./treeLayoutEngine";
import type { RenderCallbacks, VisualState } from "./treeRenderer";
import { isHumanOrigin } from "./treeUtils";

export function attachNodeInteractions(
  nodeSel: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>,
  layout: LayoutResult,
  visualState: VisualState,
  callbacks: RenderCallbacks,
): void {
  nodeSel
    .on("click", (event, d) => {
      if (d.data.id === VIRTUAL_ROOT_ID) return;
      event.stopPropagation();

      if (d.data.id === ISLAND_ROOT_ID) {
        callbacks.setAverageComparisonTarget((prev) => {
          const next = prev === "__all__" ? null : "__all__";
          if (next !== null) {
            callbacks.setIslandFilterIslandIdx(() => null);
            callbacks.onClearScoreThreshold?.();
          }
          return next;
        });
        return;
      }

      // Initial program click: island filter by actual island_idx
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        d.data._parentId === ISLAND_ROOT_ID
      ) {
        const clickedIslandIdx = layout.getIslandIdxForNodeId(d.data.id);
        if (clickedIslandIdx != null) {
          callbacks.setIslandFilterIslandIdx((prev) => {
            const next = prev === clickedIslandIdx ? null : clickedIslandIdx;
            if (next !== null) {
              callbacks.setAverageComparisonTarget(() => null);
              callbacks.onClearScoreThreshold?.();
            }
            return next;
          });
        }
        return;
      }

      // Ctrl/Meta-click toggles merge selection
      if (event.ctrlKey || event.metaKey) {
        if (
          visualState.mergeSelectedIds.size === 0 &&
          visualState.selectedProgramId &&
          visualState.selectedProgramId !== d.data.id
        ) {
          const selectedProg = callbacks.programs.find(
            (p) => p.id === visualState.selectedProgramId,
          );
          if (selectedProg) callbacks.toggleMergeSelect(selectedProg);
        }
        callbacks.toggleMergeSelect(d.data);
        return;
      }

      callbacks.onSelectProgram(d.data);
      callbacks.highlightProgram(null);
    })
    .on("contextmenu", (event, d) => {
      if (d.data.id === VIRTUAL_ROOT_ID) return;
      if (d.data.id === ISLAND_ROOT_ID) return;
      event.preventDefault();
      event.stopPropagation();
      d3.selectAll(".node-tooltip").remove();
      callbacks.onNodeContextMenu?.(d.data, event.clientX, event.clientY);
    })
    .on("dblclick", (event, d) => {
      if (d.data.id === VIRTUAL_ROOT_ID) return;
      if (d.data.id === ISLAND_ROOT_ID) return;
      event.stopPropagation();
      callbacks.onDoubleClickProgram?.(d.data);
    })
    .on("mouseover", (event, d) => {
      if (!d3.select(".node-tooltip").empty()) return;

      const tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "node-tooltip")
        .style("opacity", 0);

      const isIslandRoot = d.data.id === ISLAND_ROOT_ID;
      const score = isIslandRoot
        ? layout.averageAllNodeScore !== undefined &&
          Number.isFinite(layout.averageAllNodeScore)
          ? layout.averageAllNodeScore
          : null
        : getProgramScore(d.data);
      let displayName = isIslandRoot
        ? t("treeTooltip.islandRoot")
        : getProgramName(d.data);
      const variantMatch = displayName.match(/^variant_(\d+)$/i);
      if (variantMatch)
        displayName = t("treeTooltip.nodeName", { number: variantMatch[1] });
      const initialMatch = displayName.match(/^initial_program$/i);
      if (initialMatch) displayName = t("treeTooltip.initialProgram");

      const rawPatchType =
        d.data.metadata?.patch_type || t("details.notAvailable");
      const patchType =
        visualState.unifyMutationTypes &&
        (rawPatchType === "diff" || rawPatchType === "full")
          ? translatePatchType(t, "mutation")
          : translatePatchType(t, rawPatchType);
      const isInitialProgram = rawPatchType === "init";
      const scoreLabel = isIslandRoot
        ? t("treeTooltip.globalAverageScore")
        : t("common.score");
      const nodeIslandIdx = layout.getIslandIdxForNodeId(d.data.id);
      const islandIdx =
        nodeIslandIdx !== null && nodeIslandIdx !== undefined
          ? nodeIslandIdx
          : t("details.notAvailable");

      const humanTag =
        !isIslandRoot && isHumanOrigin(d.data)
          ? `<br/><strong style="color:#0ea5e9;">${t("treeTooltip.humanGuided")}</strong>`
          : "";

      const islandLine =
        SHOW_ISLAND_IN_TREE && !isIslandRoot
          ? `<strong>${t("programs.island")}:</strong> ${islandIdx}`
          : "";

      const islandAvg = isInitialProgram
        ? layout.islandAvgScoreByIslandIdx.get(
            layout.getIslandIdxForNodeId(d.data.id) ?? -1,
          )
        : undefined;
      const islandAvgLine =
        islandAvg !== undefined && islandAvg !== null
          ? `<br/><strong>${t("treeTooltip.islandAverage")}:</strong> ${islandAvg.toFixed(4)}`
          : "";

      const isQueued = d.data._lifecycle === "queued";

      const tooltipContent = isIslandRoot
        ? `<strong>${scoreLabel}:</strong> ${score !== null ? score.toFixed(4) : t("details.notAvailable")}`
        : isQueued
          ? `<strong style="color:#94a3b8; font-size: 13px;">${displayName}</strong><br/>` +
            `<strong style="color:#64748b;">${t("treeTooltip.queued")}</strong>` +
            (islandLine ? `<br/>${islandLine}` : "") +
            `<br/><strong>${t("treeTooltip.patch")}:</strong> ${patchType}`
          : `<strong style="color:#58a6ff; font-size: 13px;">${displayName}</strong><br/>` +
            `<strong>${t("treeTooltip.nodeNumber")}:</strong> ${d.data.generation}<br/>` +
            `<strong>${scoreLabel}:</strong> ${score !== null ? score.toFixed(4) : t("details.notAvailable")}` +
            (isInitialProgram
              ? ""
              : `<br/><strong>${t("treeTooltip.patch")}:</strong> ${patchType}`) +
            (islandLine ? `<br/>${islandLine}` : "") +
            islandAvgLine +
            humanTag;

      tooltip
        .html(tooltipContent)
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 10}px`);

      tooltip.transition().duration(150).style("opacity", 1);
    })
    .on("mousemove", (event) => {
      d3.select(".node-tooltip")
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 10}px`);
    })
    .on("mouseout", () => {
      d3.selectAll(".node-tooltip").remove();
    });
}

// ── Canvas event handlers ────────────────────────────────────────────────

export function setupCanvasHandlers(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  callbacks: RenderCallbacks,
): void {
  svg.on("click", () => {
    callbacks.onDeselect?.();
    callbacks.highlightProgram(null);
    callbacks.setAverageComparisonTarget(() => null);
    callbacks.setIslandFilterIslandIdx(() => null);
  });
  svg.on("contextmenu", (event: MouseEvent) => {
    event.preventDefault();
    d3.selectAll(".node-tooltip").remove();
    callbacks.onCanvasContextMenu?.(event.clientX, event.clientY);
  });
  svg.on("dblclick", (event: MouseEvent) => {
    event.preventDefault();
    d3.selectAll(".node-tooltip").remove();
    callbacks.onCanvasContextMenu?.(event.clientX, event.clientY);
  });
}
