"use client";

import {
  Bell,
  BookOpen,
  HelpCircle,
  Languages,
  Search,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useEvolveShell } from "@/contexts/EvolveShellContext";
import { useI18n } from "@/i18n";
import { listDatabases } from "@/lib/api";
import type { DatabaseFile } from "@/types";

interface ControlsProps {
  onSelectDb: (dbPath: string | null) => void;
  selectedDbPath: string | null;
  scanStatus: string;
  onStatusChange: (status: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenNotifications?: () => void;
  onStartGuide?: () => void;
  guideActive?: boolean;
  autoSelect?: boolean;
}

function NotificationBell({ onClick }: { onClick?: () => void }) {
  const { state } = useEvolveShell();
  const { t } = useI18n();
  const undismissedCount = state.reviewPriorityNotifications.filter(
    (n) => !n.dismissed,
  ).length;

  return (
    <button
      type="button"
      className="p-1.5 flex items-center justify-center bg-gray-100 text-gray-700 rounded hover:bg-gray-200 ml-2 relative"
      title={t("controls.notificationCenter")}
      onClick={onClick}
    >
      <Bell className="w-4 h-4" />
      {undismissedCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
          {undismissedCount > 99 ? "99+" : undismissedCount}
        </span>
      )}
    </button>
  );
}

interface TaskGroup {
  name: string;
  results: DatabaseFile[];
}

export default function Controls({
  onSelectDb,
  selectedDbPath,
  scanStatus,
  onStatusChange,
  onOpenSearch,
  onOpenSettings,
  onOpenNotifications,
  onStartGuide,
  guideActive = false,
  autoSelect = true,
}: ControlsProps) {
  const { locale, t, toggleLocale } = useI18n();
  const selectorId = useId();
  const [tasks, setTasks] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<string>("");

  const loadDatabases = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      onStatusChange(t("controls.loadingDatabases"));
      try {
        const dbs = await listDatabases(signal);
        if (signal.aborted) return;
        const groups: Record<string, DatabaseFile[]> = {};

        dbs.forEach((db) => {
          let taskName = t("common.unknown");
          const parts = db.path.split("/");
          if (parts.length >= 3) {
            taskName = parts[parts.length - 3];
          } else if (parts.length >= 2) {
            taskName = parts[0];
          }

          // Extract result name from the folder containing the DB
          let resultName = db.name;
          if (parts.length >= 2) {
            resultName = parts[parts.length - 2];
          }

          const dbWithCleanName = { ...db, name: resultName };

          if (!groups[taskName]) {
            groups[taskName] = [];
          }
          groups[taskName].push(dbWithCleanName);
        });

        const taskList = Object.entries(groups)
          .map(([name, results]) => ({
            name,
            results: results
              .sort((a, b) =>
                (a.sort_key || "").localeCompare(b.sort_key || ""),
              )
              .reverse(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setTasks(taskList);
        onStatusChange(
          t("controls.databasesFound", {
            databaseCount: dbs.length,
            taskCount: taskList.length,
          }),
        );

        if (autoSelect && !selectedDbPath && taskList.length > 0) {
          setSelectedTask(taskList[0].name);
          if (taskList[0].results.length > 0) {
            onSelectDb(taskList[0].results[0].path);
          }
        } else if (selectedDbPath) {
          for (const task of taskList) {
            if (task.results.find((r) => r.path === selectedDbPath)) {
              setSelectedTask(task.name);
              break;
            }
          }
        }
      } catch {
        if (signal.aborted) return;
        onStatusChange(t("controls.errorLoadingDatabases"));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [autoSelect, onSelectDb, onStatusChange, selectedDbPath, t],
  );

  useEffect(() => {
    if (guideActive) return;
    const request = new AbortController();
    void loadDatabases(request.signal);
    return () => request.abort();
  }, [guideActive, loadDatabases]);

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const taskName = e.target.value;
    setSelectedTask(taskName);
    const task = tasks.find((t) => t.name === taskName);
    if (task && task.results.length > 0) {
      onSelectDb(task.results[0].path);
    } else {
      onSelectDb(null);
    }
  };

  const handleResultChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectDb(e.target.value);
  };

  const currentTaskResults =
    tasks.find((t) => t.name === selectedTask)?.results || [];

  return (
    <div className="flex items-center gap-4 p-2 bg-white border-b border-gray-200 text-sm flex-wrap">
      {!guideActive && (
        <>
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${selectorId}-task`}
              className="font-bold text-gray-700"
            >
              {t("controls.task")}
            </label>
            <select
              id={`${selectorId}-task`}
              className="border border-gray-300 rounded px-2 py-1 min-w-[150px]"
              value={selectedTask}
              onChange={handleTaskChange}
              disabled={loading}
            >
              {!loading && !selectedTask && (
                <option value="" disabled>
                  {t("controls.selectTask")}
                </option>
              )}
              {loading ? (
                <option>{t("common.loading")}</option>
              ) : (
                tasks.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor={`${selectorId}-result`}
              className="font-bold text-gray-700"
            >
              {t("controls.result")}
            </label>
            <select
              id={`${selectorId}-result`}
              className="border border-gray-300 rounded px-2 py-1 min-w-[200px] max-w-[300px]"
              value={selectedDbPath || ""}
              onChange={handleResultChange}
              disabled={loading || !selectedTask}
            >
              {currentTaskResults.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name}
                </option>
              ))}
              {currentTaskResults.length === 0 && (
                <option value="">{t("controls.noResults")}</option>
              )}
            </select>
          </div>
        </>
      )}

      <span className="text-gray-500 text-xs ml-auto">{scanStatus}</span>

      <button
        type="button"
        data-tour="search-btn"
        className="p-1.5 flex items-center justify-center bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        title={t("controls.searchNodes")}
        onClick={onOpenSearch}
      >
        <Search className="w-4 h-4" />
      </button>
      <NotificationBell onClick={onOpenNotifications} />
      <button
        type="button"
        data-tour="settings-btn"
        className="p-1.5 flex items-center justify-center bg-gray-100 text-gray-700 rounded hover:bg-gray-200 ml-2"
        title={t("common.settings")}
        onClick={onOpenSettings}
      >
        <Settings className="w-4 h-4" />
      </button>

      <span
        data-tour="resources-group"
        className="flex items-center gap-2 ml-2"
      >
        <button
          type="button"
          className="p-1.5 flex items-center gap-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
          title={t("controls.guidedTour")}
          onClick={onStartGuide}
          disabled={guideActive}
        >
          <HelpCircle className="w-4 h-4" />
          <span className="text-xs font-medium">{t("controls.guide")}</span>
        </button>

        <a
          href="/llm-evolution-introduction.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 flex items-center gap-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
          title={t("controls.llmEvolutionIntroTitle")}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-xs font-medium">
            {t("controls.llmEvolutionIntro")}
          </span>
        </a>

        <button
          type="button"
          className="p-1.5 flex items-center gap-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
          title={t("controls.languageSwitch")}
          aria-label={t("controls.languageSwitch")}
          data-testid="language-switch"
          onClick={toggleLocale}
        >
          <Languages className="w-4 h-4" />
          <span className="text-xs font-medium">
            {locale === "en" ? "中文" : "EN"}
          </span>
        </button>
      </span>
    </div>
  );
}
