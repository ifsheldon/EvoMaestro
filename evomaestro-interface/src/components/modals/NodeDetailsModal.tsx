"use client";

import { clsx } from "clsx";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  HelpCircle,
  MessageSquare,
  Terminal,
  X,
} from "lucide-react";
import { marked } from "marked";
import type React from "react";
import { useEffect, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { translatePatchType, useI18n } from "@/i18n";
import type { JsonObject, Program } from "@/types";
import {
  formatTimestamp,
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import { ProgramChips } from "../ProgramChips";
import { EvaluationView } from "../views/EvaluationView";
import { PromptView } from "../views/PromptView";

marked.setOptions({ breaks: true });

interface NodeDetailsModalProps {
  program: Program;
  allPrograms: Program[];
  usesCustomReviewPrioritization?: boolean;
  /** If set, the modal opens on this tab instead of the default "Prompt". */
  initialTab?: string;
  /** Incremented to highlight Review Priority on the Evaluation tab. */
  reviewPriorityHighlight?: number;
  onClose: () => void;
}

type Tab = "Execution" | "Evaluation" | "Prompt";

export function NodeDetailsModal({
  program,
  allPrograms,
  usesCustomReviewPrioritization,
  initialTab,
  reviewPriorityHighlight,
  onClose,
}: NodeDetailsModalProps) {
  const { t } = useI18n();
  const { state: shellState } = useEvolveShell();
  const [activeTab, setActiveTab] = useState<Tab>(
    (initialTab as Tab) ?? "Prompt",
  );

  // Mirrors reviewPriorityHighlight but clears after the
  // animation so that unmount/remount of EvaluationView doesn't re-trigger it.
  const [evalHighlight, setEvalHighlight] = useState(0);
  const [logHighlight, setLogHighlight] = useState(0);

  useEffect(() => {
    if (reviewPriorityHighlight && reviewPriorityHighlight > 0) {
      setActiveTab("Evaluation");
      setEvalHighlight(reviewPriorityHighlight);
    }
  }, [reviewPriorityHighlight]);

  // Clear after animation completes (1.2s) so tab-switching doesn't re-trigger
  useEffect(() => {
    if (evalHighlight > 0) {
      const timer = setTimeout(() => setEvalHighlight(0), 1500);
      return () => clearTimeout(timer);
    }
  }, [evalHighlight]);

  useEffect(() => {
    if (logHighlight > 0) {
      const timer = setTimeout(() => setLogHighlight(0), 1500);
      return () => clearTimeout(timer);
    }
  }, [logHighlight]);

  const { panelRef, panelStyle, dragHandlers, resizeHandles } =
    useResizablePanel({
      defaultW: 400,
      defaultH: 600,
      minW: 320,
      minH: 300,
      memoryKey: program.id,
      initialW: () => {
        const ar = window.innerWidth / window.innerHeight;
        return ar >= 16 / 9
          ? Math.round(window.innerWidth / 5)
          : Math.round(window.innerWidth / 4);
      },
      initialPos: (w) => ({
        x: window.innerWidth - w - 20,
        y: 20,
      }),
    });

  const tabs: Tab[] = ["Prompt", "Evaluation", "Execution"];

  const selectedScore = getProgramScore(program);

  return (
    <div
      ref={panelRef}
      className="bg-white border border-gray-300 rounded-xl shadow-xl flex flex-col"
      style={panelStyle}
    >
      {/* Drag handle header */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-100 flex-shrink-0"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <GripHorizontal className="w-4 h-4 text-gray-400" />
          {t("common.details")}
          <ProgramChips programs={[program]} variant="purple" />
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

      {/* Program Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm flex-shrink-0">
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-gray-600">
          <div>
            <strong>{t("common.score")}:</strong>{" "}
            <span
              className={
                isCorrectProgram(program)
                  ? "text-green-600"
                  : isTimeoutProgram(program)
                    ? "text-amber-500"
                    : "text-red-500"
              }
            >
              {selectedScore != null
                ? selectedScore.toFixed(6)
                : t("details.notAvailable")}
              {!isCorrectProgram(program) &&
                (isTimeoutProgram(program)
                  ? ` - ${t("details.timeout")}`
                  : ` - ${t("common.error")}`)}
            </span>
            {!isCorrectProgram(program) && (
              <button
                type="button"
                className="inline-flex items-center ml-1 text-red-400 hover:text-red-600 transition-colors align-middle"
                title={t("details.viewErrorLogs")}
                onClick={() => {
                  setActiveTab("Evaluation");
                  setLogHighlight((n) => n + 1);
                }}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div>
            <strong>{t("programs.island")}:</strong>{" "}
            {program.island_idx ?? t("details.notAvailable")}
          </div>
          <div>
            <strong>{t("details.patchType")}:</strong> {(() => {
              const pt = program.metadata?.patch_type;
              if (
                shellState.settings.unifyMutationTypes &&
                (pt === "diff" || pt === "full")
              )
                return translatePatchType(t, "mutation");
              return pt ? translatePatchType(t, pt) : t("details.notAvailable");
            })()}
          </div>
          <div>
            <strong>{t("details.timestamp")}:</strong>{" "}
            {formatTimestamp(program.timestamp)}
          </div>
          {program.metadata?.patch_name && (
            <div>
              <strong>{t("details.patchSummary")}:</strong>{" "}
              {program.metadata.patch_name}
            </div>
          )}
          {program.metadata?.patch_description && (
            <PatchDescription
              description={program.metadata.patch_description}
            />
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-gray-100 border-b border-gray-200 items-center flex-shrink-0">
        <div className="flex overflow-x-auto overflow-y-hidden">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "px-4 py-2 text-sm font-medium whitespace-nowrap border-r border-gray-200 flex items-center gap-2",
                activeTab === tab
                  ? "bg-white text-black font-bold border-b-2 border-b-white -mb-px"
                  : "text-gray-600 hover:bg-gray-50",
              )}
            >
              {tab === "Evaluation" && <Terminal size={12} />}
              {tab === "Prompt" && <MessageSquare size={12} />}
              {t(`details.tabs.${tab.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto min-h-0 p-4">
        {activeTab === "Execution" && <ExecutionView program={program} />}

        {activeTab === "Evaluation" && (
          <EvaluationView
            program={program}
            usesCustomReviewPrioritization={usesCustomReviewPrioritization}
            highlightReviewPriority={evalHighlight}
            highlightLogs={logHighlight}
          />
        )}

        {activeTab === "Prompt" && (
          <PromptView program={program} allPrograms={allPrograms} />
        )}
      </div>

      {resizeHandles}
    </div>
  );
}

function ExecutionView({ program }: { program: Program }) {
  const { t } = useI18n();
  const metadataExcludedKeys = new Set([
    "thought",
    "code_analysis_metrics",
    "patch_description",
    "stdout_log",
    "stderr_log",
    "llm_result",
    "patch_type",
    "patch_name",
    "meta_recommendations",
    "novelty_explanation",
    "meta_summary",
    "meta_scratch_pad",
    "diff_summary",
    "source",
    "human_prompt",
  ]);
  const metadataEntries = program.metadata
    ? Object.entries(program.metadata).filter(
        ([key]) => !metadataExcludedKeys.has(key),
      )
    : [];

  const llmParamKeys = ["model_name", "temperature", "max_output_tokens"];
  const costKeys = [
    "compute_time",
    "api_costs",
    "embed_cost",
    "novelty_cost",
    "input_tokens",
    "output_tokens",
    "cost",
    "input_cost",
    "output_cost",
  ];

  const llmResult =
    program.metadata?.llm_result &&
    typeof program.metadata.llm_result === "object" &&
    !Array.isArray(program.metadata.llm_result)
      ? (program.metadata.llm_result as JsonObject)
      : undefined;

  const combinedEntries = [...metadataEntries];
  if (llmResult) {
    for (const key of costKeys) {
      if (
        llmResult[key] !== undefined &&
        !combinedEntries.some(([k]) => k === key)
      ) {
        combinedEntries.push([key, llmResult[key]]);
      }
    }
  }

  const llmParamEntries = combinedEntries.filter(([key]) =>
    llmParamKeys.includes(key),
  );
  const costEntries = combinedEntries.filter(([key]) => costKeys.includes(key));
  const trialEntries = combinedEntries.filter(
    ([key]) => !costKeys.includes(key) && !llmParamKeys.includes(key),
  );

  const thought = program.metadata?.thought;
  const hasThought =
    typeof thought === "string" ? thought.trim().length > 0 : Boolean(thought);

  return (
    <div className="space-y-4">
      {/* Cards Grid */}
      <div className="flex flex-wrap gap-6">
        {/* LLM Parameters Section */}
        <Section
          title={t("details.llmParameters")}
          className="flex-1 min-w-[300px]"
        >
          {llmParamEntries.length === 0 ? (
            <div className="text-sm text-gray-500">
              {t("details.noLlmParameters")}
            </div>
          ) : (
            llmParamEntries.map(([key, value]) => (
              <div key={key} className="text-xs mb-2">
                <div className="font-semibold text-gray-600 mb-1">{key}</div>
                <div className="bg-gray-50 rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* Cost Section */}
        <Section title={t("details.cost")} className="flex-1 min-w-[300px]">
          {costEntries.length === 0 ? (
            <div className="text-sm text-gray-500">
              {t("details.noCostData")}
            </div>
          ) : (
            costEntries.map(([key, value]) => (
              <div key={key} className="text-xs mb-2">
                <div className="font-semibold text-gray-600 mb-1">{key}</div>
                <div className="bg-gray-50 rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* Trials Section */}
        <Section title={t("details.trials")} className="flex-1 min-w-[320px]">
          {trialEntries.length === 0 ? (
            <div className="text-sm text-gray-500">
              {t("details.noTrialData")}
            </div>
          ) : (
            trialEntries.map(([key, value]) => (
              <div key={key} className="text-xs mb-2">
                <div className="font-semibold text-gray-600 mb-1">{key}</div>
                <div className="bg-gray-50 rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>

      {/* Thought Process */}
      {hasThought && (
        <Section title={t("details.thoughtProcess")}>
          <div
            className="prose prose-sm max-w-none"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from trusted program metadata via marked
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(
                typeof thought === "string"
                  ? thought
                  : JSON.stringify(thought, null, 2),
              ),
            }}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white p-3 space-y-2 min-w-0 overflow-hidden ${className || ""}`}
    >
      <h4 className="font-bold text-xs uppercase text-gray-500 border-b border-gray-100 pb-2 mb-2">
        {title}
      </h4>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function PatchDescription({ description }: { description: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <strong>{t("details.patchDescription")}:</strong>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          onClick={() => setExpanded((prev) => !prev)}
          title={expanded ? t("common.collapse") : t("common.expand")}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>
      <div
        className={clsx(
          "mt-1 p-2 text-sm text-gray-700 prose prose-sm max-w-none border border-gray-200 rounded",
          !expanded && "max-h-[9rem] overflow-y-auto",
        )}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from trusted program metadata via marked
        dangerouslySetInnerHTML={{
          __html: marked.parse(description) as string,
        }}
      />
    </div>
  );
}

const renderMarkdown = (value: string): string => {
  const parsed = marked.parse(value);
  return typeof parsed === "string" ? parsed : "";
};
