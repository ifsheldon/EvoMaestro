import * as d3 from "d3";
import type { Program } from "@/types";

export interface TreeInteractionHandlers {
  onSelectProgram: (program: Program) => void;
  onDoubleClickProgram?: (program: Program) => void;
  onDeselect?: () => void;
  onNodeContextMenu?: (
    program: Program,
    screenX: number,
    screenY: number,
  ) => void;
  onCanvasContextMenu?: (screenX: number, screenY: number) => void;
  onReviewPriorityClick?: (program: Program) => void;
}

export interface TreeScoreHandlers {
  onClearScoreThreshold?: () => void;
  onSetScoreThreshold?: (threshold: number | null) => void;
}

export interface TreeVisualizationProps {
  programs: Program[];
  selectedProgramId: string | null;
  interactions: TreeInteractionHandlers;
  scoreThreshold?: number | null;
  scoreHandlers?: TreeScoreHandlers;
  numIslands?: number;
}

export const patchShapeMap: Record<string, d3.SymbolType> = {
  init: d3.symbolDiamond,
  full: d3.symbolCircle,
  diff: d3.symbolCircle,
  cross: d3.symbolCross,
  start: d3.symbolStar,
};

/** When unifyMutationTypes is off, diff gets its own square shape. */
export const patchShapeMapSplit: Record<string, d3.SymbolType> = {
  init: d3.symbolDiamond,
  full: d3.symbolCircle,
  diff: d3.symbolSquare,
  cross: d3.symbolCross,
  start: d3.symbolStar,
};
