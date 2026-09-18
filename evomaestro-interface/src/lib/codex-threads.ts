import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");

interface CacheEntry {
  threadId: string | null;
  sessionPath?: string;
  operationId?: string;
}

type ThreadCache = Record<string, CacheEntry>;

// Next.js route bundles share one process; keep cancellation shared between them.
const serverState = globalThis as typeof globalThis & {
  __evomaestroChatRuns?: Map<string, AbortController>;
};
serverState.__evomaestroChatRuns ??= new Map();
const activeRuns = serverState.__evomaestroChatRuns;

/** A conversation scoped to a backend-authorized dataset and program selection. */
export class CodexConversation {
  private constructor(
    readonly resultsDir: string,
    private readonly key: string,
  ) {}

  static global(resultsDir: string): CodexConversation {
    return new CodexConversation(resultsDir, "__global__");
  }

  static programPair(
    resultsDir: string,
    leftProgramId: string,
    rightProgramId: string,
  ): CodexConversation {
    return new CodexConversation(
      resultsDir,
      `${leftProgramId}:${rightProgramId}`,
    );
  }

  private get filePath(): string {
    return path.join(this.resultsDir, ".codex-threads.json");
  }

  private get activeKey(): string {
    return JSON.stringify([this.resultsDir, this.key]);
  }

  private readCache(): ThreadCache {
    let text: string;
    try {
      text = fs.readFileSync(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Maestro conversation cache");
    }
    const cache: ThreadCache = {};
    for (const [key, entry] of Object.entries(value)) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !(
          entry.threadId === null ||
          (typeof entry.threadId === "string" && entry.threadId)
        ) ||
        (entry.sessionPath !== undefined &&
          typeof entry.sessionPath !== "string") ||
        (entry.operationId !== undefined &&
          typeof entry.operationId !== "string")
      ) {
        throw new Error("Invalid Maestro conversation cache entry");
      }
      cache[key] = entry;
    }
    return cache;
  }

  private writeCache(cache: ThreadCache): void {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(cache, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, this.filePath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  get entry(): CacheEntry | null {
    return this.readCache()[this.key] ?? null;
  }

  private matches(expected: CacheEntry): boolean {
    const actual = this.entry;
    return (
      actual !== null &&
      actual.operationId === expected.operationId &&
      actual.threadId === expected.threadId
    );
  }

  /** Forget the saved binding before aborting its active turn. */
  reset(): void {
    const cache = this.readCache();
    delete cache[this.key];
    this.writeCache(cache);
    activeRuns.get(this.activeKey)?.abort();
    activeRuns.delete(this.activeKey);
  }

  /** Claim this conversation before awaiting the provider or any session lookup. */
  begin(requestSignal: AbortSignal) {
    requestSignal.throwIfAborted();
    const cache = this.readCache();
    const entry: CacheEntry = {
      ...cache[this.key],
      threadId: cache[this.key]?.threadId ?? null,
      operationId: randomUUID(),
    };
    cache[this.key] = entry;
    this.writeCache(cache);
    activeRuns.get(this.activeKey)?.abort();
    const controller = new AbortController();
    activeRuns.set(this.activeKey, controller);
    const signal = AbortSignal.any([requestSignal, controller.signal]);
    const isCurrent = () => !signal.aborted && this.matches(entry);
    return {
      threadId: entry.threadId,
      signal,
      isCurrent,
      save: (threadId: string | null, sessionPath?: string): boolean => {
        if (!isCurrent()) return false;
        const currentCache = this.readCache();
        if (entry.threadId !== threadId) delete entry.sessionPath;
        entry.threadId = threadId;
        if (sessionPath) entry.sessionPath = sessionPath;
        currentCache[this.key] = entry;
        this.writeCache(currentCache);
        return true;
      },
      abort: () => controller.abort(),
      finish: () => {
        if (activeRuns.get(this.activeKey) === controller) {
          activeRuns.delete(this.activeKey);
        }
      },
    };
  }

  /** Ignore a history result if a reset or another turn replaced its binding. */
  async history(): Promise<{
    threadId: string | null;
    messages: HistoryMessage[];
  }> {
    const empty = { threadId: null, messages: [] };
    const entry = this.entry;
    if (!entry?.threadId) return empty;
    const sessionPath =
      entry.sessionPath && fs.existsSync(entry.sessionPath)
        ? entry.sessionPath
        : await findSessionFile(entry.threadId);
    if (!this.matches(entry)) return empty;
    if (!sessionPath) {
      this.reset();
      return empty;
    }
    try {
      const messages = await parseSessionHistory(sessionPath);
      if (!this.matches(entry)) return empty;
      const cache = this.readCache();
      cache[this.key] = { ...entry, sessionPath };
      this.writeCache(cache);
      return { threadId: entry.threadId, messages };
    } catch {
      if (this.matches(entry)) this.reset();
      return empty;
    }
  }
}

// ---------------------------------------------------------------------------
// Session file discovery & history parsing
// ---------------------------------------------------------------------------

/**
 * Asynchronously search ~/.codex/sessions/ for the JSONL file whose name
 * contains the given threadId.  Session files are named like:
 *   rollout-2026-03-10T15-22-48-{threadId}.jsonl
 */
export async function findSessionFile(
  threadId: string,
): Promise<string | null> {
  try {
    await fs.promises.access(CODEX_SESSIONS_DIR);
  } catch {
    return null;
  }

  async function walk(dir: string): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (
        entry.name.includes(threadId) &&
        entry.name.endsWith(".jsonl")
      ) {
        return full;
      }
    }
    return null;
  }

  return walk(CODEX_SESSIONS_DIR);
}

export type HistoryThinkingItem =
  | { kind: "reasoning"; text: string }
  | {
      kind: "command";
      command: string;
      output: string;
      exitCode: number | null;
    };

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  thinkingItems?: HistoryThinkingItem[];
}

// Internal types for the JSONL payload
interface SessionPayload {
  type?: string;
  role?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Parse a Codex session JSONL file and extract user/assistant messages.
 * Groups intermediate assistant messages and command executions into
 * `thinkingItems` on the final assistant message of each turn.
 */
export async function parseSessionHistory(
  sessionPath: string,
): Promise<HistoryMessage[]> {
  const messages: HistoryMessage[] = [];
  const stream = fs.createReadStream(sessionPath, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  // Per-turn accumulators
  let turnThinking: HistoryThinkingItem[] = [];
  let turnAssistantTexts: string[] = [];
  // Map call_id → command string for pairing with output
  const pendingCalls = new Map<string, string>();

  /** Flush accumulated assistant items into a single message. */
  function flushAssistantTurn() {
    if (turnAssistantTexts.length === 0) return;
    // Last assistant text is the answer; everything before is thinking
    const answer = turnAssistantTexts[turnAssistantTexts.length - 1];
    turnAssistantTexts.length -= 1;
    for (const text of turnAssistantTexts) {
      turnThinking.push({ kind: "reasoning", text });
    }
    turnAssistantTexts = [];
    messages.push({
      role: "assistant",
      content: answer,
      thinkingItems: turnThinking.length > 0 ? turnThinking : undefined,
    });
    turnThinking = [];
    pendingCalls.clear();
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as {
        type: string;
        payload: SessionPayload;
      };

      if (obj.type === "turn_context") {
        // New turn boundary — flush any pending assistant data
        flushAssistantTurn();
        continue;
      }

      if (obj.type !== "response_item") continue;
      const p = obj.payload;

      if (p.type === "message" && p.role === "user") {
        // Flush any pending assistant turn before the user message
        flushAssistantTurn();

        const texts = (p.content ?? [])
          .filter((c) => c.type === "input_text" && c.text)
          .map((c) => c.text as string);
        const combined = texts.join("\n");
        // Skip internal context injections
        if (
          combined.includes("<permissions instructions>") ||
          combined.includes("<environment_context>") ||
          combined.includes("# AGENTS.md instructions")
        ) {
          continue;
        }
        const userQuestionMatch = combined.match(
          /---\s*\n\s*User question:\s*([\s\S]+)$/,
        );
        if (userQuestionMatch) {
          messages.push({
            role: "user",
            content: userQuestionMatch[1].trim(),
          });
        } else {
          messages.push({ role: "user", content: combined });
        }
      } else if (p.type === "message" && p.role === "assistant") {
        const texts = (p.content ?? [])
          .filter((c) => c.type === "output_text" && c.text)
          .map((c) => c.text as string);
        if (texts.length > 0) {
          turnAssistantTexts.push(texts.join("\n"));
        }
      } else if (p.type === "function_call" && p.name === "exec_command") {
        // Extract command from arguments JSON
        try {
          const args = JSON.parse(p.arguments ?? "{}") as { cmd?: string };
          if (p.call_id && args.cmd) {
            pendingCalls.set(p.call_id, args.cmd);
          }
        } catch {
          // skip malformed arguments
        }
      } else if (p.type === "function_call_output" && p.call_id) {
        const cmd = pendingCalls.get(p.call_id);
        if (cmd) {
          // Extract exit code from output text
          const exitMatch = (p.output ?? "").match(
            /Process exited with code (\d+)/,
          );
          const exitCode = exitMatch ? Number(exitMatch[1]) : null;
          // Extract the actual output (after "Output:\n")
          const outputMatch = (p.output ?? "").match(/Output:\n([\s\S]*)$/);
          turnThinking.push({
            kind: "command",
            command: cmd,
            output: outputMatch ? outputMatch[1].trimEnd() : "",
            exitCode,
          });
          pendingCalls.delete(p.call_id);
        }
      }
      // reasoning items have encrypted content — nothing useful to extract
    } catch {
      // skip malformed lines
    }
  }

  // Flush any remaining assistant turn at end of file
  flushAssistantTurn();

  return messages;
}
