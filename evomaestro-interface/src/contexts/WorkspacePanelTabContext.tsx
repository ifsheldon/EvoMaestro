"use client";

import { createContext, useContext } from "react";

export type TabKey = "Tree" | "Programs" | "Clusters" | "Best Path";

interface WorkspacePanelTabContextValue {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  /** Switch to Tree view and select the program with the given id. */
  switchToTreeAndSelect: (id: string) => void;
  /** Node ID to zoom/focus on in the tree. Resets after consumed. */
  focusNodeId: string | null;
  clearFocusNode: () => void;
}

const WorkspacePanelTabContext =
  createContext<WorkspacePanelTabContextValue | null>(null);

export function useWorkspacePanelTab(): WorkspacePanelTabContextValue | null {
  return useContext(WorkspacePanelTabContext);
}

export { WorkspacePanelTabContext };
