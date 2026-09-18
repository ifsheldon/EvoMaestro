"use client";

import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import { ChevronDown, ChevronRight } from "lucide-react";
import { marked } from "marked";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import type { JsonObject, Program } from "@/types";
import { getProgramScore } from "@/utils/program";
import { ProgramChips } from "../ProgramChips";

// Register JSON language for syntax highlighting
hljs.registerLanguage("json", json);

interface PromptViewProps {
  program: Program;
  allPrograms: Program[];
}

export function PromptView({ program, allPrograms }: PromptViewProps) {
  const { t } = useI18n();
  const rows: Array<{ type: "parent" | "topK" | "archive"; id: string }> = [];
  if (program.parent_id) rows.push({ type: "parent", id: program.parent_id });

  // Inspiration IDs are directly on the program object
  const topK = program.top_k_inspiration_ids ?? [];
  const archive = program.archive_inspiration_ids ?? [];

  for (const id of topK) {
    rows.push({ type: "topK", id });
  }
  for (const id of archive) {
    rows.push({ type: "archive", id });
  }

  const llmResult = program.metadata?.llm_result;
  const source = program.metadata?.source;
  const humanPrompt = program.metadata?.human_prompt;
  const hasExpertSuggestions = source || humanPrompt;

  return (
    <div className="h-full overflow-auto p-4 space-y-8">
      {/* Expert Suggestions Section */}
      {!!hasExpertSuggestions && (
        <Section title={t("prompt.expertSuggestions")}>
          <div className="space-y-4">
            {!!source && (
              <div className="text-xs">
                <div className="font-semibold text-gray-600 mb-1">source</div>
                <div className="bg-gray-50 rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words border border-gray-100">
                  {typeof source === "object"
                    ? JSON.stringify(source, null, 2)
                    : String(source)}
                </div>
              </div>
            )}
            {!!humanPrompt && (
              <div className="text-xs">
                <div className="font-semibold text-gray-600 mb-1">
                  human_prompt
                </div>
                <div className="bg-gray-50 rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words border border-gray-100">
                  {typeof humanPrompt === "object"
                    ? JSON.stringify(humanPrompt, null, 2)
                    : String(humanPrompt)}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Inspirations Section */}
      <Section title={t("prompt.parentsInspirations")}>
        {rows.length === 0 ? (
          <div className="text-gray-500 text-sm">
            {t("prompt.noInspiration")}
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm overflow-hidden border border-gray-200">
            <table className="w-full text-xs border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-2 py-2 text-left whitespace-nowrap">
                    {t("programs.type")}
                  </th>
                  <th className="border border-gray-200 px-2 py-2 text-left whitespace-nowrap">
                    {t("common.node")}
                  </th>
                  <th className="border border-gray-200 px-2 py-2 text-left whitespace-nowrap">
                    {t("common.score")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const node = allPrograms.find((p) => p.id === row.id);
                  const score = node ? getProgramScore(node) : null;
                  return (
                    <tr
                      key={`${row.type}-${row.id}`}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="border border-gray-200 border-t-0 px-2 py-2 whitespace-nowrap font-medium text-gray-600">
                        {t(`prompt.rowType.${row.type}`)}
                      </td>
                      <td className="border border-gray-200 border-t-0 px-2 py-2 whitespace-nowrap">
                        {node ? (
                          <ProgramChips programs={[node]} variant="purple" />
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">
                            {row.id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="border border-gray-200 border-t-0 px-2 py-2 whitespace-nowrap font-mono text-gray-700 font-medium">
                        {score != null ? score.toFixed(4) : "N/A"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Context Section */}
      <Section title={t("prompt.context")}>
        {!llmResult ? (
          <div className="text-gray-500 text-sm">{t("prompt.noContext")}</div>
        ) : (
          <div className="bg-white rounded shadow-sm overflow-hidden border border-gray-200">
            <LLMResultContent data={llmResult} />
          </div>
        )}
      </Section>
    </div>
  );
}

function LLMResultContent({ data }: { data: unknown }) {
  const { t } = useI18n();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <div className="p-4 text-gray-500">{t("prompt.invalidResult")}</div>;
  }
  const safeData = data as JsonObject;

  const order = [
    "content",
    "msg",
    "system_msg",
    "new_msg_history",
    "thought",
    "model_name",
    "temperature",
    "max_output_tokens",
    "kwargs",
    "input_tokens",
    "output_tokens",
    "cost",
    "input_cost",
    "output_cost",
    "model_posteriors",
  ];

  const excludedKeys = [
    "model_name",
    "temperature",
    "max_output_tokens",
    "input_tokens",
    "output_tokens",
    "cost",
    "input_cost",
    "output_cost",
    "model_posteriors",
  ];
  const keys = Object.keys(safeData)
    .filter((k) => !excludedKeys.includes(k))
    .sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

  const collapsibleKeys = ["content", "msg", "system_msg", "new_msg_history"];

  return (
    <div className="w-full text-sm font-sans">
      <table className="w-full border-collapse border border-gray-200">
        <tbody>
          {keys.map((key) => (
            <ResultRow
              key={key}
              label={key}
              value={safeData[key]}
              startCollapsed={collapsibleKeys.includes(key)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ResultRow: React.FC<{
  label: string;
  value: unknown;
  startCollapsed?: boolean;
}> = ({ label, value, startCollapsed = false }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(!startCollapsed);
  const codeRef = useRef<HTMLElement | null>(null);

  const needsHighlighting = label === "kwargs" || label === "model_posteriors";

  useEffect(() => {
    if (needsHighlighting && codeRef.current && typeof value === "object") {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [needsHighlighting, value]);

  const useToggle = startCollapsed;

  const renderValue = () => {
    if (value === null || value === undefined)
      return <span className="text-gray-400">null</span>;

    if (typeof value === "object") {
      if (needsHighlighting) {
        return (
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded border border-gray-100 mt-2">
            <code ref={codeRef} className="language-json">
              {JSON.stringify(value, null, 2)}
            </code>
          </pre>
        );
      }

      return (
        <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 p-2 rounded border border-gray-100 mt-2">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    if (typeof value === "boolean")
      return (
        <span className="text-blue-600 font-bold">{value.toString()}</span>
      );

    if (label === "thought" || label === "msg") {
      const textValue = typeof value === "string" ? value : String(value);
      return (
        <div
          className="prose prose-sm max-w-none text-xs bg-gray-50 p-2 rounded border border-gray-100 mt-2 overflow-x-auto"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from trusted program metadata via marked
          dangerouslySetInnerHTML={{
            __html: marked.parse(textValue) as string,
          }}
        />
      );
    }

    if (label === "content" || label === "system_msg") {
      const textValue = typeof value === "string" ? value : String(value);
      return (
        <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 p-2 rounded border border-gray-100 mt-2 max-w-full overflow-x-auto">
          {textValue}
        </pre>
      );
    }

    const inlineValue =
      typeof value === "string" || typeof value === "number"
        ? value
        : String(value);
    return <div className="break-words font-mono text-xs">{inlineValue}</div>;
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="p-3 border border-gray-200 border-t-0 font-bold text-gray-700 align-top w-1/4 bg-gray-50/50">
        {label}
      </td>
      <td className="p-3 border border-gray-200 border-t-0 align-top w-3/4">
        {useToggle ? (
          <div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium focus:outline-none"
            >
              {expanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              {expanded ? t("common.collapse") : t("common.expandToView")}
            </button>
            {expanded && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {renderValue()}
              </div>
            )}
          </div>
        ) : (
          renderValue()
        )}
      </td>
    </tr>
  );
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h4 className="font-bold text-xs uppercase text-gray-500 border-b border-gray-100 pb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}
