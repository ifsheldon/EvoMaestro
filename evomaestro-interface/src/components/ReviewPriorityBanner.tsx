"use client";

import { Lightbulb, X } from "lucide-react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useWorkspacePanelTab } from "@/contexts/WorkspacePanelTabContext";
import { useI18n } from "@/i18n";

interface ReviewPriorityBannerProps {
  hidden?: boolean;
  usesCustomReviewPrioritization?: boolean;
}

export function ReviewPriorityBanner({
  hidden,
  usesCustomReviewPrioritization,
}: ReviewPriorityBannerProps) {
  const { t } = useI18n();
  const { state, selectProgram, dismissReviewPriorityNotification } =
    useEvolveShell();
  const tabCtx = useWorkspacePanelTab();

  const activeNotifications = state.reviewPriorityNotifications.filter(
    (n) => !n.dismissed && n.showInBanner,
  );

  if (hidden || activeNotifications.length === 0) return null;

  const handleView = (programId: string) => {
    selectProgram(programId);
    tabCtx?.switchToTreeAndSelect(programId);
  };

  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col items-end gap-2 max-w-sm pointer-events-none">
      {activeNotifications.map((n, index) => (
        <div
          key={n.id}
          style={{ opacity: Math.max(0.3, 1 - index * 0.15) }}
          className="pointer-events-auto w-full px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs font-medium bg-white/95 backdrop-blur-md border border-gray-200 transition-all duration-300 ease-out"
        >
          <Lightbulb
            size={14}
            className={`flex-shrink-0 ${
              n.reviewPriorityLevel === "high"
                ? "text-orange-500"
                : "text-yellow-500"
            }`}
          />
          <span className="flex-1 min-w-0">
            <span
              className={`font-semibold ${
                n.reviewPriorityLevel === "high"
                  ? "text-orange-700"
                  : "text-yellow-700"
              }`}
            >
              {n.reviewPriorityLevel === "high"
                ? t("reviewPriority.high")
                : t("reviewPriority.moderate")}
            </span>{" "}
            <span className="text-gray-500">
              {t("common.generationShort")} {n.generation}, {t("common.score")}{" "}
              {n.combinedScore != null ? n.combinedScore.toFixed(3) : "?"}
            </span>
            {!usesCustomReviewPrioritization &&
              typeof n.reviewPriorityData?.reason === "string" && (
                <span className="text-gray-400 block truncate">
                  {n.reviewPriorityData.reason}
                </span>
              )}
          </span>
          <button
            type="button"
            onClick={() => handleView(n.programId)}
            className="px-1.5 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold flex-shrink-0 transition-colors"
          >
            {t("common.view")}
          </button>
          <button
            type="button"
            onClick={() => dismissReviewPriorityNotification(n.id)}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
