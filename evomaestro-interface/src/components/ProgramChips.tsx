"use client";

import { X } from "lucide-react";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { NodeID } from "./NodeID";

type Variant = "purple" | "blue" | "teal";

const VARIANT_STYLES: Record<
  Variant,
  { chip: string; text: string; removeHover: string; removeIcon: string }
> = {
  purple: {
    chip: "bg-purple-50 border-purple-200",
    text: "text-purple-700",
    removeHover: "hover:bg-purple-200",
    removeIcon: "text-purple-600",
  },
  blue: {
    chip: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    removeHover: "hover:bg-blue-200",
    removeIcon: "text-blue-600",
  },
  teal: {
    chip: "bg-teal-50 border-teal-200",
    text: "text-teal-700",
    removeHover: "hover:bg-teal-200",
    removeIcon: "text-teal-600",
  },
};

interface ProgramChipsProps {
  programs: Program[];
  /** If provided, renders an × button that calls this handler. */
  onRemove?: (prog: Program) => void;
  /** If provided, makes the entire chip clickable */
  onClick?: (prog: Program) => void;
  variant?: Variant;
  className?: string;
}

/**
 * Renders a row of program chips showing generation and short ID.
 * Reused across MergePanel, SuggestPanel, and comparison popup windows.
 */
export function ProgramChips({
  programs,
  onRemove,
  onClick,
  variant = "purple",
  className = "",
}: ProgramChipsProps) {
  const { t } = useI18n();
  const s = VARIANT_STYLES[variant];
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {programs.map((prog) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: simple chip
        // biome-ignore lint/a11y/noStaticElementInteractions: simple chip
        <div
          key={prog.id}
          className={`flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs ${s.chip} ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
          onClick={onClick ? () => onClick(prog) : undefined}
        >
          <span className={s.text}>
            {t("common.node")} {prog.generation}
          </span>
          <NodeID id={prog.id} />
          {onRemove && (
            <button
              type="button"
              className={`p-0.5 rounded-full ${s.removeHover}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(prog);
              }}
              title={t("selection.remove")}
            >
              <X className={`w-3 h-3 ${s.removeIcon}`} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
