"use client";

import hljs from "highlight.js";
import {
  Bot,
  ChevronRight,
  Loader2,
  Send,
  Terminal,
  Trash2,
} from "lucide-react";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";
import {
  type CodexSSEEvent,
  type ExperimentConfig,
  type GlobalCodexStartParams,
  getExperimentConfig,
  getGlobalCodexHistory,
  resetCodexConversation,
  sendGlobalCodexMessage,
  startGlobalCodexChat,
} from "@/lib/api";
import { ChatRequests } from "@/lib/chatRequests";
import MaestroChatLock from "./MaestroChatLock";

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

// ── Shared types (same as ChatPanel) ───────────────────────────────────
type ThinkingItem =
  | { kind: "reasoning"; text: string }
  | {
      kind: "command";
      command: string;
      output: string;
      exitCode: number | null;
    };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinkingItems?: ThinkingItem[];
}

// ── Collapsible detail components ──────────────────────────────────────

function ReasoningBlock({ text }: { text: string }) {
  return (
    <div className="text-xs text-gray-500 italic whitespace-pre-wrap leading-relaxed">
      {text}
    </div>
  );
}

function CommandBlock({
  command,
  output,
  exitCode,
}: {
  command: string;
  output: string;
  exitCode: number | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasOutput = output.trim().length > 0;
  return (
    <div className="text-xs font-mono">
      <button
        type="button"
        className="flex items-center gap-1 text-gray-600 hover:text-gray-800 w-full text-left"
        onClick={() => hasOutput && setOpen((v) => !v)}
      >
        <Terminal className="w-3 h-3 flex-shrink-0" />
        <span className="truncate flex-1">{command}</span>
        {exitCode !== null && exitCode !== 0 && (
          <span className="text-red-500 flex-shrink-0">
            {t("chat.exitCode", { code: exitCode })}
          </span>
        )}
        {hasOutput && (
          <ChevronRight
            className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {open && hasOutput && (
        <pre className="mt-1 p-2 bg-gray-900 text-gray-200 rounded text-[10px] leading-tight overflow-x-auto max-h-40 overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  );
}

function ThinkingSection({ items }: { items: ThinkingItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const cmdCount = items.filter((i) => i.kind === "command").length;
  const label =
    cmdCount > 0
      ? t("chat.thinkingCommands", { count: cmdCount })
      : t("chat.thinking");

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {open && (
        <div className="mt-1.5 ml-4 space-y-1.5 border-l-2 border-gray-200 pl-2">
          {items.map((item, i) => {
            const key = `${item.kind}-${i}`;
            return item.kind === "reasoning" ? (
              <ReasoningBlock key={key} text={item.text} />
            ) : (
              <CommandBlock
                key={key}
                command={item.command}
                output={item.output}
                exitCode={item.exitCode}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface GlobalChatPanelProps {
  dbPath: string;
  programCount: number;
  onClose: () => void;
}

export default function GlobalChatPanel(props: GlobalChatPanelProps) {
  const { dataset } = useEvolveShell();
  if (dataset?.path !== props.dbPath || !dataset.maestro_chat_enabled) {
    return (
      <MaestroChatLock
        reason={
          dataset?.path === props.dbPath && dataset.role !== "run"
            ? dataset.role
            : "checking"
        }
        onClose={props.onClose}
      />
    );
  }
  return <ActiveGlobalChatPanel key={props.dbPath} {...props} />;
}

function ActiveGlobalChatPanel({
  dbPath,
  programCount,
  onClose,
}: GlobalChatPanelProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [requests] = useState(() => new ChatRequests());

  const [threadId, setThreadId] = useState<string | null>(null);
  const [config, setConfig] = useState<ExperimentConfig | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => requests.cancel(), [requests]);

  // Fetch experiment config
  useEffect(() => {
    const controller = new AbortController();
    getExperimentConfig(dbPath, controller.signal)
      .then((cfg) => {
        if (!controller.signal.aborted) setConfig(cfg);
      })
      .catch(() => {});
    return () => {
      controller.abort();
    };
  }, [dbPath]);

  // Load history until a send, reset, or unmount cancels it.
  useEffect(() => {
    const controller = requests.start("history");
    if (!controller) return;
    getGlobalCodexHistory(dbPath, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return;
        setThreadId(history.threadId);
        setMessages(history.messages);
      })
      .catch(() => {
        // History is optional; a failed read leaves a fresh conversation.
      })
      .finally(() => requests.finish(controller));
    return () => {
      controller.abort();
      requests.finish(controller);
    };
  }, [dbPath, requests]);

  // Auto-scroll
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const processSSEStream = useCallback(
    async (
      events: AsyncGenerator<CodexSSEEvent, void, unknown>,
      signal: AbortSignal,
    ) => {
      const items: Array<
        | { kind: "agent_message"; text: string }
        | {
            kind: "command";
            command: string;
            output: string;
            exitCode: number | null;
          }
        | { kind: "reasoning"; text: string }
      > = [];

      const updateMessage = () => {
        let answerIdx = -1;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].kind === "agent_message") {
            answerIdx = i;
            break;
          }
        }

        const thinkingItems: ThinkingItem[] = [];
        let content = "";

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (i === answerIdx) {
            content = item.kind === "agent_message" ? item.text : "";
          } else if (
            item.kind === "agent_message" ||
            item.kind === "reasoning"
          ) {
            thinkingItems.push({ kind: "reasoning", text: item.text });
          } else if (item.kind === "command") {
            thinkingItems.push({
              kind: "command",
              command: item.command,
              output: item.output,
              exitCode: item.exitCode,
            });
          }
        }

        setMessages((prev) => {
          if (signal.aborted) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          const msg: ChatMessage = {
            role: "assistant",
            content,
            thinkingItems: thinkingItems.length > 0 ? thinkingItems : undefined,
          };
          if (last?.role === "assistant") {
            updated[updated.length - 1] = msg;
          } else {
            updated.push(msg);
          }
          return updated;
        });
      };

      for await (const event of events) {
        if (signal.aborted) break;
        if (event.type === "agent_message") {
          items.push({ kind: "agent_message", text: event.text });
          updateMessage();
        } else if (event.type === "command") {
          items.push({
            kind: "command",
            command: event.command,
            output: event.output,
            exitCode: event.exitCode,
          });
          updateMessage();
        } else if (event.type === "reasoning") {
          items.push({ kind: "reasoning", text: event.text });
          updateMessage();
        } else if (event.type === "done") {
          if (event.threadId) setThreadId(event.threadId);
        } else if (event.type === "error") {
          // Let the start endpoint resolve the saved conversation on retry.
          setThreadId(null);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `**${t("common.error")}:** ${event.error}`,
            },
          ]);
        }
      }
    },
    [t],
  );

  const handleSend = useCallback(
    async (overrideMessage?: string) => {
      const trimmed = overrideMessage ?? input.trim();
      if (!trimmed || isLoading || isResetting) return;
      const controller = requests.start("send");
      if (!controller) return;
      setResetError(null);

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setIsLoading(true);

      try {
        let events: AsyncGenerator<CodexSSEEvent, void, unknown>;

        if (threadId) {
          events = await sendGlobalCodexMessage(
            threadId,
            trimmed,
            dbPath,
            controller.signal,
          );
        } else {
          const params: GlobalCodexStartParams = {
            dbPath,
            taskDescription: config?.task_sys_msg ?? "",
            language: config?.language ?? "python",
            programCount,
            userMessage: trimmed,
          };
          events = await startGlobalCodexChat(params, controller.signal);
        }

        await processSSEStream(events, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        // Let the start endpoint resolve the saved conversation on retry.
        setThreadId(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `**${t("common.error")}:** ${
              err instanceof Error ? err.message : t("chat.responseFailed")
            }`,
          },
        ]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
        requests.finish(controller);
      }
    },
    [
      input,
      isLoading,
      isResetting,
      requests,
      threadId,
      config,
      dbPath,
      programCount,
      processSSEStream,
      t,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(async () => {
    const controller = requests.start("reset");
    if (!controller) return;
    setIsResetting(true);
    setIsLoading(false);
    setResetError(null);
    try {
      await resetCodexConversation({ dbPath }, controller.signal);
      if (controller.signal.aborted) return;
      setMessages([]);
      setThreadId(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setResetError(
        `${t("chat.clearFailed")}${err instanceof Error ? ` ${err.message}` : ""}`,
      );
    } finally {
      if (!controller.signal.aborted) setIsResetting(false);
      requests.finish(controller);
    }
  }, [dbPath, requests, t]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Bot className="w-4 h-4 text-emerald-500" />
          {t("workspace.maestroChat")}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title={t("chat.clearConversation")}
            onClick={handleClear}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-lg leading-none"
            title={t("common.close")}
            onClick={onClose}
          >
            &times;
          </button>
        </div>
      </div>

      {resetError && (
        <div
          role="alert"
          className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100"
        >
          {resetError}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
            <Bot className="w-8 h-8 text-gray-300" />
            <p>{t("chat.askExperiment")}</p>
            <p className="text-xs text-gray-300">
              {t("chat.experimentCapabilities")}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={`msg-${msg.role}-${String((i * 2654435761) >>> 0).slice(0, 8)}`}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800"
              }`}
            >
              {msg.role === "assistant" ? (
                <>
                  {msg.thinkingItems && msg.thinkingItems.length > 0 && (
                    <ThinkingSection items={msg.thinkingItems} />
                  )}
                  {msg.content ? (
                    <div
                      className="prose prose-sm max-w-none prose-pre:bg-gray-50 prose-pre:text-xs prose-code:text-xs"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered from Maestro response via marked
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(msg.content, {
                          async: false,
                        }) as string,
                      }}
                    />
                  ) : (
                    isLoading && (
                      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t("chat.working")}
                      </div>
                    )
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-2 items-center text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("chat.thinking")}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions + Input */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-t border-gray-200">
        {!isLoading && !isResetting && (
          <div className="mb-2">
            <button
              type="button"
              disabled={isLoading || isResetting}
              className="text-xs px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleSend(t("chat.statusPrompt"))}
            >
              {t("chat.statusAction")}
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-gray-400"
            placeholder={t("chat.placeholderExperiment")}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || isResetting}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            className={`p-2 rounded-lg transition-colors ${
              isLoading || isResetting || !input.trim()
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
            onClick={() => handleSend()}
            disabled={isLoading || isResetting || !input.trim()}
            title={t("chat.send")}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
