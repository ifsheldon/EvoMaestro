"use client";

import { BarChart3, FilterX } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n";

interface CanvasContextMenuProps {
  /** Screen position where the menu appears. */
  x: number;
  y: number;
  /** Called when the user picks "Distribution". */
  onDistribution: () => void;
  /** Called when the user picks "Remove Filter". */
  onRemoveFilter?: () => void;
  /** Whether a score filter is currently active. */
  hasFilter?: boolean;
  /** Called when the menu should close (click-away, Escape, etc). */
  onClose: () => void;
}

/**
 * Context menu shown on right-click of empty tree canvas space.
 */
export default function CanvasContextMenu({
  x,
  y,
  onDistribution,
  onRemoveFilter,
  hasFilter = false,
  onClose,
}: CanvasContextMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openTime = Date.now();
    const handlePointer = (e: PointerEvent) => {
      if (Date.now() - openTime < 100) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
        onClick={() => {
          onDistribution();
          onClose();
        }}
      >
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <span>{t("common.distribution")}</span>
      </button>
      {hasFilter && onRemoveFilter && (
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2"
          onClick={() => {
            onRemoveFilter();
            onClose();
          }}
        >
          <FilterX className="w-4 h-4 text-red-500" />
          <span>{t("common.removeFilter")}</span>
        </button>
      )}
    </div>
  );
}
