import type React from "react";
import { useMemo } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { translatePatchType, useI18n } from "@/i18n";
import type { Program } from "@/types";
import {
  formatScore,
  getProgramName,
  getProgramScore,
  isCorrectProgram,
} from "@/utils/program";
import { ProgramChips } from "../ProgramChips";

interface BestPathViewProps {
  data: Program[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
}

export const BestPathView: React.FC<BestPathViewProps> = ({
  data,
  selectedNodeId,
  onNodeSelect,
}) => {
  const { t } = useI18n();
  const { state } = useEvolveShell();
  const bestPath = useMemo(() => {
    if (!data || data.length === 0) return [];

    const correctNodes = data.filter(
      (d) => isCorrectProgram(d) && getProgramScore(d) != null,
    );

    let bestNode: Program | null = null;

    if (correctNodes.length > 0) {
      bestNode = correctNodes.reduce((best, current) =>
        (getProgramScore(current) ?? -Infinity) >
        (getProgramScore(best) ?? -Infinity)
          ? current
          : best,
      );
    } else {
      bestNode = data.reduce((best, current) => {
        const currentScore = getProgramScore(current) ?? -Infinity;
        const bestScore = getProgramScore(best) ?? -Infinity;
        return currentScore > bestScore ? current : best;
      }, data[0]);
    }

    if (!bestNode) return [];

    const nodeMap = new Map(data.map((n) => [n.id, n]));
    const path: Program[] = [];
    let current: Program | undefined = bestNode;

    while (current) {
      path.unshift(current);
      if (!current.parent_id) break;
      current = nodeMap.get(current.parent_id);
    }

    return path;
  }, [data]);

  if (bestPath.length === 0) {
    return (
      <div className="p-10 text-center text-gray-500">
        {t("bestPath.unavailable")}
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#F6F6F6] min-h-full">
      <h3 className="text-lg font-bold mb-4 text-center">
        {t("bestPath.title")}
      </h3>
      <div className="relative border-l-2 border-yellow-300 ml-4 space-y-6 pl-6 py-2">
        {bestPath.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`relative bg-white p-4 rounded shadow-sm border cursor-pointer hover:shadow-md transition-shadow text-left w-full ${
              node.id === selectedNodeId
                ? "border-blue-500 ring-1 ring-blue-500"
                : "border-gray-200"
            }`}
            onClick={() => onNodeSelect(node.id)}
          >
            <div className="absolute -left-[33px] top-6 w-4 h-4 rounded-full bg-yellow-500 border-2 border-white shadow-sm"></div>

            <div className="flex flex-wrap items-center gap-2 text-gray-800">
              <ProgramChips
                programs={[node]}
                variant="purple"
                className="font-semibold"
              />
              <span>{getProgramName(node)}</span>
            </div>

            <div className="mt-2 text-sm text-gray-600 space-y-1">
              <div>
                <span className="font-semibold text-gray-700">
                  {t("details.patchType")}:
                </span>{" "}
                {(() => {
                  const patchType = node.metadata?.patch_type;
                  if (
                    state.settings.unifyMutationTypes &&
                    (patchType === "diff" || patchType === "full")
                  ) {
                    return translatePatchType(t, "mutation");
                  }
                  return patchType
                    ? translatePatchType(t, patchType)
                    : t("details.notAvailable");
                })()}
              </div>
              <div>
                <span className="font-semibold text-gray-700">
                  {t("common.score")}:
                </span>{" "}
                <span
                  className={`font-semibold ${
                    isCorrectProgram(node) ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {formatScore(getProgramScore(node))}
                </span>
              </div>
            </div>

            {node.metadata?.patch_description && (
              <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                {node.metadata.patch_description}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
