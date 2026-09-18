import type {
  DatabaseFile,
  DatasetInfo,
  MetaContent,
  MetaFile,
  Program,
  RunStatus,
} from "@/types";

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean>,
) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      query.set(key, String(value));
    });
  }

  const suffix = query.toString();
  return `/api${path}${suffix ? `?${suffix}` : ""}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return (await response.json()) as T;
}

export async function getDatasetInfo(
  dbPath: string,
  signal?: AbortSignal,
): Promise<DatasetInfo> {
  return fetchJson<DatasetInfo>(
    buildUrl("/dataset", { db_path: dbPath }),
    signal,
  );
}

export async function getGuideDataset(
  signal?: AbortSignal,
): Promise<DatasetInfo> {
  return fetchJson<DatasetInfo>(buildUrl("/guide_dataset"), signal);
}

export async function listDatabases(
  signal?: AbortSignal,
): Promise<DatabaseFile[]> {
  return fetchJson<DatabaseFile[]>(buildUrl("/list_databases"), signal);
}

export async function getPrograms(
  dbPath: string,
  options?: { timestampCheck?: boolean; signal?: AbortSignal },
): Promise<Program[] | { last_modified_timestamp?: number; length?: number }> {
  return fetchJson<
    Program[] | { last_modified_timestamp?: number; length?: number }
  >(
    buildUrl("/get_programs", {
      db_path: dbPath,
      timestamp_check: options?.timestampCheck ? "true" : "false",
    }),
    options?.signal,
  );
}

export async function getMetaFiles(
  dbPath: string,
  signal?: AbortSignal,
): Promise<MetaFile[]> {
  return fetchJson<MetaFile[]>(
    buildUrl("/get_meta_files", { db_path: dbPath }),
    signal,
  );
}

export async function getMetaContent(
  dbPath: string,
  generation: number,
  signal?: AbortSignal,
): Promise<MetaContent> {
  return fetchJson<MetaContent>(
    buildUrl("/get_meta_content", {
      db_path: dbPath,
      generation,
    }),
    signal,
  );
}

// ---------------------------------------------------------------------------
// Interactive evolution API helpers
// ---------------------------------------------------------------------------

async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return (await response.json()) as T;
}

export async function getRunStatus(dbPath: string): Promise<RunStatus> {
  return fetchJson<RunStatus>(buildUrl("/api/run/status", { db_path: dbPath }));
}

export async function pauseRun(
  dbPath: string,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/pause"), { db_path: dbPath });
}

export async function resumeRun(
  dbPath: string,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/resume"), { db_path: dbPath });
}

export async function stopRun(
  dbPath: string,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/stop"), { db_path: dbPath });
}

export async function startRun(
  dbPath: string,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/start"), { db_path: dbPath });
}

export async function setTarget(
  dbPath: string,
  targetGenerations: number,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/set_target"), {
    db_path: dbPath,
    target_generations: targetGenerations,
  });
}

export async function stepRun(
  dbPath: string,
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/step"), { db_path: dbPath });
}

export async function submitSuggestion(
  dbPath: string,
  parentId: string,
  prompt: string,
  patchType: string = "full",
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/suggest"), {
    db_path: dbPath,
    parent_id: parentId,
    prompt,
    patch_type: patchType,
  });
}

export async function submitMerge(
  dbPath: string,
  parentIds: string[],
  prompt: string = "",
  patchType: string = "cross",
): Promise<{ status: string; command_id: number }> {
  return postJson(buildUrl("/api/run/merge"), {
    db_path: dbPath,
    parent_ids: parentIds,
    prompt,
    patch_type: patchType,
  });
}

export async function banPrograms(
  dbPath: string,
  programIds: string[],
): Promise<{ status: string }> {
  return postJson(buildUrl("/api/run/ban"), {
    db_path: dbPath,
    program_ids: programIds,
  });
}

export async function unbanPrograms(
  dbPath: string,
  programIds: string[],
): Promise<{ status: string }> {
  return postJson(buildUrl("/api/run/unban"), {
    db_path: dbPath,
    program_ids: programIds,
  });
}

export async function getBannedIds(
  dbPath: string,
): Promise<{ banned_ids: string[] }> {
  return fetchJson(buildUrl("/api/run/banned", { db_path: dbPath }));
}

/** Route realtime updates through the same frontend origin as HTTP requests. */
export function getWebSocketUrl(dbPath: string, pageUrl: URL): string {
  const url = new URL(`/api/ws/${encodeURIComponent(dbPath)}`, pageUrl);
  url.protocol = pageUrl.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// ---------------------------------------------------------------------------
// Review Prioritization settings
// ---------------------------------------------------------------------------

export interface ReviewPrioritizationSettings {
  mode: "score_change" | "dissimilarity";
  score_change_moderate: number;
  score_change_high: number;
  dissimilarity_moderate: number;
  dissimilarity_high: number;
  dissimilarity_embedding: "code" | "reasoning";
  is_custom: boolean;
}

export async function getReviewPrioritizationSettings(
  dbPath: string,
): Promise<ReviewPrioritizationSettings> {
  return fetchJson<ReviewPrioritizationSettings>(
    buildUrl("/api/run/review_prioritization_settings", { db_path: dbPath }),
  );
}

export async function updateReviewPrioritizationSettings(
  dbPath: string,
  settings: Omit<ReviewPrioritizationSettings, "is_custom">,
): Promise<{
  status: string;
  updated?: number;
  counts?: Record<string, number>;
}> {
  return postJson(buildUrl("/api/run/review_prioritization_settings"), {
    db_path: dbPath,
    ...settings,
  });
}

// ---------------------------------------------------------------------------
// Experiment config
// ---------------------------------------------------------------------------

export interface ExperimentConfig {
  task_sys_msg: string;
  results_dir: string;
  language: string;
  uses_custom_review_prioritization: boolean;
  num_islands?: number;
}

export async function getExperimentConfig(
  dbPath: string,
  signal?: AbortSignal,
): Promise<ExperimentConfig> {
  return fetchJson<ExperimentConfig>(
    buildUrl("/experiment_config", { db_path: dbPath }),
    signal,
  );
}

// ---------------------------------------------------------------------------
// Maestro chat helpers (SSE-based)
// ---------------------------------------------------------------------------

export type CodexSSEEvent =
  | { type: "agent_message"; text: string }
  | {
      type: "command";
      command: string;
      output: string;
      exitCode: number | null;
    }
  | { type: "reasoning"; text: string }
  | { type: "done"; threadId: string }
  | { type: "error"; error: string };

export type ChatMode = "code_change" | "code_diff" | "code_view";

export interface CodexStartParams {
  mode: ChatMode;
  dbPath: string;
  taskDescription: string;
  leftProgramId: string;
  rightProgramId: string;
  leftGen: number;
  rightGen: number;
  leftScore?: number | null;
  rightScore?: number | null;
  language: string;
  userMessage: string;
}

async function* readSSE(
  response: Response,
): AsyncGenerator<CodexSSEEvent, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (!done) {
        buffer += decoder.decode(value, { stream: true });
      } else {
        // Flush the decoder's internal state
        buffer += decoder.decode(undefined, { stream: false });
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as CodexSSEEvent;
          } catch {
            // skip malformed events
          }
        }
      }

      if (done) break;
    }

    // Process any remaining data in the buffer after stream ends
    if (buffer.startsWith("data: ")) {
      try {
        yield JSON.parse(buffer.slice(6)) as CodexSSEEvent;
      } catch {
        // skip malformed events
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Start a new Maestro conversation (or resume a cached one) and stream
 * the response. Returns an async generator of SSE events.
 */
export async function startCodexChat(
  params: CodexStartParams,
  signal?: AbortSignal,
): Promise<AsyncGenerator<CodexSSEEvent, void, unknown>> {
  const response = await fetch("/api/codex/start", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return readSSE(response);
}

// ---------------------------------------------------------------------------
// Maestro history
// ---------------------------------------------------------------------------

export type CodexHistoryThinkingItem =
  | { kind: "reasoning"; text: string }
  | {
      kind: "command";
      command: string;
      output: string;
      exitCode: number | null;
    };

export interface CodexHistoryMessage {
  role: "user" | "assistant";
  content: string;
  thinkingItems?: CodexHistoryThinkingItem[];
}

export interface CodexHistoryResponse {
  threadId: string | null;
  messages: CodexHistoryMessage[];
}

/**
 * Fetch chat history for a program pair. Returns the cached threadId (if
 * valid) and all past messages. If the session file is gone, the server
 * automatically invalidates the cache and returns null.
 */
export async function getCodexHistory(
  leftProgramId: string,
  rightProgramId: string,
  dbPath: string,
  signal?: AbortSignal,
): Promise<CodexHistoryResponse> {
  const params = new URLSearchParams({ leftProgramId, rightProgramId, dbPath });
  const response = await fetch(`/api/codex/history?${params.toString()}`, {
    signal,
  });
  if (!response.ok) {
    return { threadId: null, messages: [] };
  }
  return (await response.json()) as CodexHistoryResponse;
}

/**
 * Send a follow-up message on an existing Maestro thread and stream the
 * response. Pass program IDs so the server can update the cached session path.
 */
export async function sendCodexMessage(
  threadId: string,
  message: string,
  leftProgramId: string,
  rightProgramId: string,
  dbPath: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<CodexSSEEvent, void, unknown>> {
  const response = await fetch("/api/codex/chat", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId,
      message,
      leftProgramId,
      rightProgramId,
      dbPath,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return readSSE(response);
}

// ---------------------------------------------------------------------------
// Global Maestro chat helpers
// ---------------------------------------------------------------------------

export interface GlobalCodexStartParams {
  dbPath: string;
  taskDescription: string;
  language: string;
  programCount: number;
  userMessage: string;
}

export async function startGlobalCodexChat(
  params: GlobalCodexStartParams,
  signal?: AbortSignal,
): Promise<AsyncGenerator<CodexSSEEvent, void, unknown>> {
  const response = await fetch("/api/codex/global-start", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return readSSE(response);
}

export async function sendGlobalCodexMessage(
  threadId: string,
  message: string,
  dbPath: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<CodexSSEEvent, void, unknown>> {
  const response = await fetch("/api/codex/global-chat", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, message, dbPath }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return readSSE(response);
}

export async function getGlobalCodexHistory(
  dbPath: string,
  signal?: AbortSignal,
): Promise<CodexHistoryResponse> {
  const params = new URLSearchParams({ dbPath });
  const response = await fetch(
    `/api/codex/global-history?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    return { threadId: null, messages: [] };
  }
  return (await response.json()) as CodexHistoryResponse;
}

export type CodexConversationScope =
  | { dbPath: string; leftProgramId: string; rightProgramId: string }
  | { dbPath: string; leftProgramId?: never; rightProgramId?: never };

/** Forget the durable thread mapping before the client clears its transcript. */
export async function resetCodexConversation(
  scope: CodexConversationScope,
  signal?: AbortSignal,
): Promise<{ ok: true }> {
  return postJson("/api/codex/reset", scope, signal);
}
