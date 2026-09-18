"use client";

import { DiffEditor } from "@monaco-editor/react";
import {
  ClipboardCopy,
  Copy,
  FileCode2,
  Loader2,
  MessageSquare,
  PanelRightClose,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import type { ChatMode } from "@/lib/api";
import type { CodeNote } from "@/lib/codeNotes";
import type { Program } from "@/types";
import { ProgramChips } from "../ProgramChips";

function ChatLoading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {t("code.loadingChat")}
    </div>
  );
}

const ChatPanel = dynamic(() => import("../chat/ChatPanel"), {
  ssr: false,
  loading: ChatLoading,
});

interface DiffModalProps {
  /** Left-side (original) program. */
  programLeft: Program;
  /** Right-side (modified) program. */
  programRight: Program;
  /** Optional header title. Defaults to "Code Diff". */
  title?: string;
  /** Optional diff summary stats to display in the header. */
  diffSummary?: { added?: number; deleted?: number; modified?: number };
  /** Optional pre-computed unified diff text for the "Copy Diff" button. */
  unifiedDiff?: string;
  /** Database path — required for Maestro chat. */
  dbPath?: string;
  /** Chat mode — determines the system prompt template. */
  chatMode: ChatMode;
  /** Close the modal. */
  onClose: () => void;
}

function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { copiedKey, copy };
}

/**
 * Full-screen modal showing a side-by-side code diff using Monaco Editor,
 * with an optional Maestro chat panel on the right.
 */
export default function DiffModal({
  programLeft,
  programRight,
  title,
  diffSummary,
  unifiedDiff,
  dbPath,
  chatMode,
  onClose,
}: DiffModalProps) {
  const { t } = useI18n();
  const [chatOpen, setChatOpen] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  // biome-ignore lint/suspicious/noExplicitAny: Monaco DiffEditor instance type
  const diffEditorRef = useRef<any>(null);

  const codeLeft = programLeft.code ?? programLeft.implementation ?? "";
  const codeRight = programRight.code ?? programRight.implementation ?? "";

  const language = useMemo(() => {
    const lang = programLeft.language || programRight.language || "python";
    const langMap: Record<string, string> = {
      python: "python",
      py: "python",
      javascript: "javascript",
      js: "javascript",
      cpp: "cpp",
      "c++": "cpp",
      cuda: "cpp",
      cu: "cpp",
    };
    return langMap[lang.toLowerCase()] || "python";
  }, [programLeft.language, programRight.language]);

  const notesRef = useRef<CodeNote[]>([]);
  // Persistent decorations (bar + glyph) per side
  // biome-ignore lint/suspicious/noExplicitAny: Monaco decoration IDs
  const leftPersistRef = useRef<any[]>([]);
  // biome-ignore lint/suspicious/noExplicitAny: Monaco decoration IDs
  const rightPersistRef = useRef<any[]>([]);
  // Active decoration (background) — only one at a time
  // biome-ignore lint/suspicious/noExplicitAny: Monaco decoration IDs
  const activeDecorRef = useRef<{ editor: any; ids: any[] } | null>(null);

  const handleNotesChanged = useCallback((notes: CodeNote[]) => {
    notesRef.current = notes;
    const de = diffEditorRef.current;
    if (!de) return;
    const origEditor = de.getOriginalEditor();
    const modEditor = de.getModifiedEditor();

    const leftNotes = notes.filter((n) => n.side === "left" || n.side === null);
    const rightNotes = notes.filter((n) => n.side === "right");

    const makePersistent = (noteList: CodeNote[]) =>
      noteList.flatMap((note) => [
        {
          range: {
            startLineNumber: note.startLine,
            startColumn: 1,
            endLineNumber: note.endLine,
            endColumn: 1,
          },
          options: { isWholeLine: true, className: "code-note-bar" },
        },
        {
          range: {
            startLineNumber: note.startLine,
            startColumn: 1,
            endLineNumber: note.startLine,
            endColumn: 1,
          },
          options: {
            glyphMarginClassName: "code-note-glyph",
            glyphMarginHoverMessage: { value: note.text },
          },
        },
      ]);

    if (origEditor) {
      leftPersistRef.current = origEditor.deltaDecorations(
        leftPersistRef.current,
        makePersistent(leftNotes),
      );
    }
    if (modEditor) {
      rightPersistRef.current = modEditor.deltaDecorations(
        rightPersistRef.current,
        makePersistent(rightNotes),
      );
    }
  }, []);

  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCodeNote = useCallback((note: CodeNote) => {
    const de = diffEditorRef.current;
    if (!de) return;
    const editor =
      note.side === "left" ? de.getOriginalEditor() : de.getModifiedEditor();
    if (!editor) return;
    editor.revealLineInCenter(note.startLine);
    // Clear previous active decoration
    if (activeDecorRef.current) {
      activeDecorRef.current.editor.deltaDecorations(
        activeDecorRef.current.ids,
        [],
      );
    }
    const ids = editor.deltaDecorations(
      [],
      [
        {
          range: {
            startLineNumber: note.startLine,
            startColumn: 1,
            endLineNumber: note.endLine,
            endColumn: 1,
          },
          options: { isWholeLine: true, className: "code-note-active" },
        },
      ],
    );
    activeDecorRef.current = { editor, ids };
    // Auto-clear after 5s
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    const snapshot = { editor, ids };
    activeTimerRef.current = setTimeout(() => {
      snapshot.editor.deltaDecorations(snapshot.ids, []);
      if (activeDecorRef.current === snapshot) {
        activeDecorRef.current = null;
      }
    }, 5000);
  }, []);

  const labelLeft = `${t("common.node")} ${programLeft.generation} ${programLeft.id.slice(0, 8)}`;
  const labelRight = `${t("common.node")} ${programRight.generation} ${programRight.id.slice(0, 8)}`;

  const { copiedKey, copy } = useCopyFeedback();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const btnClass =
    "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors";

  return (
    <div
      className="fixed inset-0 flex flex-col bg-white overflow-hidden"
      style={{ zIndex: 10000 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-gray-700">
            {title ?? t("common.codeDiff")}
          </span>
          <ProgramChips programs={[programLeft]} variant="blue" />
          <span className="text-gray-500">→</span>
          <ProgramChips programs={[programRight]} variant="purple" />

          {diffSummary && (
            <div className="flex items-center gap-2 ml-4 px-2 py-0.5 bg-gray-200/50 rounded text-[11px] font-mono">
              {diffSummary.added !== undefined && (
                <span className="text-green-600 font-bold">
                  +{diffSummary.added}
                </span>
              )}
              {diffSummary.deleted !== undefined && (
                <span className="text-red-600 font-bold">
                  -{diffSummary.deleted}
                </span>
              )}
              {diffSummary.modified !== undefined && (
                <span className="text-blue-600 font-bold">
                  ~{diffSummary.modified}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${btnClass} ${copiedKey === "diff" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            title={t("diff.copyUnified")}
            onClick={() =>
              copy(
                unifiedDiff ||
                  `--- ${labelLeft}\n+++ ${labelRight}\n${codeLeft}\n${codeRight}`,
                "diff",
              )
            }
          >
            <FileCode2 className="w-3.5 h-3.5" />
            {copiedKey === "diff" ? t("code.copied") : t("diff.copyDiff")}
          </button>

          {/* Chat toggle */}
          {dbPath && (
            <button
              type="button"
              className={`${btnClass} ${chatOpen ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              title={
                chatOpen ? t("code.hideMaestroChat") : t("code.showMaestroChat")
              }
              onClick={() => setChatOpen((v) => !v)}
            >
              {chatOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" />
              )}
              {chatOpen ? t("code.hideChat") : t("workspace.maestroChat")}
            </button>
          )}

          <button
            type="button"
            className="p-1.5 rounded hover:bg-gray-200"
            title={t("code.closeEsc")}
            onClick={onClose}
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Body: diff editor + optional chat panel */}
      <div className="flex-1 min-h-0 flex flex-row">
        {/* Diff editor pane */}
        <div
          className="relative min-h-0"
          style={{ flex: chatOpen ? "0 0 60%" : "1 1 100%" }}
        >
          {!codeLeft && !codeRight ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              {t("diff.noCode")}
            </div>
          ) : (
            <DiffEditor
              original={codeLeft}
              modified={codeRight}
              language={language}
              theme="vs"
              onMount={(diffEditor) => {
                diffEditorRef.current = diffEditor;
                setEditorReady(true);
                // Handle glyph clicks on both sides
                const setupGlyphClick = (
                  // biome-ignore lint/suspicious/noExplicitAny: Monaco editor instance
                  innerEditor: any,
                  side: "left" | "right",
                ) => {
                  // biome-ignore lint/suspicious/noExplicitAny: Monaco IEditorMouseEvent
                  innerEditor.onMouseDown((e: any) => {
                    if (e.target?.type !== 2) return;
                    const line = e.target.position?.lineNumber;
                    if (!line) return;
                    const note = notesRef.current.find(
                      (n) =>
                        (n.side === side ||
                          (n.side === null && side === "left")) &&
                        line >= n.startLine &&
                        line <= n.endLine,
                    );
                    if (note) handleCodeNote(note);
                  });
                };
                setupGlyphClick(diffEditor.getOriginalEditor(), "left");
                setupGlyphClick(diffEditor.getModifiedEditor(), "right");
              }}
              keepCurrentOriginalModel={true}
              keepCurrentModifiedModel={true}
              loading={
                <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("diff.loadingEditor")}
                </div>
              }
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: !chatOpen },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbers: "on",
                glyphMargin: true,
                wordWrap: "off",
                diffWordWrap: "off",
                renderOverviewRuler: true,
                hideUnchangedRegions: {
                  enabled: true,
                  revealLineCount: 3,
                  minimumLineCount: 5,
                  contextLineCount: 3,
                },
                originalEditable: false,
                automaticLayout: true,
              }}
            />
          )}

          <button
            type="button"
            className={`absolute bottom-3 left-3 ${btnClass} shadow-md backdrop-blur-sm ${
              copiedKey === "left"
                ? "bg-green-100/90 text-green-700"
                : "bg-red-50/90 text-red-700 hover:bg-red-100/90"
            }`}
            title={t("diff.copyNodeCode", { label: labelLeft })}
            onClick={() => copy(codeLeft, "left")}
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedKey === "left" ? t("code.copied") : t("diff.copyLeft")}
          </button>

          <button
            type="button"
            className={`absolute bottom-3 ${chatOpen ? "right-3" : "right-3"} ${btnClass} shadow-md backdrop-blur-sm ${
              copiedKey === "right"
                ? "bg-green-100/90 text-green-700"
                : "bg-green-50/90 text-green-700 hover:bg-green-100/90"
            }`}
            title={t("diff.copyNodeCode", { label: labelRight })}
            onClick={() => copy(codeRight, "right")}
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            {copiedKey === "right" ? t("code.copied") : t("diff.copyRight")}
          </button>
        </div>

        {/* Chat panel — deferred until DiffEditor is ready, then always mounted to preserve state */}
        {dbPath && (
          <div
            className="min-h-0 flex-shrink-0"
            style={{ width: chatOpen ? "40%" : 0, overflow: "hidden" }}
          >
            {editorReady ? (
              <ChatPanel
                dbPath={dbPath}
                mode={chatMode}
                programLeft={programLeft}
                programRight={programRight}
                onCodeNote={handleCodeNote}
                onNotesChanged={handleNotesChanged}
              />
            ) : chatOpen ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("code.loadingChat")}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
