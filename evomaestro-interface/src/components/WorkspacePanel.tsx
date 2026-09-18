"use client";

import { clsx } from "clsx";
import { Bot, Eye } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const GlobalChatPanel = dynamic(
  () => import("@/components/chat/GlobalChatPanel"),
  { ssr: false },
);

import { ErrorBoundary } from "@/components/ErrorBoundary";
import type {
  TreeInteractionHandlers,
  TreeScoreHandlers,
} from "@/components/tree/treeTypes";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import type { TabKey } from "@/contexts/WorkspacePanelTabContext";
import { useI18n } from "@/i18n";
import { getMetaFiles } from "@/lib/api";
import type { Program } from "@/types";
import { ResumeHintModal } from "./modals/ResumeHintModal";
import { OverviewSidebar } from "./OverviewSidebar";
import { RunPanel } from "./RunPanel";
import { BestPathView } from "./views/BestPathView";
import { ClustersView } from "./views/ClustersView";
import ProgramsTable from "./views/ProgramsTable";
import TreeVisualizationNew from "./views/TreeVisualizationNew";

interface WorkspacePanelProps {
  programs: Program[];
  selectedProgramId: string | null;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  treeInteractions: TreeInteractionHandlers;
  scoreThreshold?: number | null;
  treeScoreHandlers?: TreeScoreHandlers;
  loading: boolean;
  error: string | null;
  usesCustomReviewPrioritization?: boolean;
  numIslands?: number;
  dbPath?: string | null;
}

export default function WorkspacePanel({
  programs,
  selectedProgramId,
  activeTab,
  setActiveTab,
  treeInteractions,
  scoreThreshold,
  treeScoreHandlers,
  loading,
  error,
  usesCustomReviewPrioritization,
  numIslands,
  dbPath,
}: WorkspacePanelProps) {
  const { t } = useI18n();
  const { state, readOnly, guideMode } = useEvolveShell();
  const [showOverview, setShowOverview] = useState(false);
  const [overviewOrigin, setOverviewOrigin] = useState<"user" | "guide">(
    "user",
  );
  const [showGlobalChat, setShowGlobalChat] = useState(false);
  const [hasMetaFiles, setHasMetaFiles] = useState(false);

  // Guided tour events for Evolution Overview sidebar
  useEffect(() => {
    const handleOpen = () => {
      setOverviewOrigin("guide");
      setShowOverview(true);
    };
    const handleClose = () => setShowOverview(false);
    window.addEventListener("tour:open-overview", handleOpen);
    window.addEventListener("tour:close-overview", handleClose);
    return () => {
      window.removeEventListener("tour:open-overview", handleOpen);
      window.removeEventListener("tour:close-overview", handleClose);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check when program count changes
  useEffect(() => {
    if (!dbPath) {
      setHasMetaFiles(false);
      return;
    }
    const request = new AbortController();
    setHasMetaFiles(false);
    getMetaFiles(dbPath, request.signal)
      .then((files) => {
        if (!request.signal.aborted) setHasMetaFiles(files.length > 0);
      })
      .catch(() => {
        if (!request.signal.aborted) setHasMetaFiles(false);
      });
    return () => request.abort();
  }, [dbPath, programs.length]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "Tree", label: t("tabs.tree") },
    { key: "Programs", label: t("tabs.programs") },
    { key: "Clusters", label: t("tabs.clusters") },
    { key: "Best Path", label: t("tabs.bestPath") },
  ];

  // Helper to handle ID-based selection from views
  const handleNodeSelect = (nodeId: string) => {
    const prog = programs.find((p) => p.id === nodeId);
    if (prog) {
      treeInteractions.onSelectProgram(prog);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Tabs */}
      <div
        className="flex bg-gray-100 border-b border-gray-200 overflow-x-auto overflow-y-hidden"
        data-tour="workspace-tabs"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
            className={clsx(
              "px-4 py-2 text-sm font-medium whitespace-nowrap border-r border-gray-200",
              activeTab === tab.key
                ? "bg-white text-black font-bold border-b-2 border-b-white -mb-px"
                : "text-gray-600 hover:bg-gray-50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        className="flex-1 relative overflow-hidden bg-[#F6F6F6]"
        data-panel-container="workspace"
      >
        {loading && activeTab === "Tree" && programs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-20">
            {t("common.loading")}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 z-20 p-4 text-center">
            {error}
          </div>
        )}

        <div
          className="absolute inset-0"
          style={{ display: activeTab === "Tree" ? undefined : "none" }}
        >
          <ErrorBoundary>
            <TreeVisualizationNew
              programs={programs}
              selectedProgramId={selectedProgramId}
              interactions={treeInteractions}
              scoreThreshold={scoreThreshold}
              scoreHandlers={treeScoreHandlers}
              numIslands={numIslands}
            />
          </ErrorBoundary>
        </div>

        {activeTab === "Programs" && (
          <ErrorBoundary>
            <ProgramsTable
              programs={programs}
              selectedProgramId={selectedProgramId}
              onSelectProgram={treeInteractions.onSelectProgram}
              usesCustomReviewPrioritization={usesCustomReviewPrioritization}
            />
          </ErrorBoundary>
        )}

        {activeTab === "Clusters" && (
          <ErrorBoundary>
            <ClustersView data={programs} onNodeSelect={handleNodeSelect} />
          </ErrorBoundary>
        )}

        {activeTab === "Best Path" && (
          <ErrorBoundary>
            <BestPathView
              data={programs}
              selectedNodeId={selectedProgramId}
              onNodeSelect={handleNodeSelect}
            />
          </ErrorBoundary>
        )}

        {/* Tree-only floating elements */}
        {activeTab === "Tree" && (
          <>
            {/* Blur overlay when waiting for start */}
            {state.runStatus.run_state === "waiting_for_start" && (
              <div className="absolute inset-0 z-20 bg-white/40 backdrop-blur-sm pointer-events-none" />
            )}

            {/* Floating buttons: Evolution Overview + Maestro Chat */}
            <div className="absolute top-3 right-4 z-10 flex items-center gap-2 pointer-events-auto">
              {hasMetaFiles && (
                <button
                  type="button"
                  data-tour="evolution-overview-btn"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-gray-200 shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setOverviewOrigin("user");
                    setShowOverview((v) => !v);
                  }}
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                  {t("workspace.evolutionOverview")}
                </button>
              )}
              <button
                type="button"
                data-tour="global-maestro-chat-btn"
                disabled={readOnly}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-gray-200 shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setShowGlobalChat((v) => !v)}
              >
                <Bot className="w-3.5 h-3.5 text-emerald-500" />
                {t("workspace.maestroChat")}
              </button>
            </div>

            {/* Run Panel */}
            <RunPanel />

            {/* Resume hint modal */}
            {!guideMode && !readOnly && <ResumeHintModal />}
          </>
        )}
      </div>

      <OverviewSidebar
        open={showOverview}
        openedByGuide={overviewOrigin === "guide"}
        onClose={() => setShowOverview(false)}
        dbPath={dbPath ?? null}
        programCount={programs.length}
      />

      {/* Global Maestro Chat sidebar — stays mounted to preserve state */}
      <div
        aria-hidden={!showGlobalChat}
        inert={!showGlobalChat}
        className={`fixed top-0 right-0 h-full w-[520px] z-30 bg-gray-50 border-l border-gray-200 shadow-xl transition-transform duration-300 ${
          showGlobalChat ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {dbPath && (
          <GlobalChatPanel
            dbPath={dbPath}
            programCount={programs.length}
            onClose={() => setShowGlobalChat(false)}
          />
        )}
      </div>
    </div>
  );
}
