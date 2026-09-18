import type { Step } from "react-joyride";

const events: Record<string, { request: string; ready?: string }> = {
  "fit-view": { request: "tour:fit-view", ready: "tour:viewport-ready" },
  "show-context-menu": {
    request: "tour:show-context-menu",
    ready: "tour:context-menu-ready",
  },
  "open-overview": { request: "tour:open-overview" },
  "open-settings": { request: "tour:open-settings" },
  "focus-crossover": {
    request: "tour:focus-crossover",
    ready: "tour:element-ready",
  },
  "focus-island-root": {
    request: "tour:focus-island-root",
    ready: "tour:element-ready",
  },
  "focus-ring-arc": {
    request: "tour:focus-ring-arc",
    ready: "tour:element-ready",
  },
};

export function cleanupTour(): void {
  for (const name of [
    "cancel",
    "close-context-menu",
    "close-overview",
    "close-settings",
    "hide-overlays",
  ]) {
    window.dispatchEvent(new CustomEvent(`tour:${name}`));
  }
}

/** Ignore retained, hidden Activity trees when locating an anchor. */
export function visibleAnchor(selector: string): Element | undefined {
  return [...document.querySelectorAll(selector)].find((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      getComputedStyle(element).visibility !== "hidden"
    );
  });
}

export function waitForAnchor(
  selector: string,
  signal: AbortSignal,
  closedTargets: readonly string[] = [],
): Promise<Element> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let stable = 0;
    let previous = "";
    const finish = (element?: Element) => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (element) resolve(element);
      else reject(new Error(`Guide target unavailable: ${selector}`));
    };
    const abort = () => finish();
    const timeout = setTimeout(() => finish(), 8000);
    const check = () => {
      if (signal.aborted) return finish();
      const element = closedTargets.some((target) => visibleAnchor(target))
        ? undefined
        : visibleAnchor(selector);
      const rect = element?.getBoundingClientRect();
      const position = rect
        ? [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(",")
        : "";
      stable = position && position === previous ? stable + 1 : 0;
      previous = position;
      if (element && stable >= 3) return finish(element);
      frame = requestAnimationFrame(check);
    };
    signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(check);
  });
}

function requestAction(
  action: { request: string; ready?: string },
  signal: AbortSignal,
): Promise<void> {
  if (!action.ready) {
    window.dispatchEvent(new CustomEvent(action.request));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const readyEvent = action.ready ?? "";
    const finish = (ok: boolean) => {
      clearTimeout(timeout);
      window.removeEventListener(readyEvent, ready);
      window.removeEventListener("tour:element-skip", failed);
      signal.removeEventListener("abort", failed);
      if (ok) resolve();
      else reject(new Error(`Guide action failed: ${action.request}`));
    };
    const ready = () => finish(true);
    const failed = () => finish(false);
    const timeout = setTimeout(failed, 8000);
    window.addEventListener(readyEvent, ready, { once: true });
    window.addEventListener("tour:element-skip", failed, { once: true });
    signal.addEventListener("abort", failed, { once: true });
    if (signal.aborted) return failed();
    window.dispatchEvent(new CustomEvent(action.request));
  });
}

/** Prepare the same target for forward, backward, and recovery navigation. */
export async function prepareStep(
  step: Step,
  previous: Step | undefined,
  signal: AbortSignal,
): Promise<Element> {
  const target = typeof step.target === "string" ? step.target : "body";
  const action = (step.data as { action?: string } | undefined)?.action;
  const contextTarget = '[data-guide-session] [data-tour="node-context-menu"]';
  const closedTargets: string[] = [];
  if (target !== contextTarget) {
    window.dispatchEvent(new CustomEvent("tour:close-context-menu"));
    closedTargets.push(contextTarget);
  }
  if (action !== "open-overview") {
    window.dispatchEvent(new CustomEvent("tour:close-overview"));
    closedTargets.push('[data-guide-session] [data-tour="overview-sidebar"]');
  }
  if (action !== "open-settings") {
    window.dispatchEvent(new CustomEvent("tour:close-settings"));
    closedTargets.push('[data-guide-session] [data-tour="settings-modal"]');
  }
  window.dispatchEvent(new CustomEvent("tour:hide-overlays"));
  const previousAction = (previous?.data as { action?: string } | undefined)
    ?.action;
  const leavingContextMenu =
    previous?.target === contextTarget && target !== contextTarget;
  const leavingFocus =
    previousAction?.startsWith("focus-") && !action?.startsWith("focus-");
  if (action !== "fit-view" && (leavingContextMenu || leavingFocus)) {
    await requestAction(events["fit-view"], signal);
  }
  const effectiveAction =
    target === contextTarget && !visibleAnchor(contextTarget)
      ? "show-context-menu"
      : action;
  if (effectiveAction && events[effectiveAction])
    await requestAction(events[effectiveAction], signal);
  return waitForAnchor(target, signal, closedTargets);
}
