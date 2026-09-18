"use client";

import { Copy } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useWorkspacePanelTab } from "@/contexts/WorkspacePanelTabContext";
import { useI18n } from "@/i18n";

interface NodeIDProps {
  id: string;
  className?: string;
  shorten?: boolean;
}

export function NodeID({ id, className, shorten = true }: NodeIDProps) {
  const { t } = useI18n();
  const { selectProgram, highlightProgram } = useEvolveShell();
  const tabContext = useWorkspacePanelTab();
  const [showMenu, setShowMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  const displayId = shorten ? id.substring(0, 8) : id;

  const handleLeftClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    highlightProgram(id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (tabContext?.switchToTreeAndSelect) {
      tabContext.switchToTreeAndSelect(id);
    } else {
      selectProgram(id);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      setShowMenu(null);
    });
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setShowMenu(null);
    if (showMenu) {
      window.addEventListener("click", handleClick);
    }
    return () => window.removeEventListener("click", handleClick);
  }, [showMenu]);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: span used to avoid nested button (NodeID can appear inside a button in BestPathView) */}
      <span
        role="button"
        tabIndex={0}
        title={id}
        onClick={handleLeftClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            highlightProgram(id);
          }
        }}
        className={`font-mono text-blue-600 hover:text-blue-800 cursor-pointer hover:underline border-b border-blue-200 border-dotted transition-colors text-left p-0 bg-transparent inline-block align-baseline select-none ${className}`}
      >
        {displayId}
      </span>

      {showMenu && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded py-1 min-w-[120px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: showMenu.x, top: showMenu.y }}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2 text-gray-700 transition-colors"
          >
            <Copy size={12} />
            {t("common.copyId")}
          </button>
        </div>
      )}
    </>
  );
}
