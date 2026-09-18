import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import type { Step } from "react-joyride";
import { prepareStep } from "./transitions";

const canvas = '[data-guide-session] [data-tour="tree-canvas"]';
const menu = '[data-guide-session] [data-tour="node-context-menu"]';
const overview = '[data-guide-session] [data-tour="overview-sidebar"]';

function transitionEnvironment(t: TestContext) {
  const events = new EventTarget();
  const visible = new Set<string>([canvas]);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const anchor = {
    getBoundingClientRect: () => ({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 500,
      bottom: 400,
      width: 400,
      height: 300,
    }),
  };
  const replacements = {
    window: Object.assign(events, { innerWidth: 1280, innerHeight: 720 }),
    document: {
      querySelectorAll: (selector: string) =>
        visible.has(selector) ? [anchor] : [],
    },
    getComputedStyle: () => ({ visibility: "visible" }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const originals = Object.keys(replacements).map(
    (name) =>
      [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const controller = new AbortController();
  t.after(() => {
    controller.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  return {
    events,
    visible,
    anchor,
    signal: controller.signal,
    async paint(count = 5) {
      for (let i = 0; i < count; i++) {
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(i);
        await Promise.resolve();
      }
    },
  };
}

function step(target: string): Step {
  return { target, content: "Tour content" };
}

test("leaving a node menu restores the viewport before showing a tree step", async (t) => {
  const env = transitionEnvironment(t);
  env.visible.add(menu);
  const actions: string[] = [];
  env.events.addEventListener("tour:close-context-menu", () => {
    actions.push("close-menu");
    env.visible.delete(menu);
  });
  env.events.addEventListener("tour:fit-view", () => actions.push("fit"));
  let ready = false;
  const pending = prepareStep(step(canvas), step(menu), env.signal).then(
    (anchor) => {
      ready = true;
      return anchor;
    },
  );
  await env.paint();
  assert.deepEqual(actions, ["close-menu", "fit"]);
  assert.equal(ready, false, "wait for the viewport animation acknowledgment");
  env.events.dispatchEvent(new CustomEvent("tour:viewport-ready"));
  await env.paint();
  assert.equal(await pending, env.anchor);
});

test("consecutive node-menu steps retain their menu and zoom", async (t) => {
  const env = transitionEnvironment(t);
  env.visible.add(menu);
  const actions: string[] = [];
  for (const name of ["close-context-menu", "fit-view", "show-context-menu"]) {
    env.events.addEventListener(`tour:${name}`, () => actions.push(name));
  }
  const pending = prepareStep(step(menu), step(menu), env.signal);
  await env.paint();
  assert.equal(await pending, env.anchor);
  assert.deepEqual(actions, []);
});

test("a destination waits for the departing overview to finish closing", async (t) => {
  const env = transitionEnvironment(t);
  env.visible.add(overview);
  let closing = false;
  let ready = false;
  env.events.addEventListener("tour:close-overview", () => {
    closing = true;
  });
  const pending = prepareStep(step(canvas), step(overview), env.signal).then(
    (anchor) => {
      ready = true;
      return anchor;
    },
  );
  await env.paint();
  assert.equal(closing, true);
  assert.equal(ready, false, "a stable canvas cannot bypass panel cleanup");
  env.visible.delete(overview);
  await env.paint();
  assert.equal(await pending, env.anchor);
});
