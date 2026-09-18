import { useEffect, useRef } from "react";
import type { Program } from "@/types";

export interface TreeDataState {
  /** Whether the next render should re-centre the viewport. */
  isFirstRender: React.RefObject<boolean>;
  /** Node positions from the previous render (used for incremental animation). */
  prevPositions: React.RefObject<Map<string, { x: number; y: number }>>;
  /** Persist the current node positions so the next render can animate from them. */
  savePrevPositions: (positions: Map<string, { x: number; y: number }>) => void;
  /** Mark the first render as complete (disables re-centring on incremental updates). */
  markRendered: () => void;
}

/**
 * Encapsulates the mutable ref state needed to distinguish first renders (full
 * re-centre) from incremental updates (smooth animation) in the tree
 * visualisation.
 *
 * Internally tracks:
 * - `isFirstRender` ref (true until the first layout pass completes).
 * - `prevNodePositions` ref (empty map until positions are saved).
 * - A change-detection effect that resets `isFirstRender` when the program
 *   dataset is completely replaced (e.g. database switch).
 */
export function useTreeData(programs: Program[]): TreeDataState {
  const isFirstRender = useRef(true);
  const prevProgramsRef = useRef<Program[]>(programs);
  const prevNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // Detect dataset replacement (DB switch) vs incremental update.
  useEffect(() => {
    if (prevProgramsRef.current !== programs) {
      const prevIds = new Set(prevProgramsRef.current.map((p) => String(p.id)));
      const hasOverlap =
        prevIds.size > 0 && programs.some((p) => prevIds.has(String(p.id)));

      if (!hasOverlap && programs.length > 0) {
        // Completely new dataset (DB switch or first load) -> re-centre.
        isFirstRender.current = true;
      }
      // Otherwise keep isFirstRender as-is to preserve user's zoom/pan.
      prevProgramsRef.current = programs;
    }
  }, [programs]);

  const savePrevPositions = (
    positions: Map<string, { x: number; y: number }>,
  ) => {
    prevNodePositionsRef.current = positions;
  };

  const markRendered = () => {
    isFirstRender.current = false;
  };

  return {
    isFirstRender,
    prevPositions: prevNodePositionsRef,
    savePrevPositions,
    markRendered,
  };
}
