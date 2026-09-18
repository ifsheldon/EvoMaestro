"use client";

import {
  Ban,
  Bookmark,
  FileCode2,
  Filter,
  FilterX,
  GitMerge,
  Info,
  Lightbulb,
  StickyNote,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";

interface NodeContextMenuProps {
  /** Screen position where the menu appears. */
  x: number;
  y: number;
  /** If true, hide the "Code Change" option (e.g. for initial programs). */
  hideCodeChange?: boolean;
  /** Show the review-priority command when supporting data is available. */
  showReviewPriority?: boolean;
  /** Open the selected program's Review Priority details. */
  onReviewPriority?: () => void;
  /** Called when the user picks "Suggest". */
  onSuggest: () => void;
  /** Called when the user picks "Code Change" (diff view). */
  onCodeChange: () => void;
  /** Called when the user picks "Code" (view source). */
  onCode: () => void;
  /** Called when the user picks "Details" (show right panel). */
  onDetails: () => void;
  /** Called when the user picks "Merge" (add to merge selection). */
  onMerge: () => void;
  /** Whether this node is currently marked/bookmarked. */
  isMarked: boolean;
  /** Called when the user picks "Mark" / "Unmark". */
  onToggleMark: () => void;
  /** Called when the user picks "Add Note". */
  onAddNote: () => void;
  /** Whether this node is currently banned. */
  isBanned?: boolean;
  /** Called when the user picks "Ban" / "Unban". */
  onToggleBan?: () => void;
  /** Called when the user picks "Filter" (set score threshold). */
  onFilter?: () => void;
  /** If true, show the "Filter" option (node has a valid score). */
  showFilter?: boolean;
  /** Called when the user picks "Remove Filter". */
  onRemoveFilter?: () => void;
  /** Whether a score filter is currently active. */
  hasFilter?: boolean;
  /** Called when the menu should close (click-away, Escape, etc). */
  onClose: () => void;
}

/**
 * Lightweight context menu that pops up on right-click of a tree node.
 */
export default function NodeContextMenu({
  x,
  y,
  hideCodeChange = false,
  showReviewPriority = false,
  onReviewPriority,
  onSuggest,
  onCodeChange,
  onCode,
  onDetails,
  onMerge,
  isMarked,
  onToggleMark,
  onFilter,
  showFilter = false,
  onRemoveFilter,
  hasFilter = false,
  isBanned = false,
  onToggleBan,
  onAddNote,
  onClose,
}: NodeContextMenuProps) {
  const { t } = useI18n();
  const { readOnly } = useEvolveShell();
  const ref = useRef<HTMLDivElement>(null);

  // Keep every item reachable when the node is near an edge or the menu grows.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const position = () => {
      const margin = 8;
      menu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - menu.offsetWidth - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - menu.offsetHeight - margin))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [x, y]);

  // Close on click-away or Escape
  useEffect(() => {
    // Small delay so the menu doesn't close on the same pointer event that opened it
    const openTime = Date.now();
    const handlePointer = (e: PointerEvent) => {
      if (Date.now() - openTime < 100) return;
      // Don't close if click is inside the joyride tour overlay
      const target = e.target as HTMLElement;
      if (target.closest?.("[class*='react-joyride']")) return;
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      // Don't close on Escape if guided tour is active
      if (document.querySelector("[class*='react-joyride']")) return;
      if (e.key === "Escape") onClose();
    };
    // Use capture phase so we intercept before D3/SVG can stopPropagation
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-tour="node-context-menu"
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[160px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
        onClick={() => {
          onDetails();
          onClose();
        }}
      >
        <Info className="w-4 h-4 text-blue-500" />
        <span>{t("common.details")}</span>
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
        onClick={() => {
          onCode();
          onClose();
        }}
      >
        <FileCode2 className="w-4 h-4 text-green-600" />
        <span>{t("common.code")}</span>
      </button>
      {!hideCodeChange && (
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
          onClick={() => {
            onCodeChange();
            onClose();
          }}
        >
          <FileCode2 className="w-4 h-4 text-orange-600" />
          <span>{t("common.codeChange")}</span>
        </button>
      )}
      {showReviewPriority && onReviewPriority && (
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center gap-2"
          onClick={() => {
            onReviewPriority();
            onClose();
          }}
        >
          <Lightbulb className="w-4 h-4 text-orange-500" />
          <span>{t("common.viewReviewPriority")}</span>
        </button>
      )}
      {showFilter && onFilter && (
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2"
          onClick={() => {
            onFilter();
            onClose();
          }}
        >
          <Filter className="w-4 h-4 text-indigo-500" />
          <span>{t("common.filter")}</span>
        </button>
      )}
      {hasFilter && onRemoveFilter && (
        <button
          type="button"
          disabled={readOnly}
          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
          onClick={() => {
            onRemoveFilter();
            onClose();
          }}
        >
          <FilterX className="w-4 h-4 text-red-500" />
          <span>{t("common.removeFilter")}</span>
        </button>
      )}
      <div className="border-t border-gray-100 my-1" />
      {!isBanned && (
        <>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
            onClick={() => {
              onSuggest();
              onClose();
            }}
          >
            <Lightbulb className="w-4 h-4 text-blue-600" />
            <span>{t("common.suggest")}</span>
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center gap-2"
            onClick={() => {
              onMerge();
              onClose();
            }}
          >
            <GitMerge className="w-4 h-4 text-purple-600" />
            <span>{t("common.merge")}</span>
          </button>
        </>
      )}
      {onToggleBan && (
        <button
          type="button"
          disabled={readOnly}
          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
          onClick={() => {
            if (readOnly) return;
            onToggleBan();
            onClose();
          }}
        >
          <Ban
            className={`w-4 h-4 ${isBanned ? "text-gray-500" : "text-red-500"}`}
          />
          <span>{isBanned ? t("common.unban") : t("common.ban")}</span>
        </button>
      )}
      <div className="border-t border-gray-100 my-1" />
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center gap-2"
        onClick={() => {
          onToggleMark();
          onClose();
        }}
      >
        <Bookmark
          className={`w-4 h-4 ${isMarked ? "text-amber-500 fill-amber-500" : "text-amber-500"}`}
        />
        <span>{isMarked ? t("common.unmark") : t("common.mark")}</span>
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 flex items-center gap-2"
        onClick={() => {
          onAddNote();
          onClose();
        }}
      >
        <StickyNote className="w-4 h-4 text-teal-600" />
        <span>{t("common.note")}</span>
      </button>
    </div>
  );
}
