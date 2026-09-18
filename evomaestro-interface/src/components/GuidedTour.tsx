"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventData, Step } from "react-joyride";
import { tourSteps } from "@/components/guided-tour/steps";
import { cleanupTour, prepareStep } from "@/components/guided-tour/transitions";
import { useI18n } from "@/i18n";

const Joyride = dynamic(() => import("react-joyride").then((m) => m.Joyride), {
  ssr: false,
});

export default function GuidedTour({
  run,
  onFinish,
  onError,
}: {
  run: boolean;
  onFinish: () => void;
  onError: () => void;
}) {
  const { t } = useI18n();
  const steps = useMemo(
    () =>
      tourSteps().map(
        (step): Step => ({
          ...step,
          ...(step.target === '[data-tour="node-context-menu"]'
            ? {
                floatingOptions: {
                  flipOptions: {
                    fallbackPlacements: ["left", "bottom", "top"],
                  },
                },
              }
            : {}),
          target:
            typeof step.target === "string"
              ? `[data-guide-session] ${step.target}`
              : step.target,
        }),
      ),
    [],
  );
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  const current = useRef(0);
  const recovered = useRef<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onFinish, onError });
  callbacks.current = { onFinish, onError };

  const finish = useCallback((failed = false) => {
    pending.current?.abort();
    cleanupTour();
    setReady(false);
    if (failed) callbacks.current.onError();
    else callbacks.current.onFinish();
  }, []);

  const navigate = useCallback(
    async (next: number) => {
      if (next >= steps.length) return finish();
      if (next < 0) return;
      pending.current?.abort();
      const request = new AbortController();
      pending.current = request;
      setReady(false);
      try {
        await prepareStep(steps[next], steps[current.current], request.signal);
        if (request.signal.aborted) return;
        current.current = next;
        setIndex(next);
        setReady(true);
      } catch {
        if (!request.signal.aborted) finish(true);
      }
    },
    [finish, steps],
  );

  useEffect(() => {
    if (!run) return;
    void navigate(0);
    const close = () => finish();
    const more = () => void navigate(current.current + 1);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener("tour:finish", close);
    window.addEventListener("tour:more-details", more);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      pending.current?.abort();
      cleanupTour();
      window.removeEventListener("tour:finish", close);
      window.removeEventListener("tour:more-details", more);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [run, finish, navigate]);

  const callback = (event: EventData) => {
    if (
      event.status === "finished" ||
      event.status === "skipped" ||
      event.action === "close"
    )
      return finish();
    if (event.type === "error:target_not_found") {
      if (recovered.current === current.current) return finish(true);
      recovered.current = current.current;
      void navigate(current.current);
      return;
    }
    if (event.type === "step:after") {
      recovered.current = null;
      void navigate(event.index + (event.action === "prev" ? -1 : 1));
    }
  };
  // Welcome is unnumbered; main steps are 1–18, completion is 19, extras start at 20.
  const count =
    index >= 1 && index <= 18
      ? `(${index}/18)`
      : index >= 20
        ? `(${index - 19}/${steps.length - 20})`
        : "";
  if (!run || !ready) return null;

  return (
    <Joyride
      steps={steps}
      run={run && ready}
      stepIndex={index}
      onEvent={callback}
      continuous
      options={{
        overlayClickAction: false,
        blockTargetInteraction: true,
        zIndex: 10000,
        primaryColor: "#6366f1",
        arrowColor: "#fff",
        backgroundColor: "#fff",
        textColor: "#333",
        overlayColor: "rgba(0, 0, 0, 0.6)",
      }}
      locale={{
        back: t("common.back"),
        close: t("common.close"),
        last: `${t("common.finish")} ${count}`.trim(),
        next:
          index === 0 ? t("tour.start") : `${t("common.next")} ${count}`.trim(),
        skip: t("common.skip"),
      }}
      styles={{
        tooltip: { borderRadius: "12px", padding: "20px", maxWidth: "480px" },
        buttonPrimary: {
          borderRadius: "8px",
          padding: "8px 16px",
          fontSize: "13px",
        },
        buttonBack: { color: "#6366f1", fontSize: "13px" },
        buttonSkip: { color: "#9ca3af", fontSize: "12px" },
      }}
    />
  );
}
