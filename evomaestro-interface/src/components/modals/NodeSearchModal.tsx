"use client";

import { Bookmark, Pencil, Search, StickyNote, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";
import type { Program } from "@/types";
import { isCorrectProgram, isTimeoutProgram } from "@/utils/program";
import { NodeID } from "../NodeID";
import { ProgramChips } from "../ProgramChips";
import NoteInputModal from "./NoteInputModal";

interface NodeSearchModalProps {
  programs: Program[];
  onClose: () => void;
}

export default function NodeSearchModal({
  programs,
  onClose,
}: NodeSearchModalProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const {
    state: shellState,
    highlightProgram,
    toggleMarkNode,
    setNodeNote,
    removeNodeNote,
  } = useEvolveShell();
  const { settings, markedNodeIds, nodeNotes } = shellState;
  const [editingNoteFor, setEditingNoteFor] = useState<Program | null>(null);

  const filteredPrograms = useMemo(() => {
    if (!query.trim()) return [];

    let lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.startsWith("node ")) {
      lowerQuery = lowerQuery.substring(5).trim();
    }

    // If the query was just "node " and is now empty, return early
    if (!lowerQuery) return [];

    const filtered = programs.filter((p) => {
      // Respect visibility settings
      if (!isCorrectProgram(p)) {
        if (isTimeoutProgram(p)) {
          if (!settings.showTimeoutNodes) return false;
        } else {
          if (!settings.showErrorNodes) return false;
        }
      }

      const pGenString = p.generation.toString();
      if (pGenString === lowerQuery) return true;

      if (p.id.toLowerCase().includes(lowerQuery)) return true;

      return false;
    });

    // Sort so exact generation matches come first, then exact ID matches, then partial ID matches
    filtered.sort((a, b) => {
      const aGenMatch = a.generation.toString() === lowerQuery;
      const bGenMatch = b.generation.toString() === lowerQuery;

      if (aGenMatch && !bGenMatch) return -1;
      if (!aGenMatch && bGenMatch) return 1;

      const aIdExact = a.id.toLowerCase() === lowerQuery;
      const bIdExact = b.id.toLowerCase() === lowerQuery;

      if (aIdExact && !bIdExact) return -1;
      if (!aIdExact && bIdExact) return 1;

      const aIdMatch = a.id.toLowerCase().includes(lowerQuery);
      const bIdMatch = b.id.toLowerCase().includes(lowerQuery);

      if (aIdMatch && !bIdMatch) return -1;
      if (!aIdMatch && bIdMatch) return 1;

      return 0;
    });

    return filtered.slice(0, 10);
  }, [programs, query, settings.showErrorNodes, settings.showTimeoutNodes]);

  // Collect bookmarked and noted programs separately
  const { markedPrograms, notedPrograms } = useMemo(() => {
    const programMap = new Map(programs.map((p) => [p.id, p]));

    const marked: Program[] = [];
    for (const id of markedNodeIds) {
      const p = programMap.get(id);
      if (p) marked.push(p);
    }

    const noted: Program[] = [];
    for (const id of Object.keys(nodeNotes)) {
      const p = programMap.get(id);
      if (p) noted.push(p);
    }

    return { markedPrograms: marked, notedPrograms: noted };
  }, [programs, markedNodeIds, nodeNotes]);

  const hasBookmarks = markedPrograms.length > 0 || notedPrograms.length > 0;

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[6000] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] overflow-hidden flex flex-col border border-gray-100 animate-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 py-3 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
          <input
            type="text"
            // biome-ignore lint/a11y/noAutofocus: search modal should auto-focus the input
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-gray-800 text-lg placeholder:text-gray-400"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors ml-2 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-4 bg-gray-50/50 min-h-[100px]">
          {/* Search results */}
          {query.trim().length > 0 ? (
            filteredPrograms.length > 0 ? (
              <ProgramChips
                programs={filteredPrograms}
                variant="blue"
                onClick={(prog) => {
                  highlightProgram(prog.id);
                  onClose();
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
                {t("search.noNodes", { query })}
              </div>
            )
          ) : !hasBookmarks ? (
            <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
              {t("search.hint")}
            </div>
          ) : null}

          {/* Bookmarks section */}
          {markedPrograms.length > 0 && (
            <div
              className={
                query.trim().length > 0
                  ? "mt-4 pt-3 border-t border-gray-200"
                  : ""
              }
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                <Bookmark className="w-3.5 h-3.5" />
                {t("search.bookmarks")}
              </div>
              <ProgramChips
                programs={markedPrograms}
                variant="blue"
                onRemove={(prog) => toggleMarkNode(prog.id)}
                onClick={(prog) => {
                  highlightProgram(prog.id);
                  onClose();
                }}
              />
            </div>
          )}

          {/* Notes section */}
          {notedPrograms.length > 0 && (
            <div
              className={
                query.trim().length > 0 || markedPrograms.length > 0
                  ? "mt-4 pt-3 border-t border-gray-200"
                  : ""
              }
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                <StickyNote className="w-3.5 h-3.5" />
                {t("search.notes")}
              </div>
              <div className="space-y-2">
                {notedPrograms.map((prog) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: row click
                  // biome-ignore lint/a11y/noStaticElementInteractions: row click
                  <div
                    key={prog.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100/60 cursor-pointer transition-colors group"
                    onClick={() => {
                      highlightProgram(prog.id);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-1.5 shrink-0 text-xs">
                      <span className="text-teal-700">
                        {t("common.node")} {prog.generation}
                      </span>
                      <NodeID id={prog.id} />
                    </div>
                    <p className="flex-1 text-xs text-gray-700 truncate">
                      {nodeNotes[prog.id]}
                    </p>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-teal-100 text-gray-400 hover:text-teal-600"
                        title={t("search.editNote")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingNoteFor(prog);
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                        title={t("search.removeNote")}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNodeNote(prog.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Inline note editing modal */}
        {editingNoteFor && (
          <NoteInputModal
            program={editingNoteFor}
            initialNote={nodeNotes[editingNoteFor.id] ?? ""}
            onSave={(note) => setNodeNote(editingNoteFor.id, note)}
            onRemove={() => removeNodeNote(editingNoteFor.id)}
            onClose={() => setEditingNoteFor(null)}
          />
        )}
      </div>

      {/* Invisible overlay for clicking outside to close */}
      {/* biome-ignore lint/a11y/useSemanticElements: backdrop overlay, not a real button */}
      <div
        className="fixed inset-0 z-[-1]"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label={t("search.closeModal")}
      />
    </div>
  );
}
