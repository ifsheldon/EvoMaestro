import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// Real cache writes stay in temporary directories; model and session discovery are stubbed.
const { CodexConversation } = await import("./codex-threads");
const sessionReads = mock(async () => null);
mock.module("@/lib/codex-threads", () => ({
  CodexConversation,
  findSessionFile: sessionReads,
}));
const modelConstructed = mock(() => {});
const startThread = mock(() => fakeThread);
const resumeThread = mock(() => fakeThread);
const runStreamed = mock(async () => ({
  events: (async function* () {
    yield {
      type: "item.completed",
      item: { type: "agent_message", text: "Stub answer" },
    };
  })(),
}));
const fakeThread = { id: "test-thread", runStreamed };
mock.module("@openai/codex-sdk", () => ({
  Codex: class {
    constructor() {
      modelConstructed();
    }
    startThread = startThread;
    resumeThread = resumeThread;
  },
}));

const postRoutes = await Promise.all(
  ["start", "global-start", "chat", "global-chat", "reset"].map(
    async (name) => ({
      name,
      handler: (await import(`../app/api/codex/${name}/route.ts`)).POST,
    }),
  ),
);
const getRoutes = await Promise.all(
  ["history", "global-history"].map(async (name) => ({
    name,
    handler: (await import(`../app/api/codex/${name}/route.ts`)).GET,
  })),
);
const originalFetch = globalThis.fetch;
const originalProxy = process.env.API_PROXY;
const authorizedDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "maestro-routes-"),
);
const cachePath = path.join(authorizedDirectory, ".codex-threads.json");
const originalPublicDemo = process.env.EVOMAESTRO_PUBLIC_DEMO;
function seedConversations(pairThread, globalThread) {
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      "parent:child": { threadId: pairThread },
      __global__: { threadId: globalThread },
    }),
  );
}
function cache() {
  return fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : {};
}
const backendFetch = mock(async () =>
  Response.json({ results_dir: authorizedDirectory }),
);
const requestBody = {
  dbPath: "runs/experiment/programs.sqlite",
  mode: "code_view",
  leftProgramId: "parent",
  rightProgramId: "child",
  leftGen: 0,
  rightGen: 1,
  taskDescription: "Offline test",
  language: "python",
  programCount: 2,
  userMessage: "Explain",
  message: "Continue",
  threadId: "test-thread",
  // These forged hints must never select the working directory or capability.
  resultsDir: "/untrusted/directory",
  role: "run",
  maestro_chat_enabled: true,
};

function postRequest(name, body) {
  return new Request(`http://localhost/api/codex/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function allRequests(body) {
  const responses = [];
  for (const { name, handler } of postRoutes) {
    responses.push(await handler(postRequest(name, body)));
  }
  for (const { name, handler } of getRoutes) {
    const params = new URLSearchParams(Object.entries(body));
    responses.push(
      await handler(
        new NextRequest(`http://localhost/api/codex/${name}?${params}`),
      ),
    );
  }
  return responses;
}

function expectNoModelOrSessionAccess() {
  expect(modelConstructed).not.toHaveBeenCalled();
  expect(fs.existsSync(cachePath)).toBe(false);
  expect(sessionReads).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const spy of [
    sessionReads,
    modelConstructed,
    startThread,
    resumeThread,
    runStreamed,
    backendFetch,
  ])
    spy.mockClear();
  fs.rmSync(cachePath, { force: true });
  delete process.env.EVOMAESTRO_PUBLIC_DEMO;
  backendFetch.mockImplementation(async () =>
    Response.json({ results_dir: authorizedDirectory }),
  );
  globalThis.fetch = backendFetch;
  process.env.API_PROXY = "http://backend.test:8001";
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(authorizedDirectory, { force: true, recursive: true });
  if (originalPublicDemo === undefined)
    delete process.env.EVOMAESTRO_PUBLIC_DEMO;
  else process.env.EVOMAESTRO_PUBLIC_DEMO = originalPublicDemo;
  if (originalProxy === undefined) delete process.env.API_PROXY;
  else process.env.API_PROXY = originalProxy;
});

test("all seven Maestro routes reject mock datasets before model or history access", async () => {
  backendFetch.mockImplementation(async () =>
    Response.json({ detail: "Disabled" }, { status: 403 }),
  );
  for (const dbPath of [
    "mock-demo/programs.sqlite",
    "examples/mock-guide/programs.sqlite",
  ]) {
    const responses = await allRequests({ ...requestBody, dbPath });
    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403, 403,
    ]);
  }
  expectNoModelOrSessionAccess();
  for (const [url, options] of backendFetch.mock.calls) {
    expect(url.origin).toBe("http://backend.test:8001");
    expect(url.pathname).toBe("/maestro_context");
    expect(options.cache).toBe("no-store");
  }
});

test("legacy directory-only requests and malformed identities cannot bypass authorization", async () => {
  const { dbPath: _omitted, ...directoryOnly } = requestBody;
  for (const body of [directoryOnly, { ...requestBody, dbPath: "" }]) {
    expect(
      (await allRequests(body)).map((response) => response.status),
    ).toEqual(Array(7).fill(400));
  }
  for (const { name, handler } of postRoutes) {
    for (const body of [null, [], { dbPath: 42 }]) {
      expect((await handler(postRequest(name, body))).status).toBe(400);
    }
  }
  expect(backendFetch).not.toHaveBeenCalled();
  expectNoModelOrSessionAccess();
});

test("a backend failure or malformed context fails closed on every route", async () => {
  for (const result of [
    () => {
      throw new Error("offline");
    },
    () => Response.json({ detail: "invalid manifest" }, { status: 500 }),
    () => Response.json({ results_dir: "relative/path" }),
    () => Response.json(null),
  ]) {
    backendFetch.mockImplementation(async () => result());
    expect(
      (await allRequests(requestBody)).map((response) => response.status),
    ).toEqual(Array(7).fill(503));
  }
  expectNoModelOrSessionAccess();
});

test("an out-of-root or missing dataset never reaches Maestro", async () => {
  for (const status of [400, 404]) {
    backendFetch.mockImplementation(async () => Response.json({}, { status }));
    expect(
      (
        await allRequests({
          ...requestBody,
          dbPath: "/outside/programs.sqlite",
        })
      ).map((response) => response.status),
    ).toEqual(Array(7).fill(status));
  }
  expectNoModelOrSessionAccess();
});

test("ordinary run starts use the server directory and still stream answers", async () => {
  for (const { name, handler } of postRoutes.filter(({ name }) =>
    name.endsWith("start"),
  )) {
    const response = await handler(postRequest(name, requestBody));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Stub answer");
  }
  expect(startThread).toHaveBeenCalledTimes(2);
  for (const [options] of startThread.mock.calls)
    expect(options.workingDirectory).toBe(authorizedDirectory);
  expect(cache()["parent:child"].threadId).toBe("test-thread");
  expect(cache().__global__.threadId).toBe("test-thread");
});

test("follow-ups cannot resume a conversation from another dataset or program pair", async () => {
  seedConversations("different-pair-thread", "different-run-thread");
  for (const { name, handler } of postRoutes.filter(({ name }) =>
    name.endsWith("chat"),
  )) {
    expect((await handler(postRequest(name, requestBody))).status).toBe(403);
  }
  expect(modelConstructed).not.toHaveBeenCalled();
  expect(resumeThread).not.toHaveBeenCalled();
  expect(sessionReads).not.toHaveBeenCalled();
});

test("matching ordinary conversations can resume and history stays scoped to the run", async () => {
  seedConversations("test-thread", "test-thread");
  for (const { name, handler } of postRoutes.filter(({ name }) =>
    name.endsWith("chat"),
  )) {
    const response = await handler(postRequest(name, requestBody));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Stub answer");
  }
  expect(resumeThread).toHaveBeenCalledTimes(2);
  const sessionPath = path.join(authorizedDirectory, "history.jsonl");
  fs.writeFileSync(sessionPath, "");
  const stored = cache();
  for (const entry of Object.values(stored)) entry.sessionPath = sessionPath;
  fs.writeFileSync(cachePath, JSON.stringify(stored));
  for (const { name, handler } of getRoutes) {
    const params = new URLSearchParams(requestBody);
    const response = await handler(
      new NextRequest(`http://localhost/api/codex/${name}?${params}`),
    );
    expect(await response.json()).toEqual({
      threadId: "test-thread",
      messages: [],
    });
  }
});

test("public-demo mode denies every route without asking the backend", async () => {
  process.env.EVOMAESTRO_PUBLIC_DEMO = "1";
  expect(
    (await allRequests(requestBody)).map((response) => response.status),
  ).toEqual(Array(7).fill(403));
  expect(backendFetch).not.toHaveBeenCalled();
  expectNoModelOrSessionAccess();
});

test("reset forgets only its authorized selection and the next start uses a fresh thread", async () => {
  const reset = postRoutes.find(({ name }) => name === "reset").handler;
  seedConversations("old-pair", "old-global");
  let response = await reset(postRequest("reset", requestBody));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(cache()["parent:child"]).toBeUndefined();
  expect(cache().__global__.threadId).toBe("old-global");
  const start = postRoutes.find(({ name }) => name === "start").handler;
  response = await start(postRequest("start", requestBody));
  expect(await response.text()).toContain("Stub answer");
  expect(startThread).toHaveBeenCalledTimes(1);
  expect(resumeThread).not.toHaveBeenCalled();
  response = await reset(postRequest("reset", { dbPath: requestBody.dbPath }));
  expect(response.status).toBe(200);
  expect(cache().__global__).toBeUndefined();
  expect(cache()["parent:child"].threadId).toBe("test-thread");
});

test("incomplete reset selection never clears the experiment conversation", async () => {
  seedConversations("old-pair", "old-global");
  const reset = postRoutes.find(({ name }) => name === "reset").handler;
  for (const body of [
    { dbPath: requestBody.dbPath, leftProgramId: "parent" },
    { dbPath: requestBody.dbPath, leftProgramId: "", rightProgramId: "child" },
  ]) {
    expect((await reset(postRequest("reset", body))).status).toBe(400);
  }
  expect(cache().__global__.threadId).toBe("old-global");
});

test("reset aborts an active SDK turn and late output cannot recreate its cache entry", async () => {
  let release;
  let providerSignal;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  runStreamed.mockImplementationOnce(async (_prompt, options) => {
    providerSignal = options.signal;
    return {
      events: (async function* () {
        yield { type: "thread.started", thread_id: "old-running" };
        await ready;
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: "Late old answer" },
        };
      })(),
    };
  });
  const start = postRoutes.find(({ name }) => name === "start").handler;
  const reset = postRoutes.find(({ name }) => name === "reset").handler;
  const response = await start(postRequest("start", requestBody));
  await reset(postRequest("reset", requestBody));
  expect(providerSignal.aborted).toBe(true);
  release();
  const text = await response.text();
  expect(text).not.toContain("Late old answer");
  expect(text).not.toContain('"type":"done"');
  expect(cache()["parent:child"]).toBeUndefined();
});

test("both prompt variants describe the actual SQLite score column", async () => {
  for (const { name, handler } of postRoutes.filter(({ name }) =>
    name.endsWith("start"),
  )) {
    const response = await handler(postRequest(name, requestBody));
    await response.text();
  }
  for (const [prompt] of runStreamed.mock.calls) {
    expect(prompt).toContain("`combined_score`");
    expect(prompt).not.toContain("`score`");
  }
});

test("late history cannot restore a cleared conversation or overwrite its replacement", async () => {
  const sessionPath = path.join(authorizedDirectory, "old-history.jsonl");
  fs.writeFileSync(
    sessionPath,
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Old conversation" }],
      },
    }),
  );
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ __global__: { threadId: "old-global", sessionPath } }),
  );
  const conversation = CodexConversation.global(authorizedDirectory);
  const pendingHistory = conversation.history();
  conversation.reset();
  const newTurn = conversation.begin(new AbortController().signal);
  newTurn.save("new-global");
  expect(await pendingHistory).toEqual({ threadId: null, messages: [] });
  expect(cache().__global__.threadId).toBe("new-global");
  expect(cache().__global__.sessionPath).toBeUndefined();
  newTurn.finish();
});

test("failed durable reset returns an error and preserves the cache", async () => {
  fs.writeFileSync(cachePath, "broken cache");
  const reset = postRoutes.find(({ name }) => name === "reset").handler;
  const response = await reset(postRequest("reset", requestBody));
  expect(response.status).toBe(500);
  expect(fs.readFileSync(cachePath, "utf8")).toBe("broken cache");
  expect(modelConstructed).not.toHaveBeenCalled();
});

test("a cancelled response aborts the provider and never writes a late completion", async () => {
  let release;
  let providerSignal;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  runStreamed.mockImplementationOnce(async (_prompt, options) => {
    providerSignal = options.signal;
    return {
      events: (async function* () {
        await wait;
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: "Late" },
        };
      })(),
    };
  });
  const start = postRoutes.find(({ name }) => name === "global-start").handler;
  const response = await start(postRequest("global-start", requestBody));
  await response.body.cancel();
  expect(providerSignal.aborted).toBe(true);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(cache().__global__.threadId).toBeNull();
});

test("a failed saved-session start recovers with full context but cancellation never retries", async () => {
  const start = postRoutes.find(({ name }) => name === "global-start").handler;
  seedConversations(null, "missing-global");
  runStreamed.mockImplementationOnce(async () => {
    throw new Error("Session missing");
  });
  const recovered = await start(postRequest("global-start", requestBody));
  expect(await recovered.text()).toContain("Stub answer");
  expect(startThread).toHaveBeenCalledTimes(1);
  expect(runStreamed.mock.calls[1][0]).toContain("## Experiment Overview");
  expect(cache().__global__.threadId).toBe("test-thread");

  const controller = new AbortController();
  runStreamed.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error("Aborted");
  });
  const request = new Request(postRequest("global-start", requestBody), {
    signal: controller.signal,
  });
  expect((await start(request)).status).toBe(499);
  expect(startThread).toHaveBeenCalledTimes(1);
});
