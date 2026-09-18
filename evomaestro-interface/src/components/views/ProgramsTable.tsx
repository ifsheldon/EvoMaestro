"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { translatePatchType, useI18n } from "@/i18n";
import type { Program } from "@/types";
import {
  formatScore,
  getProgramScore,
  isCorrectProgram,
  isTimeoutProgram,
} from "@/utils/program";
import { NodeID } from "../NodeID";

interface ProgramsTableProps {
  programs: Program[];
  onSelectProgram: (program: Program) => void;
  selectedProgramId: string | null;
  usesCustomReviewPrioritization?: boolean;
}

type SortKey =
  | "rank"
  | "generation"
  | "archive"
  | "type"
  | "island_idx"
  | "score"
  | "reviewPriority"
  | "api_cost"
  | "complexity"
  | "model";
type SortDir = "asc" | "desc";

export default function ProgramsTable({
  programs,
  onSelectProgram,
  selectedProgramId,
  usesCustomReviewPrioritization,
}: ProgramsTableProps) {
  const { t } = useI18n();
  const { state } = useEvolveShell();
  const { settings } = state;
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filter: respect Node settings (showErrorNodes, showTimeoutNodes)
  const filteredPrograms = programs.filter((p) => {
    if (isCorrectProgram(p)) return true;
    if (isTimeoutProgram(p)) return settings.showTimeoutNodes;
    return settings.showErrorNodes;
  });

  // Sorting
  const sortedPrograms = [...filteredPrograms].sort((a, b) => {
    let valA: number | string = -Infinity;
    let valB: number | string = -Infinity;

    // Helper to get values
    switch (sortKey) {
      case "rank":
        // Rank usually means Score descending.
        // We can calculate rank on the fly or use score.
        // Let's use score for rank-like sorting
        valA = getProgramScore(a) ?? -Infinity;
        valB = getProgramScore(b) ?? -Infinity;
        break;
      case "generation":
        valA = a.generation;
        valB = b.generation;
        break;
      case "archive":
        valA = a.in_archive ? 1 : 0;
        valB = b.in_archive ? 1 : 0;
        break;
      case "type":
        valA = a.metadata?.patch_type || "";
        valB = b.metadata?.patch_type || "";
        break;
      case "island_idx":
        valA = a.island_idx ?? -Infinity;
        valB = b.island_idx ?? -Infinity;
        break;
      case "score":
        valA = getProgramScore(a) ?? -Infinity;
        valB = getProgramScore(b) ?? -Infinity;
        break;
      case "reviewPriority": {
        // Primary: review priority level (high > moderate > none), secondary: gain_pct (default mode only)
        const reviewPriorityOrder = { high: 2, moderate: 1, none: 0 };
        const levelA =
          reviewPriorityOrder[
            (a.review_priority_level as keyof typeof reviewPriorityOrder) ??
              "none"
          ] ?? 0;
        const levelB =
          reviewPriorityOrder[
            (b.review_priority_level as keyof typeof reviewPriorityOrder) ??
              "none"
          ] ?? 0;
        if (usesCustomReviewPrioritization) {
          // Custom mode: sort by level only
          valA = levelA;
          valB = levelB;
        } else {
          const ndA = a.review_priority_data;
          const ndB = b.review_priority_data;
          const gainA =
            typeof ndA?.gain_pct === "number" ? ndA.gain_pct : -Infinity;
          const gainB =
            typeof ndB?.gain_pct === "number" ? ndB.gain_pct : -Infinity;
          // Encode as level * 1e9 + gain so both sort together
          valA = levelA * 1e9 + gainA;
          valB = levelB * 1e9 + gainB;
        }
        break;
      }
      case "api_cost":
        valA = parseFloat(a.metadata?.api_costs || "0");
        valB = parseFloat(b.metadata?.api_costs || "0");
        break;
      case "complexity":
        valA = a.complexity ?? -Infinity;
        valB = b.complexity ?? -Infinity;
        break;
      case "model":
        valA = a.metadata?.model_name || "";
        valB = b.metadata?.model_name || "";
        break;
    }

    if (valA === valB) return 0;

    // For Rank/Score, desc is usually default 'best first', but if sortDir is set:
    // If sortKey is rank/score, we usually want Higher = Better (Rank 1).
    // Let's just follow strict sortDir.

    // String comparison
    if (typeof valA === "string" && typeof valB === "string") {
      return sortDir === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }

    // Number comparison
    const numA = typeof valA === "number" ? valA : Number(valA);
    const numB = typeof valB === "number" ? valB : Number(valB);
    return sortDir === "asc" ? numA - numB : numB - numA;
  });

  // Calculate Rank (index + 1) if sorted by Score Descending
  // Or just display visual index

  const handleHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc"); // Default to asc for new column? Or desc for score?
      // Usually Score/Rank desc is better default.
      if (key === "score" || key === "rank") setSortDir("desc");
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-black">{dir === "asc" ? "▲" : "▼"}</span>;
  };

  const hasReviewPriority = filteredPrograms.some(
    (p) =>
      p.review_priority_level === "high" ||
      p.review_priority_level === "moderate",
  );

  const columns = [
    { key: "rank", label: t("programs.rank") },
    { key: "id", label: "ID" },
    { key: "generation", label: t("programs.number") },
    { key: "score", label: t("common.score") },
    ...(hasReviewPriority
      ? [{ key: "reviewPriority", label: t("common.reviewPriority") }]
      : []),
    { key: "type", label: t("programs.type") },
    { key: "model", label: t("programs.model") },
    { key: "island_idx", label: t("programs.island") },
    { key: "complexity", label: t("programs.complexity") },
    { key: "api_cost", label: t("programs.apiCost") },
    { key: "archive", label: t("programs.archive") },
  ];

  return (
    <div className="flex flex-col h-full bg-[#F6F6F6]">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-3 py-2 cursor-pointer hover:bg-gray-200 border-b border-gray-300 whitespace-nowrap"
                  onClick={() => handleHeaderClick(col.key as SortKey)}
                >
                  <div className="flex items-center">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPrograms.map((p, idx) => (
              <tr
                key={p.id}
                onClick={() => onSelectProgram(p)}
                className={clsx(
                  "border-b hover:bg-gray-50 cursor-pointer",
                  !isCorrectProgram(p) &&
                    (isTimeoutProgram(p)
                      ? "bg-amber-50 text-amber-900 hover:bg-amber-100"
                      : "bg-red-50 text-red-900 hover:bg-red-100"),
                  selectedProgramId === p.id &&
                    "bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium",
                )}
              >
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2">
                  <NodeID id={p.id} />
                </td>
                <td className="px-3 py-2">{p.generation}</td>
                <td className="px-3 py-2 font-mono">
                  {formatScore(getProgramScore(p))}
                </td>
                {hasReviewPriority && (
                  <td className="px-3 py-2">
                    {p.review_priority_level === "high" ||
                    p.review_priority_level === "moderate" ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            p.review_priority_level === "high"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {p.review_priority_level === "high"
                            ? t("reviewPriority.highShort")
                            : t("reviewPriority.moderateShort")}
                        </span>
                        {!usesCustomReviewPrioritization &&
                          (() => {
                            const nd = p.review_priority_data;
                            if (typeof nd?.gain_pct !== "number") return null;
                            return (
                              <span className="text-[10px] text-teal-600 font-medium whitespace-nowrap">
                                +{nd.gain_pct.toFixed(2)}%
                              </span>
                            );
                          })()}
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  {(() => {
                    const pt = p.metadata?.patch_type;
                    if (
                      settings.unifyMutationTypes &&
                      (pt === "diff" || pt === "full")
                    )
                      return translatePatchType(t, "mutation");
                    return pt ? translatePatchType(t, pt) : "-";
                  })()}
                </td>
                <td
                  className="px-3 py-2 text-xs max-w-[100px] truncate"
                  title={p.metadata?.model_name}
                >
                  {p.metadata?.model_name || "-"}
                </td>
                <td className="px-3 py-2 text-center">{p.island_idx ?? "-"}</td>
                <td className="px-3 py-2 text-xs">
                  {p.complexity ? p.complexity.toFixed(3) : "-"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {p.metadata?.api_costs
                    ? `$${parseFloat(p.metadata.api_costs).toFixed(4)}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-center">
                  {p.in_archive ? (
                    <span className="text-green-600 font-bold">✓</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {sortedPrograms.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-gray-500"
                >
                  {t("programs.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
