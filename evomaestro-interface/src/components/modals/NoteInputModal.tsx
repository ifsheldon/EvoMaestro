"use client";

import { StickyNote, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { NodeID } from "../NodeID";

interface NoteInputModalProps {
  program: Program;
  initialNote?: string;
  onSave: (note: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export default function NoteInputModal({
  program,
  initialNote = "",
  onSave,
  onRemove,
  onClose,
}: NoteInputModalProps) {
  const { t } = useI18n();
  const [note, setNote] = useState(initialNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = note.trim();
    if (trimmed) {
      onSave(trimmed);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[90vw] overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <StickyNote className="w-4 h-4 text-teal-600" />
            <span>
              {t("notes.forNode", { generation: program.generation })}
            </span>
            <NodeID id={program.id} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <textarea
            ref={textareaRef}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            rows={4}
            placeholder={t("notes.placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSave();
              }
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {t("notes.saveShortcut", {
                  modifier: navigator.platform.includes("Mac") ? "Cmd" : "Ctrl",
                })}
              </span>
              {onRemove && initialNote && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onClose();
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  {t("common.remove")}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
