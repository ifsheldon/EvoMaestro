"use client";

import { clsx } from "clsx";
import { GripHorizontal, HelpCircle, Loader2, Settings, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useI18n } from "@/i18n";
import {
  getReviewPrioritizationSettings,
  type ReviewPrioritizationSettings,
  updateReviewPrioritizationSettings,
} from "@/lib/api";
import {
  DEFAULT_MERGE_DIVERSITY_WEIGHT,
  MAX_MERGE_DIVERSITY_WEIGHT,
  MERGE_DIVERSITY_WEIGHT_STEP,
  MIN_MERGE_DIVERSITY_WEIGHT,
  normalizeMergeDiversityWeight,
  resolveMergeRecommendationWeights,
} from "@/utils/mergeRecommendationWeights";

interface SettingsModalProps {
  onClose: () => void;
  hasReasoningEmbeddings?: boolean;
  hasErrorNodes?: boolean;
  hasTimeoutNodes?: boolean;
  hasCrossNodes?: boolean;
  dbPath?: string;
}

/** Clickable "?" icon that toggles an inline description */
function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClick, true);
    return () => document.removeEventListener("pointerdown", handleClick, true);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center ml-1">
      <button
        type="button"
        className="text-gray-400 hover:text-gray-600 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute left-5 top-1/2 -translate-y-1/2 z-50 w-52 px-2.5 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  description?: string;
  disabled?: boolean;
}

const Toggle = ({
  label,
  checked,
  onChange,
  description,
  disabled,
}: ToggleProps) => (
  <div
    className={`flex items-center justify-between py-3 ${disabled ? "opacity-50" : ""}`}
  >
    <div className="flex-1 pr-4 flex items-center">
      <span className="text-sm font-medium text-gray-700 cursor-default">
        {label}
      </span>
      {description && <HelpTip text={description} />}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ring-offset-2 focus:ring-2 focus:ring-blue-500 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ${checked && !disabled ? "bg-blue-600" : "bg-gray-200"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked && !disabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);

export default function SettingsModal({
  onClose,
  hasReasoningEmbeddings = true,
  hasErrorNodes = true,
  hasTimeoutNodes = true,
  hasCrossNodes = true,
  dbPath,
}: SettingsModalProps) {
  const { t } = useI18n();
  const { state, readOnly, updateSettings, dispatch } = useEvolveShell();
  const { settings } = state;
  const mergeWeights = resolveMergeRecommendationWeights(
    settings.mergeDiversityWeight,
  );
  const mergeQualityPercent = Math.round(mergeWeights.quality * 100);
  const mergeDiversityPercent = Math.round(mergeWeights.diversity * 100);
  const mergeWeightSummary = t("settings.mergeWeightSummary", {
    quality: mergeQualityPercent,
    diversity: mergeDiversityPercent,
  });

  // Review Prioritization settings state
  const [reviewPrioritizationSettings, setReviewPrioritizationSettings] =
    useState<ReviewPrioritizationSettings | null>(null);
  const [reviewPrioritizationLoading, setReviewPrioritizationLoading] =
    useState(false);
  const [reviewPrioritizationApplying, setReviewPrioritizationApplying] =
    useState(false);
  const [reviewPrioritizationError, setReviewPrioritizationError] = useState<
    string | null
  >(null);

  // Local draft state for review-prioritization settings.
  const [reviewPrioritizationDraft, setReviewPrioritizationDraft] =
    useState<Omit<ReviewPrioritizationSettings, "is_custom"> | null>(null);

  useEffect(() => {
    if (!dbPath) return;
    setReviewPrioritizationLoading(true);
    getReviewPrioritizationSettings(dbPath)
      .then((s) => {
        setReviewPrioritizationSettings(s);
        const { is_custom: _, ...rest } = s;
        setReviewPrioritizationDraft(rest);
      })
      .catch((err) => setReviewPrioritizationError(String(err)))
      .finally(() => setReviewPrioritizationLoading(false));
  }, [dbPath]);

  const handleReviewPrioritizationApply = useCallback(async () => {
    if (readOnly || !dbPath || !reviewPrioritizationDraft) return;
    setReviewPrioritizationApplying(true);
    setReviewPrioritizationError(null);
    try {
      await updateReviewPrioritizationSettings(dbPath, {
        ...reviewPrioritizationDraft,
        dissimilarity_embedding: settings.embeddingSource,
      });
      // Trigger a program data reload so the tree reflects new review priority levels
      dispatch({ type: "TRIGGER_RELOAD" });
    } catch (err) {
      setReviewPrioritizationError(String(err));
    } finally {
      setReviewPrioritizationApplying(false);
    }
  }, [
    dbPath,
    readOnly,
    reviewPrioritizationDraft,
    settings.embeddingSource,
    dispatch,
  ]);

  const { panelRef, panelStyle, dragHandlers, resizeHandles } =
    useResizablePanel({
      defaultW: 400,
      defaultH: 450,
      minW: 300,
      minH: 350,
      memoryKey: "settings-modal",
      initialPos: (w) => ({
        x: window.innerWidth - w - 20,
        y: 80,
      }),
    });

  return (
    <div
      ref={panelRef}
      data-tour="settings-modal"
      className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-2xl flex flex-col ring-1 ring-black/5"
      style={panelStyle}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 bg-gray-50/50 rounded-t-xl flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <GripHorizontal className="w-4 h-4 text-gray-400" />
          <Settings className="w-4 h-4 text-gray-500" />
          {t("common.settings")}
        </div>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-gray-200/50 text-gray-500 transition-colors"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6">
        {/* Nodes Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.nodesLinks")}
          </h3>
          <div className="divide-y divide-gray-50">
            <Toggle
              label={t("settings.showErrorNodes")}
              checked={settings.showErrorNodes}
              onChange={(val) => updateSettings({ showErrorNodes: val })}
              description={
                hasErrorNodes
                  ? t("settings.showErrorNodesHelp")
                  : t("settings.noErrorNodes")
              }
              disabled={!hasErrorNodes}
            />
            <Toggle
              label={t("settings.showTimeoutNodes")}
              checked={settings.showTimeoutNodes}
              onChange={(val) => updateSettings({ showTimeoutNodes: val })}
              description={
                hasTimeoutNodes
                  ? t("settings.showTimeoutNodesHelp")
                  : t("settings.noTimeoutNodes")
              }
              disabled={!hasTimeoutNodes}
            />
            <Toggle
              label={t("settings.showCrossoverLinks")}
              checked={settings.showCrossLinks}
              onChange={(val) => updateSettings({ showCrossLinks: val })}
              description={
                hasCrossNodes
                  ? t("settings.showCrossoverLinksHelp")
                  : t("settings.noCrossoverNodes")
              }
              disabled={!hasCrossNodes}
            />
            <Toggle
              label={t("settings.unifyMutationTypes")}
              checked={settings.unifyMutationTypes}
              onChange={(val) => updateSettings({ unifyMutationTypes: val })}
              description={t("settings.unifyMutationTypesHelp")}
            />
            <Toggle
              label={t("settings.scoreChangeIndicator")}
              checked={settings.showScoreChangeIndicator}
              onChange={(val) =>
                updateSettings({ showScoreChangeIndicator: val })
              }
              description={t("settings.scoreChangeIndicatorHelp")}
            />
          </div>
        </section>

        {/* Statistics Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.statistics")}
          </h3>
          <div className="divide-y divide-gray-50">
            <Toggle
              label={t("settings.includeErrorNodes")}
              checked={settings.includeErrorInStats}
              onChange={(val) => updateSettings({ includeErrorInStats: val })}
              description={t("settings.includeErrorNodesHelp")}
              disabled={!settings.showErrorNodes}
            />
            <Toggle
              label={t("settings.includeTimeoutNodes")}
              checked={settings.includeTimeoutInStats}
              onChange={(val) => updateSettings({ includeTimeoutInStats: val })}
              description={t("settings.includeTimeoutNodesHelp")}
              disabled={!settings.showTimeoutNodes}
            />
          </div>
        </section>

        {/* Layout Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.layout")}
          </h3>
          <div className="divide-y divide-gray-50">
            <Toggle
              label={t("settings.proportionalSectors")}
              checked={settings.proportionalSectors}
              onChange={(val) => updateSettings({ proportionalSectors: val })}
              description={t("settings.proportionalSectorsHelp")}
            />
          </div>
        </section>

        {/* Embeddings Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.dissimilarityAnalysis")}
          </h3>
          <div className="py-3">
            <span className="text-sm font-medium text-gray-700 mb-2 cursor-default flex items-center">
              {t("settings.embeddingSource")}
              <HelpTip text={t("settings.embeddingSourceHelp")} />
            </span>
            <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { value: "code", label: t("common.code") },
                  { value: "reasoning", label: t("settings.reasoning") },
                ] as const
              ).map((opt) => {
                const disabled =
                  opt.value === "reasoning" && !hasReasoningEmbeddings;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={clsx(
                      "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                      settings.embeddingSource === opt.value
                        ? "bg-gray-900 text-white shadow-sm"
                        : disabled
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-600 hover:bg-gray-100",
                    )}
                    disabled={disabled}
                    aria-label={
                      disabled ? t("settings.noReasoningEmbeddings") : undefined
                    }
                    onClick={() =>
                      updateSettings({ embeddingSource: opt.value })
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="py-3 border-t border-gray-50">
            <span className="text-sm font-medium text-gray-700 mb-2 cursor-default flex items-center">
              {t("settings.chordThreshold")}:{" "}
              {settings.dissimilarityThreshold.toFixed(2)}
              <HelpTip text={t("settings.chordThresholdHelp")} />
            </span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={settings.dissimilarityThreshold}
              onChange={(e) =>
                updateSettings({
                  dissimilarityThreshold: Number.parseFloat(e.target.value),
                })
              }
              className="w-full accent-gray-900"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{t("settings.showAllThreshold")}</span>
              <span>{t("settings.hideAllThreshold")}</span>
            </div>
          </div>
        </section>

        {/* Merge Recommendations Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.mergeRecommendations")}
          </h3>
          <div className="py-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <span className="text-sm font-medium text-gray-700 cursor-default flex items-center">
                {t("settings.mergeBalance")}
                <HelpTip text={t("settings.mergeBalanceHelp")} />
              </span>
              <span
                data-testid="merge-weight-value"
                className="text-xs font-medium text-gray-500 tabular-nums text-right"
              >
                {mergeWeightSummary}
              </span>
            </div>
            <input
              data-testid="merge-diversity-weight"
              type="range"
              min={MIN_MERGE_DIVERSITY_WEIGHT}
              max={MAX_MERGE_DIVERSITY_WEIGHT}
              step={MERGE_DIVERSITY_WEIGHT_STEP}
              value={mergeWeights.diversity}
              aria-label={t("settings.mergeBalance")}
              aria-valuetext={mergeWeightSummary}
              onChange={(event) =>
                updateSettings({
                  mergeDiversityWeight: normalizeMergeDiversityWeight(
                    Number.parseFloat(event.target.value),
                  ),
                })
              }
              className="w-full accent-gray-900"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <button
                type="button"
                className="hover:text-gray-900 hover:underline"
                onClick={() =>
                  updateSettings({
                    mergeDiversityWeight: MIN_MERGE_DIVERSITY_WEIGHT,
                  })
                }
              >
                {t("settings.programQuality")}
              </button>
              <button
                type="button"
                className="hover:text-gray-900 hover:underline"
                onClick={() =>
                  updateSettings({
                    mergeDiversityWeight: DEFAULT_MERGE_DIVERSITY_WEIGHT,
                  })
                }
              >
                {t("settings.defaultMergeBalance")}
              </button>
              <button
                type="button"
                className="hover:text-gray-900 hover:underline"
                onClick={() =>
                  updateSettings({
                    mergeDiversityWeight: MAX_MERGE_DIVERSITY_WEIGHT,
                  })
                }
              >
                {t("settings.ideaDiversity")}
              </button>
            </div>
          </div>
        </section>

        {/* Tree View Section */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
            {t("settings.treeView")}
          </h3>
          <div className="py-3">
            <span className="text-sm font-medium text-gray-700 mb-2 cursor-default flex items-center">
              {t("settings.colorMap")}
              <HelpTip text={t("settings.colorMapHelp")} />
            </span>
            <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { value: "blues", label: t("settings.blues") },
                  { value: "viridis", label: t("settings.viridis") },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={clsx(
                    "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    settings.colorMap === opt.value
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                  onClick={() => updateSettings({ colorMap: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="py-3 border-t border-gray-50">
            <span className="text-sm font-medium text-gray-700 mb-2 cursor-default flex items-center">
              {t("settings.colorMidpoint")}
              <HelpTip text={t("settings.colorMidpointHelp")} />
            </span>
            <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { value: "median", label: t("settings.median") },
                  { value: "average", label: t("settings.average") },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={clsx(
                    "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    settings.colorMidpoint === opt.value
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                  onClick={() => updateSettings({ colorMidpoint: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Expert Review Prioritization */}
        {dbPath && (
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-50 pb-1">
              {t("settings.reviewPrioritization")}
            </h3>
            {reviewPrioritizationLoading && (
              <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("settings.loadingSettings")}
              </div>
            )}
            {reviewPrioritizationSettings?.is_custom && (
              <p className="py-3 text-sm text-gray-400 italic">
                {t("settings.customReviewPrioritization")}
              </p>
            )}
            {reviewPrioritizationDraft &&
              !reviewPrioritizationSettings?.is_custom &&
              !reviewPrioritizationLoading && (
                <div className="space-y-3">
                  {/* Mode selector */}
                  <div className="py-3">
                    <span className="text-sm font-medium text-gray-700 mb-2 cursor-default flex items-center">
                      {t("settings.mode")}
                      <HelpTip text={t("settings.modeHelp")} />
                    </span>
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
                      {(
                        [
                          {
                            value: "score_change",
                            label: t("settings.scoreChange"),
                          },
                          {
                            value: "dissimilarity",
                            label: t("settings.dissimilarity"),
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={clsx(
                            "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                            reviewPrioritizationDraft.mode === opt.value
                              ? "bg-gray-900 text-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-100",
                          )}
                          onClick={() =>
                            setReviewPrioritizationDraft(
                              (d) => d && { ...d, mode: opt.value },
                            )
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Score Change thresholds */}
                  {reviewPrioritizationDraft.mode === "score_change" && (
                    <div className="space-y-2 py-2 border-t border-gray-50">
                      <div>
                        <label
                          htmlFor="score-moderate-threshold"
                          className="text-sm text-gray-600 flex items-center"
                        >
                          {t("settings.moderateThreshold")}
                          <HelpTip text={t("settings.scoreModerateHelp")} />
                        </label>
                        <input
                          id="score-moderate-threshold"
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={
                            reviewPrioritizationDraft.score_change_moderate
                          }
                          onChange={(e) =>
                            setReviewPrioritizationDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  score_change_moderate:
                                    Number.parseFloat(e.target.value) || 0,
                                },
                            )
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="score-high-threshold"
                          className="text-sm text-gray-600 flex items-center"
                        >
                          {t("settings.highThreshold")}
                          <HelpTip text={t("settings.scoreHighHelp")} />
                        </label>
                        <input
                          id="score-high-threshold"
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={reviewPrioritizationDraft.score_change_high}
                          onChange={(e) =>
                            setReviewPrioritizationDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  score_change_high:
                                    Number.parseFloat(e.target.value) || 0,
                                },
                            )
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Dissimilarity thresholds */}
                  {reviewPrioritizationDraft.mode === "dissimilarity" && (
                    <div className="space-y-2 py-2 border-t border-gray-50">
                      <p className="text-xs text-gray-500 italic">
                        {t("settings.usesEmbeddingSource", {
                          source:
                            settings.embeddingSource === "reasoning"
                              ? t("settings.reasoning")
                              : t("common.code"),
                        })}
                      </p>
                      <div>
                        <label
                          htmlFor="dissimilarity-moderate-threshold"
                          className="text-sm text-gray-600 flex items-center"
                        >
                          {t("settings.moderateThreshold")}
                          <HelpTip
                            text={t("settings.dissimilarityModerateHelp")}
                          />
                        </label>
                        <input
                          id="dissimilarity-moderate-threshold"
                          type="number"
                          step="0.01"
                          min="0"
                          max="2"
                          value={
                            reviewPrioritizationDraft.dissimilarity_moderate
                          }
                          onChange={(e) =>
                            setReviewPrioritizationDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  dissimilarity_moderate:
                                    Number.parseFloat(e.target.value) || 0,
                                },
                            )
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="dissimilarity-high-threshold"
                          className="text-sm text-gray-600 flex items-center"
                        >
                          {t("settings.highThreshold")}
                          <HelpTip text={t("settings.dissimilarityHighHelp")} />
                        </label>
                        <input
                          id="dissimilarity-high-threshold"
                          type="number"
                          step="0.01"
                          min="0"
                          max="2"
                          value={reviewPrioritizationDraft.dissimilarity_high}
                          onChange={(e) =>
                            setReviewPrioritizationDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  dissimilarity_high:
                                    Number.parseFloat(e.target.value) || 0,
                                },
                            )
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {reviewPrioritizationError && (
                    <p className="text-xs text-red-500">
                      {reviewPrioritizationError}
                    </p>
                  )}

                  {/* Apply button */}
                  <button
                    type="button"
                    disabled={readOnly || reviewPrioritizationApplying}
                    onClick={handleReviewPrioritizationApply}
                    className={clsx(
                      "w-full rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      reviewPrioritizationApplying
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-gray-900 text-white hover:bg-gray-800",
                    )}
                  >
                    {reviewPrioritizationApplying ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t("settings.applying")}
                      </span>
                    ) : (
                      t("common.apply")
                    )}
                  </button>
                </div>
              )}
          </section>
        )}
      </div>

      {resizeHandles}
    </div>
  );
}
