"use client";

import { Activity, useCallback, useEffect, useRef, useState } from "react";
import Controls from "@/components/Controls";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GuidedTour from "@/components/GuidedTour";
import { HomeContent } from "@/components/home/HomeContent";
import { EvolveShellProvider } from "@/contexts/EvolveShellContext";
import {
  GUIDE_RECOVERY_KEY,
  readGuideRecovery,
  useGuideSession,
} from "@/hooks/useGuideSession";
import { useHomePageController } from "@/hooks/useHomePageController";
import { useI18n } from "@/i18n";
import { getProgramScore } from "@/utils/program";

const ignoreSelection = () => {};

export default function Home() {
  const { t } = useI18n();
  const [selectedDbPath, setSelectedDbPath] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [autoSelect, setAutoSelect] = useState(true);
  const clearSelection = useCallback(() => {
    setSelectedDbPath(null);
    setAutoSelect(false);
  }, []);
  const session = useGuideSession(selectedDbPath, clearSelection);
  useEffect(() => {
    const recovery = readGuideRecovery();
    const saved = sessionStorage.getItem("evolvis-selected-dataset");
    if (recovery) {
      setSelectedDbPath(recovery.path);
      setAutoSelect(false);
    } else if (saved) setSelectedDbPath(saved);
    sessionStorage.removeItem(GUIDE_RECOVERY_KEY);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (selectedDbPath)
      sessionStorage.setItem("evolvis-selected-dataset", selectedDbPath);
    else sessionStorage.removeItem("evolvis-selected-dataset");
  }, [hydrated, selectedDbPath]);
  if (!hydrated) return null;
  return (
    <div className="h-screen">
      {session.dataset && (
        <div className="flex h-full flex-col" data-guide-session="true">
          <div className="min-h-0 flex-1">
            <EvolveShellProvider dbPath={session.dataset.path} guideMode>
              <HomeInner
                selectedDbPath={session.dataset.path}
                setSelectedDbPath={ignoreSelection}
                onStartGuide={ignoreSelection}
                guideActive
                runTour={session.phase === "running"}
                onReady={session.ready}
                onFinish={() => void session.finish()}
                onError={() => void session.finish(t("guide.anchorFailed"))}
              />
            </EvolveShellProvider>
          </div>
        </div>
      )}
      <Activity mode={session.phase === "idle" ? "visible" : "hidden"}>
        <EvolveShellProvider
          key={selectedDbPath ?? "unselected"}
          dbPath={selectedDbPath}
        >
          <HomeInner
            selectedDbPath={selectedDbPath}
            setSelectedDbPath={setSelectedDbPath}
            onStartGuide={() => void session.start()}
            autoSelect={autoSelect}
          />
        </EvolveShellProvider>
      </Activity>
      {(session.phase === "preparing" || session.phase === "restoring") && (
        <div
          role="status"
          className="fixed inset-0 z-[11000] flex flex-col items-center justify-center gap-4 bg-white/95"
        >
          <p>
            {t(
              session.phase === "preparing"
                ? "guide.preparing"
                : "guide.restoring",
            )}
          </p>
          {session.phase === "preparing" && (
            <button type="button" onClick={() => void session.finish()}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      )}
      {session.error && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 right-4 z-[11000] flex gap-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <span className="flex-1">{session.error}</span>
          <button type="button" onClick={session.dismissError}>
            {t("common.close")}
          </button>
        </div>
      )}
    </div>
  );
}

function HomeInner({
  selectedDbPath,
  setSelectedDbPath,
  onStartGuide,
  autoSelect = true,
  guideActive = false,
  runTour = false,
  onReady,
  onFinish,
  onError,
}: {
  selectedDbPath: string | null;
  setSelectedDbPath: (path: string | null) => void;
  onStartGuide: () => void;
  autoSelect?: boolean;
  guideActive?: boolean;
  runTour?: boolean;
  onReady?: () => void;
  onFinish?: () => void;
  onError?: () => void;
}) {
  const controller = useHomePageController(selectedDbPath);
  useEffect(() => {
    if (!guideActive || controller.loading || controller.configLoading) return;
    if (controller.error) onError?.();
    else if (controller.programs.length > 0) onReady?.();
  }, [
    guideActive,
    controller.loading,
    controller.configLoading,
    controller.error,
    controller.programs.length,
    onReady,
    onError,
  ]);

  // Refs persist across re-renders so event handlers always see latest values
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const pendingContextMenuTargetRef = useRef<
    (typeof controller.programs)[number] | null
  >(null);

  // Tour context menu events — registered once, read latest controller via ref
  useEffect(() => {
    const handleShowContextMenu = () => {
      const programs = controllerRef.current.programs;
      if (programs.length === 0) return;

      // Prefer a review-priority node, then the global best, then any non-init node.
      const reviewPriorityNode = programs.find(
        (p) =>
          p.review_priority_level === "high" ||
          p.review_priority_level === "moderate",
      );
      const globalBest = programs
        .filter((p) => p.correct && p.metadata?.patch_type !== "init")
        .sort(
          (a, b) =>
            (getProgramScore(b) ?? -Infinity) -
            (getProgramScore(a) ?? -Infinity),
        )[0];
      const anyNode = programs.find((p) => p.metadata?.patch_type !== "init");
      const target = reviewPriorityNode ?? globalBest ?? anyNode ?? programs[0];

      // Phase 1: zoom to the node, then open context menu after animation
      pendingContextMenuTargetRef.current = target;
      window.dispatchEvent(
        new CustomEvent("tour:zoom-to-node", { detail: { nodeId: target.id } }),
      );
    };

    const handleNodeReady = (e: Event) => {
      const { x, y } = (e as CustomEvent).detail;
      const target = pendingContextMenuTargetRef.current;
      if (!target) return;
      controllerRef.current.handleNodeContextMenu(target, x, y);
      pendingContextMenuTargetRef.current = null;
      // Small delay to ensure React has committed the context menu to DOM
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("tour:context-menu-ready"));
      });
    };

    const handleCloseContextMenu = () => {
      pendingContextMenuTargetRef.current = null;
      controllerRef.current.closeNodeContextMenu();
    };

    const handleOpenSettings = () =>
      controllerRef.current.setShowSettingsModal(true);
    const handleCloseSettings = () =>
      controllerRef.current.setShowSettingsModal(false);

    window.addEventListener("tour:show-context-menu", handleShowContextMenu);
    window.addEventListener("tour:close-context-menu", handleCloseContextMenu);
    window.addEventListener("tour:node-ready", handleNodeReady);
    window.addEventListener("tour:open-settings", handleOpenSettings);
    window.addEventListener("tour:close-settings", handleCloseSettings);
    return () => {
      window.removeEventListener(
        "tour:show-context-menu",
        handleShowContextMenu,
      );
      window.removeEventListener(
        "tour:close-context-menu",
        handleCloseContextMenu,
      );
      window.removeEventListener("tour:node-ready", handleNodeReady);
      window.removeEventListener("tour:open-settings", handleOpenSettings);
      window.removeEventListener("tour:close-settings", handleCloseSettings);
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gray-50 font-sans text-black">
      <Controls
        onSelectDb={setSelectedDbPath}
        selectedDbPath={selectedDbPath}
        scanStatus={controller.scanStatus}
        onStatusChange={controller.setScanStatus}
        onOpenSearch={() => controller.setShowSearchModal(true)}
        onOpenSettings={() => controller.setShowSettingsModal(true)}
        onOpenNotifications={() => controller.setShowNotificationCenter(true)}
        onStartGuide={onStartGuide}
        guideActive={guideActive}
        autoSelect={autoSelect}
      />
      <ErrorBoundary onError={onError}>
        <HomeContent controller={controller} selectedDbPath={selectedDbPath} />
      </ErrorBoundary>
      {guideActive && (
        <ErrorBoundary onError={onError}>
          <GuidedTour
            run={runTour}
            onFinish={onFinish ?? ignoreSelection}
            onError={onError ?? ignoreSelection}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
