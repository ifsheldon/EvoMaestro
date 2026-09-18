"use client";

import { useEffect, useMemo, useRef } from "react";
import CanvasContextMenu from "@/components/context-menu/CanvasContextMenu";
import NodeContextMenu from "@/components/context-menu/NodeContextMenu";
import CodeModal from "@/components/modals/CodeModal";
import DiffModal from "@/components/modals/DiffModalNew";
import DistributionModal from "@/components/modals/DistributionModal";
import { NodeDetailsModal } from "@/components/modals/NodeDetailsModal";
import NodeMergeModal from "@/components/modals/NodeMergeModal";
import NodeSearchModal from "@/components/modals/NodeSearchModal";
import NoteInputModal from "@/components/modals/NoteInputModal";
import SettingsModal from "@/components/modals/SettingsModal";
import SuggestModal from "@/components/modals/SuggestModal";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ReviewPriorityBanner } from "@/components/ReviewPriorityBanner";
import SelectedProgramsPanel from "@/components/SelectedProgramsPanel";
import WorkspacePanel from "@/components/WorkspacePanel";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { WorkspacePanelTabContext } from "@/contexts/WorkspacePanelTabContext";
import type { HomePageController } from "@/hooks/useHomePageController";
import { useI18n } from "@/i18n";
import { getActiveEmbedding } from "@/utils/embeddingAccessors";
import {
  getErrorType,
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";

interface HomeContentProps {
  controller: HomePageController;
  selectedDbPath: string | null;
}

export function HomeContent({ controller, selectedDbPath }: HomeContentProps) {
  const {
    programs,
    numIslands,
    selectedProgramId,
    activeTab,
    setActiveTab,
    switchToTreeAndSelect,
    focusNodeId,
    clearFocusNode,
    usesCustomReviewPrioritization,
    showNotificationCenter,
    setShowNotificationCenter,
    loading,
    error,
    handleSelectProgram,
    handleDoubleClickProgram,
    handleDeselect,
    handleNodeContextMenu,
    handleCanvasContextMenu,
    openReviewPriorityDetails,
    scoreThreshold,
    setScoreThreshold,
  } = controller;

  const treeInteractions = useMemo(
    () => ({
      onSelectProgram: handleSelectProgram,
      onDoubleClickProgram: handleDoubleClickProgram,
      onDeselect: handleDeselect,
      onNodeContextMenu: handleNodeContextMenu,
      onCanvasContextMenu: handleCanvasContextMenu,
      onReviewPriorityClick: openReviewPriorityDetails,
    }),
    [
      handleSelectProgram,
      handleDoubleClickProgram,
      handleDeselect,
      handleNodeContextMenu,
      handleCanvasContextMenu,
      openReviewPriorityDetails,
    ],
  );

  const treeScoreHandlers = useMemo(
    () => ({
      onClearScoreThreshold: () => setScoreThreshold(null),
      onSetScoreThreshold: setScoreThreshold,
    }),
    [setScoreThreshold],
  );

  return (
    <WorkspacePanelTabContext.Provider
      value={{
        activeTab,
        setActiveTab,
        switchToTreeAndSelect,
        focusNodeId,
        clearFocusNode,
      }}
    >
      <ReviewPriorityBanner
        hidden={showNotificationCenter}
        usesCustomReviewPrioritization={usesCustomReviewPrioritization}
      />
      <NotificationCenter
        open={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        usesCustomReviewPrioritization={usesCustomReviewPrioritization}
      />
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-shrink-0 h-full overflow-hidden w-full">
          <WorkspacePanel
            programs={programs}
            selectedProgramId={selectedProgramId}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            treeInteractions={treeInteractions}
            scoreThreshold={scoreThreshold}
            treeScoreHandlers={treeScoreHandlers}
            loading={loading}
            error={error}
            usesCustomReviewPrioritization={usesCustomReviewPrioritization}
            numIslands={numIslands}
            dbPath={selectedDbPath}
          />
        </div>

        <SelectedProgramsPanel
          dbPath={selectedDbPath}
          programs={programs}
          onOpenCompareDiff={() => {
            const sel = controller.shellState.mergeSelection;
            if (sel.length === 2) {
              controller.setCompareDiffPrograms([sel[0], sel[1]]);
            }
          }}
          onDetails={() => {
            const program = controller.shellState.mergeSelection[0];
            if (program) controller.openDetailsModal(program);
          }}
          onCode={() => {
            const program = controller.shellState.mergeSelection[0];
            if (program) controller.setCodeModalProgram(program);
          }}
          onSuggest={() => {
            const program = controller.shellState.mergeSelection[0];
            if (program) controller.setSuggestTarget(program);
          }}
          onCodeChange={() => {
            const program = controller.shellState.mergeSelection[0];
            if (!program?.parent_id) return;
            const parent = programs.find(
              (candidate) => candidate.id === program.parent_id,
            );
            if (parent) {
              controller.setDiffPair({ left: parent, right: program });
            }
          }}
          onMerge={() => {
            controller.setMergeModalPrograms([
              ...controller.shellState.mergeSelection,
            ]);
            controller.clearMergeSelection();
          }}
          showFilter={
            controller.shellState.mergeSelection.length === 1 &&
            isCorrectProgram(controller.shellState.mergeSelection[0]) &&
            controller.scoreThreshold == null
          }
          onFilter={() => {
            const program = controller.shellState.mergeSelection[0];
            if (!program) return;
            const score = getProgramScore(program);
            if (score != null) controller.setScoreThreshold(score);
          }}
          hasFilter={controller.scoreThreshold != null}
          onRemoveFilter={() => controller.setScoreThreshold(null)}
          bannedNodeIds={new Set(controller.shellState.bannedNodeIds)}
          onBanNodes={(ids) => {
            for (const id of ids) {
              if (!controller.shellState.bannedNodeIds.includes(id))
                controller.toggleBanNode(id);
            }
          }}
          onUnbanNodes={(ids) => {
            for (const id of ids) {
              if (controller.shellState.bannedNodeIds.includes(id))
                controller.toggleBanNode(id);
            }
          }}
        />

        {controller.mergeModalPrograms && (
          <NodeMergeModal
            dbPath={selectedDbPath}
            programs={programs}
            initialPrograms={controller.mergeModalPrograms}
            onOpenCompareDiff={controller.setCompareDiffPrograms}
            onClose={() => controller.setMergeModalPrograms(null)}
          />
        )}

        {controller.suggestTarget && (
          <SuggestModal
            program={controller.suggestTarget}
            onClose={() => controller.setSuggestTarget(null)}
          />
        )}
      </div>

      <ModalsLayer
        controller={controller}
        programs={programs}
        selectedDbPath={selectedDbPath}
      />
    </WorkspacePanelTabContext.Provider>
  );
}

// ── Modals & context menus (extracted to reduce HomeContent size) ──────

function ModalsLayer({
  controller,
  programs,
  selectedDbPath,
}: {
  controller: HomePageController;
  programs: HomePageController["programs"];
  selectedDbPath: string | null;
}) {
  const { t } = useI18n();
  const {
    detailsSnapshots,
    closeDetailsModal,
    usesCustomReviewPrioritization,
    contextMenu,
    closeNodeContextMenu,
    openReviewPriorityDetails,
    openDetailsModal,
    setCodeModalProgram,
    setSuggestTarget,
    setDiffPair,
    setMergeModalPrograms,
    shellState,
    toggleMarkNode,
    toggleBanNode,
    setNoteTarget,
    canvasContextMenu,
    closeCanvasContextMenu,
    showDistributionModal,
    closeDistributionModal,
    scoreThreshold,
    setScoreThreshold,
    diffPair,
    compareDiffPrograms,
    setCompareDiffPrograms,
    codeModalProgram,
    showSearchModal,
    setShowSearchModal,
    showSettingsModal,
    setShowSettingsModal,
    noteTarget,
    setNodeNote,
    removeNodeNote,
  } = controller;

  const { updateSettings } = useEvolveShell();

  // Detect whether any program has reasoning embeddings
  const hasReasoningEmbeddings = useMemo(
    () =>
      programs.some((p) => getActiveEmbedding(p, "reasoning") !== undefined),
    [programs],
  );

  // Auto-switch to reasoning embeddings on first load when available
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (hasReasoningEmbeddings && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      updateSettings({ embeddingSource: "reasoning" });
    }
  }, [hasReasoningEmbeddings, updateSettings]);

  return (
    <>
      {detailsSnapshots.map((snapshot) => (
        <NodeDetailsModal
          key={snapshot.id}
          program={snapshot.program}
          allPrograms={programs}
          usesCustomReviewPrioritization={usesCustomReviewPrioritization}
          initialTab={snapshot.initialTab}
          reviewPriorityHighlight={snapshot.reviewPriorityHighlight}
          onClose={() => closeDetailsModal(snapshot.id)}
        />
      ))}

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hideCodeChange={contextMenu.program.metadata?.patch_type === "init"}
          showReviewPriority={
            contextMenu.program.review_priority_level === "high" ||
            contextMenu.program.review_priority_level === "moderate"
          }
          onReviewPriority={() =>
            openReviewPriorityDetails(contextMenu.program)
          }
          onSuggest={() => setSuggestTarget(contextMenu.program)}
          onCodeChange={() => {
            const program = contextMenu.program;
            if (!program.parent_id) return;
            const parent = programs.find(
              (candidate) => candidate.id === program.parent_id,
            );
            if (parent) {
              setDiffPair({ left: parent, right: program });
            }
          }}
          onCode={() => setCodeModalProgram(contextMenu.program)}
          onDetails={() => openDetailsModal(contextMenu.program)}
          onMerge={() => setMergeModalPrograms([contextMenu.program])}
          isMarked={shellState.markedNodeIds.includes(contextMenu.program.id)}
          onToggleMark={() => toggleMarkNode(contextMenu.program.id)}
          onAddNote={() => setNoteTarget(contextMenu.program)}
          isBanned={shellState.bannedNodeIds.includes(contextMenu.program.id)}
          onToggleBan={() => toggleBanNode(contextMenu.program.id)}
          showFilter={
            isCorrectProgram(contextMenu.program) && scoreThreshold == null
          }
          onFilter={() => {
            const score = getProgramScore(contextMenu.program);
            if (score != null) setScoreThreshold(score);
          }}
          hasFilter={scoreThreshold != null}
          onRemoveFilter={() => setScoreThreshold(null)}
          onClose={closeNodeContextMenu}
        />
      )}

      {canvasContextMenu && (
        <CanvasContextMenu
          x={canvasContextMenu.x}
          y={canvasContextMenu.y}
          onDistribution={() => controller.setShowDistributionModal(true)}
          hasFilter={scoreThreshold != null}
          onRemoveFilter={() => setScoreThreshold(null)}
          onClose={closeCanvasContextMenu}
        />
      )}

      {showDistributionModal && (
        <DistributionModal
          programs={programs}
          scoreThreshold={scoreThreshold}
          onThresholdChange={setScoreThreshold}
          onClose={closeDistributionModal}
        />
      )}

      {diffPair && (
        <DiffModal
          programLeft={diffPair.left}
          programRight={diffPair.right}
          diffSummary={diffPair.right.metadata?.diff_summary}
          unifiedDiff={diffPair.right.code_diff ?? undefined}
          dbPath={selectedDbPath ?? undefined}
          chatMode="code_change"
          onClose={() => controller.setDiffPair(null)}
        />
      )}

      {compareDiffPrograms && (
        <DiffModal
          programLeft={compareDiffPrograms[0]}
          programRight={compareDiffPrograms[1]}
          title={t("merge.comparePrograms")}
          dbPath={selectedDbPath ?? undefined}
          chatMode="code_diff"
          onClose={() => setCompareDiffPrograms(null)}
        />
      )}

      {codeModalProgram && (
        <CodeModal
          program={codeModalProgram}
          dbPath={selectedDbPath ?? undefined}
          onClose={() => controller.setCodeModalProgram(null)}
        />
      )}

      {showSearchModal && (
        <NodeSearchModal
          programs={programs}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          hasReasoningEmbeddings={hasReasoningEmbeddings}
          hasErrorNodes={programs.some(
            (p) => getErrorType(p) && !isTimeoutProgram(p),
          )}
          hasTimeoutNodes={programs.some((p) => isTimeoutProgram(p))}
          hasCrossNodes={programs.some(
            (p) => p.metadata?.patch_type === "cross",
          )}
          dbPath={selectedDbPath ?? undefined}
        />
      )}

      {noteTarget && (
        <NoteInputModal
          program={noteTarget}
          initialNote={shellState.nodeNotes[noteTarget.id] ?? ""}
          onSave={(note) => setNodeNote(noteTarget.id, note)}
          onRemove={() => removeNodeNote(noteTarget.id)}
          onClose={() => controller.setNoteTarget(null)}
        />
      )}
    </>
  );
}
