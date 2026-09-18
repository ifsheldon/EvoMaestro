"use client";

import { Bell, Check, ChevronRight, Lightbulb, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import type { ReviewPriorityNotification } from "@/contexts/EvolveShellContext";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useWorkspacePanelTab } from "@/contexts/WorkspacePanelTabContext";
import { type Translate, useI18n } from "@/i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp: number, t: Translate): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t("notifications.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("notifications.daysAgo", { count: days });
}

// ---------------------------------------------------------------------------
// NotificationCard
// ---------------------------------------------------------------------------

function NotificationCard({
  notification: n,
  onClick,
  onRemove,
  usesCustomReviewPrioritization,
}: {
  notification: ReviewPriorityNotification;
  onClick: () => void;
  onRemove: () => void;
  usesCustomReviewPrioritization?: boolean;
}) {
  const { t } = useI18n();
  const timeAgo = getRelativeTime(n.timestamp, t);

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex card layout not suitable for <button>
    <div
      className={`rounded-xl p-3 shadow-sm border transition-all duration-200 cursor-pointer ${
        n.dismissed
          ? "bg-white border-gray-200 opacity-70"
          : "bg-white border-gray-200 shadow-md"
      }`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
    >
      <div className="flex items-start gap-2">
        <Lightbulb
          size={16}
          className={`mt-0.5 flex-shrink-0 ${
            n.reviewPriorityLevel === "high"
              ? "text-orange-500"
              : "text-yellow-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                n.reviewPriorityLevel === "high"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {n.reviewPriorityLevel === "high"
                ? t("reviewPriority.high")
                : t("reviewPriority.moderate")}
            </span>
            <span className="text-[10px] text-gray-400">{timeAgo}</span>
          </div>
          <p className="text-xs text-gray-700">
            {t("common.generationShort")} {n.generation} · {t("common.score")}{" "}
            {n.combinedScore != null ? n.combinedScore.toFixed(3) : "?"}
          </p>
          {!usesCustomReviewPrioritization &&
            typeof n.reviewPriorityData?.reason === "string" && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {n.reviewPriorityData.reason}
              </p>
            )}
          {!usesCustomReviewPrioritization &&
            typeof n.reviewPriorityData?.gain_pct === "number" && (
              <p className="text-[10px] text-teal-600 font-medium mt-0.5">
                {t("reviewPriority.gain", {
                  value: n.reviewPriorityData.gain_pct.toFixed(2),
                })}
                {typeof n.reviewPriorityData?.parent_score === "number" && (
                  <span className="text-gray-400 font-normal">
                    {" "}
                    {t("reviewPriority.fromScore", {
                      score: n.reviewPriorityData.parent_score.toFixed(3),
                    })}
                  </span>
                )}
              </p>
            )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold transition-colors"
          >
            {t("common.view")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-gray-300 hover:text-gray-500 self-center"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationCenter
// ---------------------------------------------------------------------------

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  usesCustomReviewPrioritization?: boolean;
}

export function NotificationCenter({
  open,
  onClose,
  usesCustomReviewPrioritization,
}: NotificationCenterProps) {
  const { t } = useI18n();
  const {
    state,
    selectProgram,
    dismissReviewPriorityNotification,
    dismissAllReviewPriorityNotifications,
    removeReviewPriorityNotification,
    clearAllReviewPriorityNotifications,
  } = useEvolveShell();
  const tabCtx = useWorkspacePanelTab();

  const allNotifications = state.reviewPriorityNotifications;
  const undismissedCount = allNotifications.filter((n) => !n.dismissed).length;

  // Escape key closes the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleCardClick = (n: ReviewPriorityNotification) => {
    // Mark as read
    if (!n.dismissed) dismissReviewPriorityNotification(n.id);
    // Navigate to program
    selectProgram(n.programId);
    tabCtx?.switchToTreeAndSelect(n.programId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern
        <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-[380px] z-50
          bg-gray-50
          border-l border-gray-200
          shadow-2xl
          transform transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-800">
              {t("notifications.title")}
            </span>
            {undismissedCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {undismissedCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {allNotifications.length > 0 && (
              <button
                type="button"
                onClick={dismissAllReviewPriorityNotifications}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-md hover:bg-gray-200/70 text-gray-400 hover:text-gray-600 transition-colors"
                title={t("notifications.markAllRead")}
              >
                <Check className="w-3.5 h-3.5" />
                <span className="text-[10px]">{t("notifications.read")}</span>
              </button>
            )}
            {allNotifications.length > 0 && (
              <button
                type="button"
                onClick={clearAllReviewPriorityNotifications}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title={t("notifications.deleteAll")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="text-[10px]">{t("common.clear")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-200/50 text-gray-500"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {allNotifications.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12">
              {t("notifications.empty")}
            </div>
          ) : (
            allNotifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onClick={() => handleCardClick(n)}
                onRemove={() => removeReviewPriorityNotification(n.id)}
                usesCustomReviewPrioritization={usesCustomReviewPrioritization}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
