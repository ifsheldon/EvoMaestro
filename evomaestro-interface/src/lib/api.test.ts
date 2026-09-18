import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  getCodexHistory,
  getGlobalCodexHistory,
  getPrograms,
  getWebSocketUrl,
  pauseRun,
  resetCodexConversation,
  sendCodexMessage,
  sendGlobalCodexMessage,
  startCodexChat,
  startGlobalCodexChat,
} from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("same-origin API routing", () => {
  test("reads and mutations use the frontend proxy without fetching private config", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      requests.push({ url: String(input), init });
      return Response.json({ status: "ok" });
    }) as typeof fetch;

    await getPrograms("demo with spaces/programs.sqlite");
    await pauseRun("demo with spaces/programs.sqlite");

    assert.equal(requests.length, 2);
    assert.equal(
      requests[0].url,
      "/api/get_programs?db_path=demo+with+spaces%2Fprograms.sqlite&timestamp_check=false",
    );
    assert.equal(requests[1].url, "/api/api/run/pause");
    assert.equal(requests[1].init?.method, "POST");
    for (const request of requests) {
      assert.equal(
        new Headers(request.init?.headers).has("X-Evolve-Token"),
        false,
      );
    }
  });

  test("WebSockets preserve the frontend origin and encode database identities", () => {
    const dbPath = "mock runs/中文 #1/programs.sqlite";
    for (const [page, expectedOrigin] of [
      [
        "https://evomaestro-demo.reify.ing/?db_path=ignored",
        "wss://evomaestro-demo.reify.ing",
      ],
      ["http://localhost:3100/", "ws://localhost:3100"],
    ]) {
      const socket = new URL(getWebSocketUrl(dbPath, new URL(page)));
      assert.equal(socket.origin, expectedOrigin);
      assert.equal(socket.pathname, `/api/ws/${encodeURIComponent(dbPath)}`);
      assert.equal(socket.search, "");
      assert.equal(socket.hash, "");
    }
  });
});

describe("Maestro conversation cancellation", () => {
  test("all history, stream, and reset requests pass their cancellation signal", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      requests.push({ url: String(input), init });
      return Response.json({ ok: true, threadId: null, messages: [] });
    }) as typeof fetch;
    const { signal } = new AbortController();
    const scope = {
      dbPath: "run/programs.sqlite",
      leftProgramId: "left",
      rightProgramId: "right",
    };
    await getCodexHistory(
      scope.leftProgramId,
      scope.rightProgramId,
      scope.dbPath,
      signal,
    );
    await getGlobalCodexHistory(scope.dbPath, signal);
    await startCodexChat(
      {
        ...scope,
        mode: "code_diff",
        taskDescription: "Task",
        leftGen: 0,
        rightGen: 1,
        language: "python",
        userMessage: "Explain",
      },
      signal,
    );
    await sendCodexMessage(
      "thread",
      "Explain",
      scope.leftProgramId,
      scope.rightProgramId,
      scope.dbPath,
      signal,
    );
    await startGlobalCodexChat(
      {
        dbPath: scope.dbPath,
        taskDescription: "Task",
        language: "python",
        programCount: 2,
        userMessage: "Explain",
      },
      signal,
    );
    await sendGlobalCodexMessage("thread", "Explain", scope.dbPath, signal);
    await resetCodexConversation(scope, signal);
    await resetCodexConversation({ dbPath: scope.dbPath }, signal);
    assert.equal(requests.length, 8);
    for (const request of requests) assert.equal(request.init?.signal, signal);
    assert.equal(requests[6].url, "/api/codex/reset");
    assert.deepEqual(JSON.parse(String(requests[6].init?.body)), scope);
    assert.deepEqual(JSON.parse(String(requests[7].init?.body)), {
      dbPath: scope.dbPath,
    });
  });

  test("failed durable reset rejects so callers retain their transcript", async () => {
    globalThis.fetch = (async () =>
      new Response("Cannot write cache", { status: 500 })) as typeof fetch;
    await assert.rejects(
      resetCodexConversation({ dbPath: "run/programs.sqlite" }),
      /500.*Cannot write cache/,
    );
  });

  test("stopping stream consumption cancels and releases the response body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"agent_message","text":"partial"}\n\n',
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    globalThis.fetch = (async () => new Response(body)) as typeof fetch;
    const stream = await sendGlobalCodexMessage(
      "thread",
      "Explain",
      "run/programs.sqlite",
    );
    for await (const event of stream) {
      assert.equal(event.type, "agent_message");
      break;
    }
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  });
});
