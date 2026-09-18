"use client";

import {
  Ban,
  BarChart2,
  Eye,
  FileCode2,
  Filter,
  FilterX,
  GitCompare,
  GitMerge,
  GripHorizontal,
  Info,
  Lightbulb,
  Network,
  Pencil,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import ComparePerformanceModal, {
  type ComparePerformanceModalHandle,
} from "./modals/ComparePerformanceModal";
import SimilarityAnalysisModal, {
  type SimilarityAnalysisModalHandle,
} from "./modals/SimilarityAnalysisModal";
import { ProgramChips } from "./ProgramChips";

interface SelectedProgramsPanelProps {
  dbPath: string | null;
  programs?: Program[];
  onOpenCompareDiff?: () => void;
  onDetails?: () => void;
  onCode?: () => void;
  onSuggest?: () => void;
  onCodeChange?: () => void;
  onMerge?: () => void;
  onFilter?: () => void;
  showFilter?: boolean;
  onRemoveFilter?: () => void;
  hasFilter?: boolean;
  onBanNodes?: (ids: string[]) => void;
  onUnbanNodes?: (ids: string[]) => void;
  bannedNodeIds?: Set<string>;
}

interface Snapshot {
  id: number;
  programs: Program[];
  key: string;
}

export default function SelectedProgramsPanel({
  onOpenCompareDiff,
  onDetails,
  onCode,
  onSuggest,
  onCodeChange,
  onMerge,
  onFilter,
  showFilter,
  onRemoveFilter,
  hasFilter,
  onBanNodes,
  onUnbanNodes,
  bannedNodeIds,
}: SelectedProgramsPanelProps) {
  const { t } = useI18n();
  const { state, toggleMergeSelect, clearMergeSelection } = useEvolveShell();
  const { mergeSelection } = state;

  // Refs to modal instance handles to call `bringToFront()`
  const perfModalRefs = useRef<
    Map<number, ComparePerformanceModalHandle | null>
  >(new Map());
  const simModalRefs = useRef<
    Map<number, SimilarityAnalysisModalHandle | null>
  >(new Map());

  // Each click spawns an independent modal with a snapshot of the current selection.
  const [perfSnapshots, setPerfSnapshots] = useState<Snapshot[]>([]);
  const [simSnapshots, setSimSnapshots] = useState<Snapshot[]>([]);
  const nextId = useRef(0);

  const getSnapshotKey = (programs: Program[]) => {
    return programs
      .map((p) => p.id)
      .sort()
      .join(",");
  };

  const openPerf = () => {
    const key = getSnapshotKey(mergeSelection);
    const existing = perfSnapshots.find((s) => s.key === key);
    if (existing) {
      perfModalRefs.current.get(existing.id)?.bringToFront();
      return;
    }

    const id = nextId.current++;
    setPerfSnapshots((prev) => [
      ...prev,
      { id, programs: [...mergeSelection], key },
    ]);
  };
  const closePerf = (id: number) => {
    perfModalRefs.current.delete(id);
    setPerfSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  const openSim = () => {
    const key = getSnapshotKey(mergeSelection);
    const existing = simSnapshots.find((s) => s.key === key);
    if (existing) {
      simModalRefs.current.get(existing.id)?.bringToFront();
      return;
    }

    const id = nextId.current++;
    setSimSnapshots((prev) => [
      ...prev,
      { id, programs: [...mergeSelection], key },
    ]);
  };
  const closeSim = (id: number) => {
    simModalRefs.current.delete(id);
    setSimSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  // Single hook instance — position is preserved when the selection count changes.
  const { panelRef, panelStyle, dragHandlers, resizeHandles, bringToFront } =
    useResizablePanel({
      defaultW: 500,
      defaultH: 260,
      minW: 360,
      minH: 160,
      initialPos: (w, h) => ({
        x: Math.round((window.innerWidth - w) / 2),
        y: window.innerHeight - h - 20,
      }),
    });

  if (
    mergeSelection.length === 0 &&
    perfSnapshots.length === 0 &&
    simSnapshots.length === 0
  )
    return null;

  return (
    <>
      <div
        ref={panelRef}
        className="bg-white border border-purple-300 rounded-xl shadow-xl flex flex-col"
        style={{
          ...panelStyle,
          display: mergeSelection.length === 0 ? "none" : undefined,
        }}
        onPointerDownCapture={bringToFront}
      >
        {/* Header / drag handle */}
        <div
          className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
          {...dragHandlers}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
            <GripHorizontal className="w-4 h-4 text-purple-400" />
            {t("selection.title")} ({mergeSelection.length}/5)
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100"
            title={t("selection.clear")}
            onClick={clearMergeSelection}
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-500">{t("selection.help")}</p>

          <ProgramChips
            programs={mergeSelection}
            onRemove={toggleMergeSelect}
          />

          {/* ── View section (1 node only) ── */}
          {mergeSelection.length === 1 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <Eye className="w-3 h-3" />
                {t("common.view")}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                  onClick={onDetails}
                >
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  {t("common.details")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                  onClick={onCode}
                >
                  <FileCode2 className="w-3.5 h-3.5 text-green-600" />
                  {t("common.code")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                  onClick={onCodeChange}
                >
                  <FileCode2 className="w-3.5 h-3.5 text-orange-600" />
                  {t("common.codeChange")}
                </button>
                {showFilter && onFilter && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-indigo-50"
                    onClick={onFilter}
                  >
                    <Filter className="w-3.5 h-3.5 text-indigo-500" />
                    {t("common.filter")}
                  </button>
                )}
                {hasFilter && onRemoveFilter && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-red-50"
                    onClick={onRemoveFilter}
                  >
                    <FilterX className="w-3.5 h-3.5 text-red-500" />
                    {t("common.removeFilter")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Compare section (2+ nodes) ── */}
          {mergeSelection.length >= 2 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <GitCompare className="w-3 h-3" />
                {t("common.compare")}
              </div>
              <div className="flex flex-wrap gap-2">
                {mergeSelection.length === 2 && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                    onClick={onOpenCompareDiff}
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
                    {t("common.codeDiff")}
                  </button>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                  onClick={openPerf}
                >
                  <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
                  {t("common.performance")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-indigo-50"
                  onClick={openSim}
                >
                  <Network className="w-3.5 h-3.5 text-indigo-500" />
                  {t("common.dissimilarities")}
                </button>
              </div>
            </div>
          )}

          {/* ── Modify section ── */}
          {
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <Pencil className="w-3 h-3" />
                {t("common.modify")}
              </div>
              <div className="flex flex-wrap gap-2">
                {mergeSelection.length === 1 &&
                  !bannedNodeIds?.has(mergeSelection[0].id) && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                      onClick={onSuggest}
                    >
                      <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
                      {t("common.suggest")}
                    </button>
                  )}
                {mergeSelection.length <= 2 &&
                  !mergeSelection.some((p) => bannedNodeIds?.has(p.id)) && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-teal-50"
                      onClick={onMerge}
                    >
                      <GitMerge className="w-3.5 h-3.5 text-teal-600" />
                      {t("common.merge")}
                    </button>
                  )}
                {(() => {
                  if (!bannedNodeIds || !onBanNodes || !onUnbanNodes)
                    return null;
                  const ids = mergeSelection.map((p) => p.id);
                  const bannedCount = ids.filter((id) =>
                    bannedNodeIds.has(id),
                  ).length;
                  const allBanned = bannedCount === ids.length;
                  const noneBanned = bannedCount === 0;
                  return (
                    <>
                      {!allBanned && (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-red-50"
                          onClick={() =>
                            onBanNodes(
                              ids.filter((id) => !bannedNodeIds.has(id)),
                            )
                          }
                        >
                          <Ban className="w-3.5 h-3.5 text-red-500" />
                          {t("common.ban")}
                        </button>
                      )}
                      {!noneBanned && (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-red-50"
                          onClick={() =>
                            onUnbanNodes(
                              ids.filter((id) => bannedNodeIds.has(id)),
                            )
                          }
                        >
                          <Ban className="w-3.5 h-3.5 text-gray-500" />
                          {t("common.unban")}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          }
        </div>

        {resizeHandles}
      </div>

      {perfSnapshots.map((snap) => (
        <ComparePerformanceModal
          key={snap.id}
          ref={(el) => {
            perfModalRefs.current.set(snap.id, el);
          }}
          programs={snap.programs}
          onClose={() => closePerf(snap.id)}
        />
      ))}
      {simSnapshots.map((snap) => (
        <SimilarityAnalysisModal
          key={snap.id}
          ref={(el) => {
            simModalRefs.current.set(snap.id, el);
          }}
          programs={snap.programs}
          onClose={() => closeSim(snap.id)}
        />
      ))}
    </>
  );
}
