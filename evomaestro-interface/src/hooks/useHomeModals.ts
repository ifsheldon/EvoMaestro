"use client";

import { useCallback, useRef, useState } from "react";
import type { Program } from "@/types";

export interface ProgramPair {
  left: Program;
  right: Program;
}

export interface DetailsSnapshot {
  id: number;
  program: Program;
  initialTab?: string;
  reviewPriorityHighlight?: number;
}

export function useHomeModals() {
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState<number | null>(null);
  const [suggestTarget, setSuggestTarget] = useState<Program | null>(null);
  const [diffPair, setDiffPair] = useState<ProgramPair | null>(null);
  const [compareDiffPrograms, setCompareDiffPrograms] = useState<
    [Program, Program] | null
  >(null);
  const [detailsSnapshots, setDetailsSnapshots] = useState<DetailsSnapshot[]>(
    [],
  );
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [noteTarget, setNoteTarget] = useState<Program | null>(null);
  const [mergeModalPrograms, setMergeModalPrograms] = useState<
    Program[] | null
  >(null);
  const [codeModalProgram, setCodeModalProgram] = useState<Program | null>(
    null,
  );
  const nextDetailsId = useRef(0);

  const openDetailsModal = useCallback((program: Program) => {
    setDetailsSnapshots((prev) => {
      const existingIdx = prev.findIndex(
        (snapshot) => snapshot.program.id === program.id,
      );
      if (existingIdx >= 0) {
        // Move existing modal to the end (brings it to front)
        const snapshot = prev[existingIdx];
        return [...prev.filter((_, index) => index !== existingIdx), snapshot];
      }
      return [...prev, { id: nextDetailsId.current++, program }];
    });
  }, []);

  const closeDetailsModal = useCallback((id: number) => {
    setDetailsSnapshots((prev) =>
      prev.filter((snapshot) => snapshot.id !== id),
    );
  }, []);

  const openReviewPriorityDetails = useCallback((program: Program) => {
    setDetailsSnapshots((prev) => {
      const existingIdx = prev.findIndex(
        (snapshot) => snapshot.program.id === program.id,
      );
      if (existingIdx >= 0) {
        const snapshot = prev[existingIdx];
        const updated = {
          ...snapshot,
          initialTab: "Evaluation",
          reviewPriorityHighlight: (snapshot.reviewPriorityHighlight ?? 0) + 1,
        };
        return [...prev.filter((_, index) => index !== existingIdx), updated];
      }

      return [
        ...prev,
        {
          id: nextDetailsId.current++,
          program,
          initialTab: "Evaluation",
          reviewPriorityHighlight: 1,
        },
      ];
    });
  }, []);

  const closeDistributionModal = useCallback(() => {
    setShowDistributionModal(false);
    setScoreThreshold(null);
  }, []);

  return {
    showDistributionModal,
    setShowDistributionModal,
    closeDistributionModal,
    scoreThreshold,
    setScoreThreshold,
    suggestTarget,
    setSuggestTarget,
    diffPair,
    setDiffPair,
    compareDiffPrograms,
    setCompareDiffPrograms,
    detailsSnapshots,
    openDetailsModal,
    openReviewPriorityDetails,
    closeDetailsModal,
    showSearchModal,
    setShowSearchModal,
    showSettingsModal,
    setShowSettingsModal,
    showNotificationCenter,
    setShowNotificationCenter,
    noteTarget,
    setNoteTarget,
    mergeModalPrograms,
    setMergeModalPrograms,
    codeModalProgram,
    setCodeModalProgram,
  };
}
