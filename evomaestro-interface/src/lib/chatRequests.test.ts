import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatRequests } from "./chatRequests";

test("a new message cancels pending history and ignores its late completion", async () => {
  const requests = new ChatRequests();
  const history = requests.start("history");
  assert.ok(history);
  let displayed = "new message";
  const lateHistory = Promise.resolve().then(() => {
    if (!history.signal.aborted) displayed = "old history";
    requests.finish(history);
  });
  const send = requests.start("send");
  assert.ok(send);
  await lateHistory;
  assert.equal(displayed, "new message");
  assert.equal(history.signal.aborted, true);
  assert.equal(send.signal.aborted, false);
  assert.equal(requests.start("send"), null);
});

test("reset cancels generation and stays exclusive after its stale finally runs", () => {
  const requests = new ChatRequests();
  const send = requests.start("send");
  assert.ok(send);
  const reset = requests.start("reset");
  assert.ok(reset);
  assert.equal(send.signal.aborted, true);
  requests.finish(send);
  for (const kind of ["history", "send", "reset"] as const) {
    assert.equal(requests.start(kind), null);
  }
  assert.equal(reset.signal.aborted, false);
  requests.finish(reset);
  assert.ok(requests.start("send"));
});

test("reset before delayed history starts cancels its signal", () => {
  const requests = new ChatRequests();
  const history = requests.start("history");
  assert.ok(history);
  const reset = requests.start("reset");
  assert.ok(reset);
  requests.finish(reset);
  assert.equal(history.signal.aborted, true);
  assert.ok(requests.start("send"));
});

test("unmount cancels the current request and permits a fresh mounted lifecycle", () => {
  const requests = new ChatRequests();
  const reset = requests.start("reset");
  assert.ok(reset);
  requests.cancel();
  assert.equal(reset.signal.aborted, true);
  const history = requests.start("history");
  assert.ok(history);
  requests.finish(reset);
  const send = requests.start("send");
  assert.ok(send);
  assert.equal(history.signal.aborted, true);
});
