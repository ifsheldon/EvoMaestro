"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import type { TabKey } from "@/contexts/WorkspacePanelTabContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useContextMenus } from "@/hooks/useContextMenus";
import { useHomeModals } from "@/hooks/useHomeModals";
import { useProgramLoader } from "@/hooks/useProgramLoader";

import { useWebSocketReload } from "@/hooks/useWebSocketReload";
import type { Program } from "@/types";

const CONTEXT_MENU_CLOSE_GUARD_MS = 300;
const AUTO_REFRESH_INTERVAL_MS = 10_000;

export type HomePageController = ReturnType<typeof useHomePageController>;

export function useHomePageController(selectedDbPath: string | null) {
  const {
    state: shellState,
    dispatch,
    selectProgram,
    clearMergeSelection,
    toggleMarkNode,
    toggleBanNode,
    setNodeNote,
    removeNodeNote,
  } = useEvolveShell();

  const [activeTab, setActiveTab] = useState<TabKey>("Tree");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const clearFocusNode = useCallback(() => setFocusNodeId(null), []);
  const clearSelection = useCallback(
    () => selectProgram(null),
    [selectProgram],
  );

  const hydrateReviewPriorityPrograms = useCallback(
    (loadedPrograms: Program[]) => {
      for (const program of loadedPrograms) {
        if (
          program.review_priority_level === "moderate" ||
          program.review_priority_level === "high"
        ) {
          dispatch({
            type: "ADD_REVIEW_PRIORITY_NOTIFICATION",
            notification: {
              id: `${program.id}-initial`,
              programId: program.id,
              reviewPriorityLevel: program.review_priority_level,
              reviewPriorityData: program.review_priority_data || {},
              combinedScore: program.combined_score ?? 0,
              generation: program.generation,
              timestamp: (program.timestamp || 0) * 1000,
              dismissed: true,
              showInBanner: false,
            },
          });
        }
      }
    },
    [dispatch],
  );

  const {
    programs,
    numIslands,
    usesCustomReviewPrioritization,
    configLoading,
    loading,
    error,
    scanStatus,
    setScanStatus,
    reloadPrograms,
    checkForUpdates,
  } = useProgramLoader({
    selectedDbPath,
    onClearSelection: clearSelection,
    onHydrateReviewPriorityPrograms: hydrateReviewPriorityPrograms,
  });

  const {
    contextMenu,
    canvasContextMenu,
    openNodeContextMenu,
    closeNodeContextMenu,
    openCanvasContextMenu,
    closeCanvasContextMenu,
    shouldIgnoreDeselect,
  } = useContextMenus(CONTEXT_MENU_CLOSE_GUARD_MS);

  const modals = useHomeModals();

  const selectedProgram = useMemo(
    () =>
      programs.find((program) => program.id === shellState.selectedProgramId) ||
      null,
    [programs, shellState.selectedProgramId],
  );

  const switchToTreeAndSelect = useCallback(
    (id: string) => {
      const program = programs.find((candidate) => candidate.id === id);
      if (program) {
        selectProgram(program.id);
        setActiveTab("Tree");
        setFocusNodeId(program.id);
      }
    },
    [programs, selectProgram],
  );

  const handleSelectProgram = useCallback(
    (program: Program) => {
      selectProgram(program.id);
    },
    [selectProgram],
  );

  const handleDoubleClickProgram = useCallback(
    (program: Program) => {
      selectProgram(program.id);
      modals.openDetailsModal(program);
    },
    [modals, selectProgram],
  );

  const handleDeselect = useCallback(() => {
    if (shouldIgnoreDeselect()) return;
    selectProgram(null);
  }, [selectProgram, shouldIgnoreDeselect]);

  useEffect(() => {
    if (selectedDbPath) {
      setAutoRefreshEnabled(true);
    }
  }, [selectedDbPath]);

  useWebSocketReload({
    selectedDbPath,
    reloadTrigger: shellState.reloadTrigger,
    reloadPrograms,
  });

  useAutoRefresh({
    enabled: autoRefreshEnabled,
    selectedDbPath,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    checkForUpdates,
  });

  return {
    shellState,
    programs,
    numIslands,
    usesCustomReviewPrioritization,
    configLoading,
    loading,
    error,
    scanStatus,
    setScanStatus,
    activeTab,
    setActiveTab,
    focusNodeId,
    clearFocusNode,
    switchToTreeAndSelect,
    selectedProgramId: selectedProgram?.id || null,
    handleSelectProgram,
    handleDoubleClickProgram,
    handleDeselect,
    handleNodeContextMenu: openNodeContextMenu,
    handleCanvasContextMenu: openCanvasContextMenu,
    clearMergeSelection,
    toggleMarkNode,
    toggleBanNode,
    setNodeNote,
    removeNodeNote,
    ...modals,
    contextMenu,
    canvasContextMenu,
    closeNodeContextMenu,
    closeCanvasContextMenu,
  };
}
