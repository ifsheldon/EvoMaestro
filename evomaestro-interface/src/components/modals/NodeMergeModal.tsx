"use client";

import {
  BarChart2,
  FileCode2,
  GitCompare,
  GitMerge,
  GripHorizontal,
  Network,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import { submitMerge } from "@/lib/api";
import type { Program } from "@/types";
import { computeMergeRecommendations } from "@/utils/mergeRecommendations";
import { resolveMergeRecommendationWeights } from "@/utils/mergeRecommendationWeights";
import { ProgramChips } from "../ProgramChips";
import ComparePerformanceModal, {
  type ComparePerformanceModalHandle,
} from "./ComparePerformanceModal";
import SimilarityAnalysisModal, {
  type SimilarityAnalysisModalHandle,
} from "./SimilarityAnalysisModal";

interface NodeMergeModalProps {
  dbPath: string | null;
  programs?: Program[];
  initialPrograms: Program[];
  onOpenCompareDiff?: (pair: [Program, Program]) => void;
  onClose: () => void;
}

interface Snapshot {
  id: number;
  programs: Program[];
  key: string;
}

export default function NodeMergeModal({
  dbPath,
  programs,
  initialPrograms,
  onOpenCompareDiff,
  onClose,
}: NodeMergeModalProps) {
  const { t } = useI18n();
  const {
    readOnly,
    setRecommendedPartners,
    setMergeModalPrograms,
    highlightProgram,
    state: { settings, bannedNodeIds },
  } = useEvolveShell();

  // Internal selection (independent of mergeSelection in context)
  const [selected, setSelected] = useState<Program[]>(initialPrograms);

  const addProgram = useCallback((prog: Program) => {
    setSelected((prev) => {
      if (prev.length >= 2) return prev;
      if (prev.some((p) => p.id === prog.id)) return prev;
      return [...prev, prog];
    });
  }, []);

  const removeProgram = useCallback((prog: Program) => {
    setSelected((prev) => prev.filter((p) => p.id !== prog.id));
  }, []);

  // Merge state
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // ── Merge partner recommendations (only when 1 node selected) ──
  const singleSelected = selected.length === 1 ? selected[0] : null;
  const excludeIds = useMemo(
    () => new Set([...selected.map((p) => p.id), ...bannedNodeIds]),
    [selected, bannedNodeIds],
  );
  const recommendations = useMemo(() => {
    if (!singleSelected || !programs || programs.length === 0) return [];
    return computeMergeRecommendations(singleSelected, programs, excludeIds, {
      topN: 5,
      diversityWeight: settings.mergeDiversityWeight,
      embeddingSource: settings.embeddingSource,
    });
  }, [
    singleSelected,
    programs,
    excludeIds,
    settings.embeddingSource,
    settings.mergeDiversityWeight,
  ]);

  const hasEmbeddings = recommendations.some(
    (recommendation) => recommendation.usesEmbeddingDiversity,
  );
  const mergeWeights = resolveMergeRecommendationWeights(
    settings.mergeDiversityWeight,
  );
  const mergeWeightSummary = t("settings.mergeWeightSummary", {
    quality: Math.round(mergeWeights.quality * 100),
    diversity: Math.round(mergeWeights.diversity * 100),
  });

  // Sync selected IDs to context for green bubble rings on tree
  useEffect(() => {
    setMergeModalPrograms(selected.map((p) => p.id));
    return () => {
      setMergeModalPrograms([]);
      highlightProgram(null);
    };
  }, [selected, setMergeModalPrograms, highlightProgram]);

  // Sync recommended IDs to context for tree visualization highlights
  useEffect(() => {
    const ids = recommendations.map((r) => r.program.id);
    setRecommendedPartners(ids);
    return () => setRecommendedPartners([]);
  }, [recommendations, setRecommendedPartners]);

  // Auto-close when selection drops to 0
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (selected.length === 0) {
      onCloseRef.current();
    }
  }, [selected.length]);

  // ── Comparison snapshots ──
  const perfModalRefs = useRef<
    Map<number, ComparePerformanceModalHandle | null>
  >(new Map());
  const simModalRefs = useRef<
    Map<number, SimilarityAnalysisModalHandle | null>
  >(new Map());
  const [perfSnapshots, setPerfSnapshots] = useState<Snapshot[]>([]);
  const [simSnapshots, setSimSnapshots] = useState<Snapshot[]>([]);
  const nextId = useRef(0);

  const getSnapshotKey = useCallback(
    (progs: Program[]) =>
      progs
        .map((p) => p.id)
        .sort()
        .join(","),
    [],
  );

  const openPerf = useCallback(() => {
    const key = getSnapshotKey(selected);
    const existing = perfSnapshots.find((s) => s.key === key);
    if (existing) {
      perfModalRefs.current.get(existing.id)?.bringToFront();
      return;
    }
    const id = nextId.current++;
    setPerfSnapshots((prev) => [...prev, { id, programs: [...selected], key }]);
  }, [selected, perfSnapshots, getSnapshotKey]);

  const closePerf = (id: number) => {
    perfModalRefs.current.delete(id);
    setPerfSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  const openSim = useCallback(() => {
    const key = getSnapshotKey(selected);
    const existing = simSnapshots.find((s) => s.key === key);
    if (existing) {
      simModalRefs.current.get(existing.id)?.bringToFront();
      return;
    }
    const id = nextId.current++;
    setSimSnapshots((prev) => [...prev, { id, programs: [...selected], key }]);
  }, [selected, simSnapshots, getSnapshotKey]);

  const closeSim = (id: number) => {
    simModalRefs.current.delete(id);
    setSimSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  // Two independent hook instances (1-node vs 2-node views).
  const initialPos = (w: number, h: number) => ({
    x: Math.round((window.innerWidth - w) / 2) + 40,
    y: window.innerHeight - h - 60,
  });
  const hook1 = useResizablePanel({
    defaultW: 520,
    defaultH: 400,
    minW: 360,
    minH: 200,
    initialPos,
  });
  const hook2 = useResizablePanel({
    defaultW: 520,
    defaultH: 340,
    minW: 380,
    minH: 200,
    initialPos,
  });

  const tier = selected.length <= 1 ? 0 : 1;
  // biome-ignore lint/style/noNonNullAssertion: tier is always 0 or 1, array has exactly 2 elements
  const { panelRef, panelStyle, dragHandlers, resizeHandles, bringToFront } = [
    hook1,
    hook2,
  ][tier]!;

  const { showToast } = useToast();
  const canMerge = !readOnly && selected.length === 2 && !submitting && dbPath;

  const handleMerge = async () => {
    if (!canMerge) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitMerge(
        dbPath,
        selected.map((p) => p.id),
        prompt.trim(),
      );
      showToast(t("merge.submittedToast"));
      setFeedback(t("merge.submitted"));
      setPrompt("");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message =
        raw.includes("Failed to fetch") || raw.includes("NetworkError")
          ? t("errors.backendUnavailable")
          : raw;
      setFeedback(`${t("common.error")}: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        ref={panelRef}
        className="bg-white border border-teal-300 rounded-xl shadow-xl flex flex-col"
        style={panelStyle}
        onPointerDownCapture={bringToFront}
      >
        {/* Header / drag handle */}
        <div
          className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
          {...dragHandlers}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <GripHorizontal className="w-4 h-4 text-teal-400" />
            <GitMerge className="w-4 h-4" />
            {t("common.merge")}
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100"
            title={t("common.close")}
            onClick={onClose}
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-3">
          <ProgramChips
            programs={selected}
            variant="teal"
            onRemove={removeProgram}
          />

          {/* ── 1 node: Recommended merge partners ── */}
          {selected.length === 1 && (
            <div className="border border-teal-200 rounded-lg p-3 bg-teal-50/30">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-teal-800">
                  <GitMerge className="w-3.5 h-3.5" />
                  {t("merge.recommendedPartners")}
                </div>
                <span className="text-[10px] text-gray-500 tabular-nums text-right">
                  {hasEmbeddings ? mergeWeightSummary : t("merge.qualityOnly")}
                </span>
              </div>
              {recommendations.length === 0 ? (
                <p className="text-xs text-gray-400">{t("merge.noPartners")}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {/* Column headers */}
                  <div className="flex items-center text-[10px] text-gray-400 pb-0.5">
                    <span className="flex-1" />
                    <span
                      className="w-14 text-center cursor-help"
                      title={t("merge.qualityHelp")}
                    >
                      {t("merge.quality")}
                    </span>
                    {hasEmbeddings && (
                      <span
                        className="w-14 text-center cursor-help"
                        title={t("merge.diversityHelp")}
                      >
                        {t("merge.diversity")}
                      </span>
                    )}
                    <span
                      className="w-14 text-center cursor-help"
                      title={t("merge.rankingScoreHelp")}
                    >
                      {t("merge.rankingScore")}
                    </span>
                    <span className="w-7 shrink-0" />
                  </div>
                  {recommendations.map((rec, i) => (
                    <div
                      key={rec.program.id}
                      className="flex items-center text-xs bg-white rounded py-1 border border-gray-100"
                    >
                      <span className="text-gray-400 w-5 shrink-0 text-center font-mono">
                        {i + 1}
                      </span>
                      <ProgramChips
                        programs={[rec.program]}
                        variant="teal"
                        className="flex-1 !gap-1"
                      />
                      <span className="w-14 text-center text-gray-500 tabular-nums shrink-0">
                        {rec.qualityScore.toFixed(2)}
                      </span>
                      {hasEmbeddings && (
                        <span className="w-14 text-center text-teal-600 tabular-nums shrink-0">
                          {rec.diversityScore.toFixed(2)}
                        </span>
                      )}
                      <span className="w-14 text-center text-indigo-600 font-medium tabular-nums shrink-0">
                        {rec.score.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        className="w-7 h-6 flex items-center justify-center rounded bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 shrink-0"
                        title={t("merge.addSelection")}
                        onClick={() => addProgram(rec.program)}
                      >
                        +
                      </button>
                    </div>
                  ))}
                  {!hasEmbeddings && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {t("merge.noEmbeddings")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 2 nodes: merge + compare ── */}
          {selected.length === 2 && (
            <div className="flex flex-col gap-3">
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">
                  <GitMerge className="w-3.5 h-3.5" />
                  {t("merge.programs")}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder={t("merge.guidancePlaceholder")}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={submitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canMerge) void handleMerge();
                    }}
                  />
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => void handleMerge()}
                    disabled={!canMerge}
                  >
                    <Send className="w-3 h-3" />
                    {submitting ? t("merge.merging") : t("common.merge")}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">
                  <GitCompare className="w-3.5 h-3.5" />
                  {t("merge.comparePrograms")}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs hover:bg-blue-50"
                    onClick={() =>
                      onOpenCompareDiff?.([selected[0], selected[1]])
                    }
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
                    {t("common.codeDiff")}
                  </button>
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
                    {t("merge.similarities")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <p
              className={`text-xs ${
                feedback.startsWith(t("common.error"))
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {feedback}
            </p>
          )}
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
