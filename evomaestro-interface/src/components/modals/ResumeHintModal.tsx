"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";

// ---------------------------------------------------------------------------
// Resume hint modal — centered overlay shown on every page load for resumed
// runs, until the user dismisses it. State is component-local so refreshing
// the page brings the hint back.
// ---------------------------------------------------------------------------

export function ResumeHintModal() {
  const { t } = useI18n();
  const { state, doStart } = useEvolveShell();
  const { run_state, generation, target_generations, is_resuming } =
    state.runStatus;
  const [dismissed, setDismissed] = useState(false);

  // Show on every page load for any resumed run, regardless of whether the
  // runner is still waiting_for_start. Dismissed state lives only in
  // component state so a refresh re-shows the hint.
  if (!is_resuming || dismissed) return null;

  const greenlightIfNeeded = () => {
    // Only push START when the runner is actually still parked at the
    // greenlight gate. Past that point (running/paused/idle/...) START
    // is meaningless and should not be sent.
    if (run_state === "waiting_for_start") {
      void doStart();
    }
  };

  const handleGotIt = () => {
    setDismissed(true);
    greenlightIfNeeded();
  };

  const handleStartGuide = () => {
    setDismissed(true);
    greenlightIfNeeded();
    window.dispatchEvent(new CustomEvent("tour:start"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-6 max-w-md mx-4 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">{t("resume.title")}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {t("resume.descriptionBefore")}{" "}
          <strong>
            {t("resume.progress", { generation, target: target_generations })}
          </strong>
          {t("resume.descriptionAfter")}
        </p>
        <p className="text-xs text-gray-400">{t("resume.instructions")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-semibold hover:bg-indigo-100 transition-colors"
            onClick={handleStartGuide}
            title={t("controls.guidedTour")}
          >
            <HelpCircle className="w-4 h-4" />
            {t("controls.guide")}
          </button>
          <button
            type="button"
            className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            onClick={handleGotIt}
          >
            {t("resume.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
