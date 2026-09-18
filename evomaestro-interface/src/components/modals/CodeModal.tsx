"use client";

import Editor from "@monaco-editor/react";
import {
  ClipboardCopy,
  Copy,
  Download,
  Loader2,
  MessageSquare,
  PanelRightClose,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
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

interface CodeModalProps {
  program: Program;
  /** Database path — required for Maestro chat. */
  dbPath?: string;
  onClose: () => void;
}

function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { copiedKey, copy };
}

/**
 * Full-screen modal showing a single program's code in a Monaco Editor,
 * with an optional Maestro chat panel on the right.
 */
export default function CodeModal({
  program,
  dbPath,
  onClose,
}: CodeModalProps) {
  const { t } = useI18n();
  const { copiedKey, copy } = useCopyFeedback();
  const [chatOpen, setChatOpen] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  // biome-ignore lint/suspicious/noExplicitAny: Monaco editor instance type
  const editorRef = useRef<any>(null);

  // biome-ignore lint/suspicious/noExplicitAny: Monaco decoration IDs
  const persistentDecorRef = useRef<any[]>([]);
  // biome-ignore lint/suspicious/noExplicitAny: Monaco decoration IDs
  const activeDecorRef = useRef<any[]>([]);
  const notesRef = useRef<CodeNote[]>([]);

  const handleNotesChanged = useCallback((notes: CodeNote[]) => {
    notesRef.current = notes;
    const editor = editorRef.current;
    if (!editor) return;
    // Persistent: orange bar + glyph icon (always visible)
    const decorations = notes.flatMap((note) => [
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
    persistentDecorRef.current = editor.deltaDecorations(
      persistentDecorRef.current,
      decorations,
    );
  }, []);

  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCodeNote = useCallback((note: CodeNote) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(note.startLine);
    // Active: orange background (only on click, auto-clears after 5s)
    activeDecorRef.current = editor.deltaDecorations(activeDecorRef.current, [
      {
        range: {
          startLineNumber: note.startLine,
          startColumn: 1,
          endLineNumber: note.endLine,
          endColumn: 1,
        },
        options: { isWholeLine: true, className: "code-note-active" },
      },
    ]);
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    const idsToRemove = activeDecorRef.current;
    activeTimerRef.current = setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.deltaDecorations(idsToRemove, []);
        if (activeDecorRef.current === idsToRemove) {
          activeDecorRef.current = [];
        }
      }
    }, 5000);
  }, []);

  const language = program.language || "python";

  // Close on Escape
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

  const handleDownload = () => {
    const blob = new Blob([program.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext =
      language === "python"
        ? "py"
        : language === "javascript"
          ? "js"
          : language;
    a.download = `program_${program.id.slice(0, 8)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
            {t("common.code")}
          </span>
          <ProgramChips programs={[program]} variant="purple" />
        </div>

        <div className="flex items-center gap-1">
          {/* Download */}
          <button
            type="button"
            className={`${btnClass} bg-gray-200 text-gray-700 hover:bg-gray-300`}
            onClick={handleDownload}
            title={t("code.downloadFile")}
          >
            <Download className="w-3.5 h-3.5" />
            {t("common.download")}
          </button>

          {/* Copy Code */}
          <button
            type="button"
            className={`${btnClass} ${
              copiedKey === "code"
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
            onClick={() => copy(program.code, "code")}
            title={t("code.copyCode")}
          >
            {copiedKey === "code" ? (
              <ClipboardCopy className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedKey === "code" ? t("code.copied") : t("common.copy")}
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

      {/* Body: editor + optional chat panel */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Editor pane */}
        <div
          className="relative min-h-0 overflow-hidden"
          style={{ flex: chatOpen ? "0 0 70%" : "1 1 100%" }}
        >
          <Editor
            defaultLanguage={language}
            value={program.code}
            theme="vs"
            onMount={(editor) => {
              editorRef.current = editor;
              setEditorReady(true);
              // Handle glyph margin clicks → activate note background
              // biome-ignore lint/suspicious/noExplicitAny: Monaco IEditorMouseEvent
              editor.onMouseDown((e: any) => {
                // Monaco MouseTargetType.GUTTER_GLYPH_MARGIN = 2
                if (e.target?.type !== 2) return;
                const line = e.target.position?.lineNumber;
                if (!line) return;
                const note = notesRef.current.find(
                  (n) => line >= n.startLine && line <= n.endLine,
                );
                if (note) handleCodeNote(note);
              });
            }}
            loading={
              <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("code.loadingEditor")}
              </div>
            }
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              padding: { top: 12, bottom: 12 },
              automaticLayout: true,
              glyphMargin: true,
            }}
          />
        </div>

        {/* Chat panel — deferred until editor is ready, then always mounted to preserve state */}
        {dbPath && (
          <div
            className="min-h-0 flex-shrink-0 h-full"
            style={{ width: chatOpen ? "30%" : 0, overflow: "hidden" }}
          >
            {editorReady ? (
              <ChatPanel
                dbPath={dbPath}
                mode="code_view"
                programLeft={program}
                programRight={program}
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
