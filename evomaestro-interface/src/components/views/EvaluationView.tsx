"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { formatScore, isTimeoutProgram } from "@/utils/program";

interface EvaluationViewProps {
  program: Program | null;
  usesCustomReviewPrioritization?: boolean;
  /** Incremented to highlight the Review Priority section. */
  highlightReviewPriority?: number;
  /** Incremented to trigger a highlight animation on STDOUT/STDERR logs. */
  highlightLogs?: number;
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-xs text-gray-700">
      <strong className="text-gray-600">{label}:</strong> {value}
    </div>
  );
}

export function EvaluationView({
  program,
  usesCustomReviewPrioritization,
  highlightReviewPriority,
  highlightLogs,
}: EvaluationViewProps) {
  const { t } = useI18n();
  const reviewPriorityRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightReviewPriority || highlightReviewPriority <= 0) return;
    const el = reviewPriorityRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.classList.remove("review-priority-highlight-flash");
    void el.offsetWidth;
    el.classList.add("review-priority-highlight-flash");
  }, [highlightReviewPriority]);

  useEffect(() => {
    if (!highlightLogs || highlightLogs <= 0) return;
    const el = logsRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.classList.remove("review-priority-highlight-flash");
    void el.offsetWidth;
    el.classList.add("review-priority-highlight-flash");
  }, [highlightLogs]);

  if (!program) {
    return (
      <div className="p-10 text-center text-gray-400">
        {t("evaluation.selectProgram")}
      </div>
    );
  }

  const publicMetrics = program.public_metrics || {};
  const privateMetrics = program.private_metrics || {};

  return (
    <div className="h-full overflow-auto space-y-4 p-4">
      {/* Timeout Banner */}
      {isTimeoutProgram(program) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-sm">
          &#x23F1; {t("evaluation.timedOut")}
        </div>
      )}

      {/* Metrics Section */}
      <div className="space-y-2 pb-4 border-b border-gray-200">
        <h4 className="font-bold text-xs uppercase text-gray-500 mb-2">
          {t("evaluation.metrics")}
        </h4>

        {Object.keys(publicMetrics).length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-500 mb-1">
              {t("evaluation.public")}
            </div>
            {Object.entries(publicMetrics).map(([key, value]) => (
              <Detail key={key} label={key} value={formatScore(value)} />
            ))}
          </div>
        )}

        {/* Private Section */}
        {(Object.keys(privateMetrics).length > 0 || program.text_feedback) && (
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-500 mb-1">
              {t("evaluation.private")}
            </div>
            {Object.entries(privateMetrics).map(([key, value]) => (
              <Detail key={key} label={key} value={formatScore(value)} />
            ))}

            {program.text_feedback && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-semibold text-blue-600">
                  {t("evaluation.textFeedback")}
                </summary>
                <div className="mt-2 bg-blue-50 border-l-4 border-blue-500 p-2 rounded whitespace-pre-wrap">
                  {program.text_feedback}
                </div>
              </details>
            )}
          </div>
        )}

        {Object.keys(publicMetrics).length === 0 &&
          Object.keys(privateMetrics).length === 0 &&
          !program.text_feedback && (
            <div className="text-sm text-gray-500">
              {t("evaluation.noMetrics")}
            </div>
          )}
      </div>

      {/* Review Priority */}
      {program.review_priority_level &&
        program.review_priority_level !== "none" && (
          <div
            ref={reviewPriorityRef}
            className="space-y-2 pb-4 border-b border-gray-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-bold text-xs uppercase text-gray-500">
                {t("common.reviewPriority")}
              </h4>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  program.review_priority_level === "high"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {program.review_priority_level === "high"
                  ? t("reviewPriority.highShort")
                  : t("reviewPriority.moderateShort")}
              </span>
            </div>
            {(() => {
              const nd = program.review_priority_data;
              if (!nd) return null;
              if (usesCustomReviewPrioritization) {
                // Custom prioritization function: show its supporting data.
                return (
                  <pre className="bg-gray-50 border border-gray-200 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(nd, null, 2)}
                  </pre>
                );
              }
              // Default prioritizer: show parsed standard fields.
              return (
                <div className="space-y-1">
                  {typeof nd.reason === "string" && (
                    <Detail label={t("evaluation.reason")} value={nd.reason} />
                  )}
                  {nd.mode === "score_change" && (
                    <>
                      {typeof nd.gain_pct === "number" && (
                        <Detail
                          label={t("evaluation.gain")}
                          value={`${nd.gain_pct >= 0 ? "+" : ""}${nd.gain_pct.toFixed(2)}%`}
                        />
                      )}
                      {typeof nd.parent_score === "number" && (
                        <Detail
                          label={t("evaluation.parentScore")}
                          value={formatScore(nd.parent_score)}
                        />
                      )}
                      {typeof nd.program_score === "number" && (
                        <Detail
                          label={t("evaluation.programScore")}
                          value={formatScore(nd.program_score)}
                        />
                      )}
                    </>
                  )}
                  {nd.mode === "dissimilarity" && (
                    <>
                      {typeof nd.dissimilarity === "number" && (
                        <Detail
                          label={t("evaluation.minDissimilarity")}
                          value={nd.dissimilarity.toFixed(4)}
                        />
                      )}
                      {typeof nd.embedding_source === "string" && (
                        <Detail
                          label={t("evaluation.embedding")}
                          value={nd.embedding_source}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

      <div ref={logsRef} className="space-y-4">
        <div>
          <h4 className="font-bold text-xs uppercase text-gray-500 mb-1">
            STDOUT
          </h4>
          <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto min-h-[100px]">
            {program.metadata?.stdout_log || t("evaluation.noOutput")}
          </pre>
        </div>
        <div>
          <h4 className="font-bold text-xs uppercase text-red-500 mb-1">
            STDERR
          </h4>
          <pre className="bg-red-50 text-red-900 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-red-200 min-h-[50px]">
            {program.metadata?.stderr_log || t("evaluation.noErrors")}
          </pre>
        </div>
      </div>
    </div>
  );
}
