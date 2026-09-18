"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  banPrograms,
  getBannedIds,
  getDatasetInfo,
  getRunStatus,
  getWebSocketUrl,
  pauseRun,
  resumeRun,
  setTarget,
  startRun,
  stepRun,
  stopRun,
  submitMerge,
  submitSuggestion,
  unbanPrograms,
} from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  type EvolveSettings,
  parseSettings,
} from "@/lib/evolveSettings";
import { useWebSocket, type WSStatus } from "@/lib/useWebSocket";
import type {
  DatasetInfo,
  Program,
  ProgramReviewPriorityData,
  RunStatus,
  WSMessage,
} from "@/types";
import { normalizeMergeDiversityWeight } from "@/utils/mergeRecommendationWeights";

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

function loadSettings(): EvolveSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  return parseSettings(localStorage.getItem("evolve-settings"));
}

// ---------------------------------------------------------------------------
// Marks & Notes persistence
// ---------------------------------------------------------------------------

function loadMarkedNodes(): string[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem("evolve-marked-nodes");
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadBannedNodes(): string[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem("evolve-banned-nodes");
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadNodeNotes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const saved = localStorage.getItem("evolve-node-notes");
  if (!saved) return {};
  try {
    return JSON.parse(saved) ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Review Priority notification
// ---------------------------------------------------------------------------

const MAX_VISIBLE_REVIEW_PRIORITY_BANNERS = 5;

export interface ReviewPriorityNotification {
  id: string; // unique key (programId + timestamp)
  programId: string;
  reviewPriorityLevel: "moderate" | "high";
  reviewPriorityData: ProgramReviewPriorityData;
  combinedScore: number;
  generation: number;
  timestamp: number;
  dismissed: boolean;
  showInBanner: boolean;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface EvolveShellState {
  ephemeral: boolean;
  // Connection
  wsStatus: WSStatus;
  lastBackendStatusSeenAt: number;
  runStatus: RunStatus;

  // Selection for merge
  mergeSelection: Program[];

  // Pending interactive actions
  pendingCount: number;

  // Selected program for global details
  selectedProgramId: string | null;

  // Temporary highlight (e.g. on single-click ID)
  highlightedProgramId: string | null;

  // Recommended merge partner IDs (for tree visualization highlights)
  recommendedPartnerIds: string[];

  // Merge modal program IDs (for green bubble rings on tree)
  mergeModalProgramIds: string[];

  // Signal to trigger a data reload from the REST API
  reloadTrigger: number;

  // Global app settings
  settings: EvolveSettings;

  // User marks, notes & bans (persisted to localStorage)
  markedNodeIds: string[];
  bannedNodeIds: string[];
  nodeNotes: Record<string, string>;

  // Review Priority notifications
  reviewPriorityNotifications: ReviewPriorityNotification[];
  clearedReviewPriorityIds: Set<string>; // program IDs cleared by user — skip on re-hydrate
}

const initialRunStatus: RunStatus = {
  run_state: "unknown",
  generation: 0,
  best_score: 0,
  queued_jobs: 0,
  total_programs: 0,
  target_generations: 0,
  is_resuming: false,
  updated_at: 0,
  generation_backend_heartbeat_at: 0,
};

const initialState: EvolveShellState = {
  ephemeral: false,
  wsStatus: "disconnected",
  lastBackendStatusSeenAt: 0,
  runStatus: initialRunStatus,
  mergeSelection: [],
  pendingCount: 0,
  reloadTrigger: 0,
  selectedProgramId: null,
  highlightedProgramId: null,
  recommendedPartnerIds: [],
  mergeModalProgramIds: [],
  settings: DEFAULT_SETTINGS,
  markedNodeIds: [],
  bannedNodeIds: [],
  nodeNotes: {},
  reviewPriorityNotifications: [],
  clearedReviewPriorityIds: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "SET_WS_STATUS"; status: WSStatus }
  | { type: "MARK_BACKEND_STATUS_SEEN"; seenAt: number }
  | { type: "SET_RUN_STATUS"; status: RunStatus }
  | { type: "TOGGLE_MERGE_SELECT"; program: Program }
  | { type: "CLEAR_MERGE_SELECTION" }
  | { type: "INC_PENDING" }
  | { type: "DEC_PENDING" }
  | { type: "TRIGGER_RELOAD" }
  | { type: "SELECT_PROGRAM"; id: string | null }
  | { type: "HIGHLIGHT_PROGRAM"; id: string | null }
  | { type: "SET_RECOMMENDED_PARTNERS"; ids: string[] }
  | { type: "SET_MERGE_MODAL_PROGRAMS"; ids: string[] }
  | { type: "UPDATE_SETTINGS"; settings: Partial<EvolveSettings> }
  | { type: "TOGGLE_MARK_NODE"; id: string }
  | { type: "TOGGLE_BAN_NODE"; id: string }
  | { type: "SET_NODE_NOTE"; id: string; note: string }
  | { type: "REMOVE_NODE_NOTE"; id: string }
  | {
      type: "ADD_REVIEW_PRIORITY_NOTIFICATION";
      notification: ReviewPriorityNotification;
    }
  | { type: "DISMISS_REVIEW_PRIORITY_NOTIFICATION"; id: string }
  | { type: "DISMISS_ALL_REVIEW_PRIORITY_NOTIFICATIONS" }
  | { type: "REMOVE_REVIEW_PRIORITY_NOTIFICATION"; id: string }
  | { type: "CLEAR_ALL_REVIEW_PRIORITY_NOTIFICATIONS" }
  | {
      type: "HYDRATE_LOCAL_STORAGE";
      settings: EvolveSettings;
      markedNodeIds: string[];
      bannedNodeIds: string[];
      nodeNotes: Record<string, string>;
    };

function reducer(state: EvolveShellState, action: Action): EvolveShellState {
  switch (action.type) {
    case "SET_WS_STATUS":
      return { ...state, wsStatus: action.status };
    case "MARK_BACKEND_STATUS_SEEN":
      return { ...state, lastBackendStatusSeenAt: action.seenAt };
    case "SET_RUN_STATUS":
      return { ...state, runStatus: action.status };
    case "TOGGLE_MERGE_SELECT": {
      const exists = state.mergeSelection.some(
        (p) => p.id === action.program.id,
      );
      if (exists) {
        return {
          ...state,
          mergeSelection: state.mergeSelection.filter(
            (p) => p.id !== action.program.id,
          ),
        };
      }
      if (state.mergeSelection.length >= 5) return state; // max 5
      return {
        ...state,
        mergeSelection: [...state.mergeSelection, action.program],
      };
    }
    case "CLEAR_MERGE_SELECTION":
      return { ...state, mergeSelection: [] };
    case "INC_PENDING":
      return { ...state, pendingCount: state.pendingCount + 1 };
    case "DEC_PENDING":
      return {
        ...state,
        pendingCount: Math.max(0, state.pendingCount - 1),
      };
    case "TRIGGER_RELOAD":
      return { ...state, reloadTrigger: state.reloadTrigger + 1 };
    case "SELECT_PROGRAM":
      return { ...state, selectedProgramId: action.id };
    case "HIGHLIGHT_PROGRAM":
      return { ...state, highlightedProgramId: action.id };
    case "SET_RECOMMENDED_PARTNERS":
      return { ...state, recommendedPartnerIds: action.ids };
    case "SET_MERGE_MODAL_PROGRAMS":
      return { ...state, mergeModalProgramIds: action.ids };
    case "UPDATE_SETTINGS": {
      const mergedSettings = { ...state.settings, ...action.settings };
      const newSettings = {
        ...mergedSettings,
        mergeDiversityWeight: normalizeMergeDiversityWeight(
          mergedSettings.mergeDiversityWeight,
        ),
      };
      if (!state.ephemeral)
        localStorage.setItem("evolve-settings", JSON.stringify(newSettings));
      return { ...state, settings: newSettings };
    }
    case "TOGGLE_MARK_NODE": {
      const exists = state.markedNodeIds.includes(action.id);
      const newMarked = exists
        ? state.markedNodeIds.filter((id) => id !== action.id)
        : [...state.markedNodeIds, action.id];
      if (!state.ephemeral)
        localStorage.setItem("evolve-marked-nodes", JSON.stringify(newMarked));
      return { ...state, markedNodeIds: newMarked };
    }
    case "TOGGLE_BAN_NODE": {
      const exists = state.bannedNodeIds.includes(action.id);
      const newBanned = exists
        ? state.bannedNodeIds.filter((id) => id !== action.id)
        : [...state.bannedNodeIds, action.id];
      if (!state.ephemeral)
        localStorage.setItem("evolve-banned-nodes", JSON.stringify(newBanned));
      return { ...state, bannedNodeIds: newBanned };
    }
    case "SET_NODE_NOTE": {
      const newNotes = { ...state.nodeNotes, [action.id]: action.note };
      if (!state.ephemeral)
        localStorage.setItem("evolve-node-notes", JSON.stringify(newNotes));
      return { ...state, nodeNotes: newNotes };
    }
    case "REMOVE_NODE_NOTE": {
      const { [action.id]: _, ...rest } = state.nodeNotes;
      if (!state.ephemeral)
        localStorage.setItem("evolve-node-notes", JSON.stringify(rest));
      return { ...state, nodeNotes: rest };
    }
    case "ADD_REVIEW_PRIORITY_NOTIFICATION": {
      // Skip if this program was explicitly cleared by the user
      if (state.clearedReviewPriorityIds.has(action.notification.programId))
        return state;
      // Deduplicate by programId
      if (
        state.reviewPriorityNotifications.some(
          (n) => n.programId === action.notification.programId,
        )
      )
        return state;
      const visibleBannerCount = state.reviewPriorityNotifications.filter(
        (n) => !n.dismissed && n.showInBanner,
      ).length;
      return {
        ...state,
        reviewPriorityNotifications: [
          {
            ...action.notification,
            showInBanner:
              !action.notification.dismissed &&
              visibleBannerCount < MAX_VISIBLE_REVIEW_PRIORITY_BANNERS,
          },
          ...state.reviewPriorityNotifications,
        ].slice(0, 100),
      };
    }
    case "DISMISS_REVIEW_PRIORITY_NOTIFICATION":
      return {
        ...state,
        reviewPriorityNotifications: state.reviewPriorityNotifications.map(
          (n) => (n.id === action.id ? { ...n, dismissed: true } : n),
        ),
      };
    case "DISMISS_ALL_REVIEW_PRIORITY_NOTIFICATIONS":
      return {
        ...state,
        reviewPriorityNotifications: state.reviewPriorityNotifications.map(
          (n) => ({
            ...n,
            dismissed: true,
          }),
        ),
      };
    case "REMOVE_REVIEW_PRIORITY_NOTIFICATION": {
      const removed = state.reviewPriorityNotifications.find(
        (n) => n.id === action.id,
      );
      const nextCleared = new Set(state.clearedReviewPriorityIds);
      if (removed) nextCleared.add(removed.programId);
      return {
        ...state,
        reviewPriorityNotifications: state.reviewPriorityNotifications.filter(
          (n) => n.id !== action.id,
        ),
        clearedReviewPriorityIds: nextCleared,
      };
    }
    case "CLEAR_ALL_REVIEW_PRIORITY_NOTIFICATIONS": {
      const allCleared = new Set(state.clearedReviewPriorityIds);
      for (const n of state.reviewPriorityNotifications)
        allCleared.add(n.programId);
      return {
        ...state,
        reviewPriorityNotifications: [],
        clearedReviewPriorityIds: allCleared,
      };
    }
    case "HYDRATE_LOCAL_STORAGE":
      return {
        ...state,
        settings: action.settings,
        markedNodeIds: action.markedNodeIds,
        bannedNodeIds: action.bannedNodeIds,
        nodeNotes: action.nodeNotes,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

/** Callbacks for incremental program updates pushed via WebSocket. */
export interface ProgramUpdateCallbacks {
  onQueued: (msg: Extract<WSMessage, { type: "program.queued" }>) => void;
  onGenerated: (program: Program) => void;
}

interface EvolveShellContextValue {
  readOnly: boolean;
  guideMode: boolean;
  dataset: DatasetInfo | null;
  state: EvolveShellState;
  dispatch: React.Dispatch<Action>;
  /** Ref that useProgramLoader registers callbacks on for incremental updates. */
  programUpdateCallbackRef: React.RefObject<ProgramUpdateCallbacks | null>;
  // Convenience actions
  doPause: () => Promise<void>;
  doResume: () => Promise<void>;
  doStop: () => Promise<void>;
  doStart: () => Promise<void>;
  doStep: () => Promise<void>;
  doSetTarget: (targetGenerations: number) => Promise<void>;
  doSuggest: (
    parentId: string,
    prompt: string,
    patchType?: string,
  ) => Promise<void>;
  doMerge: (prompt?: string) => Promise<void>;
  toggleMergeSelect: (program: Program) => void;
  clearMergeSelection: () => void;
  selectProgram: (id: string | null) => void;
  highlightProgram: (id: string | null) => void;
  setRecommendedPartners: (ids: string[]) => void;
  setMergeModalPrograms: (ids: string[]) => void;
  updateSettings: (settings: Partial<EvolveSettings>) => void;
  toggleMarkNode: (id: string) => void;
  toggleBanNode: (id: string) => void;
  setNodeNote: (id: string, note: string) => void;
  removeNodeNote: (id: string) => void;
  dismissReviewPriorityNotification: (id: string) => void;
  dismissAllReviewPriorityNotifications: () => void;
  removeReviewPriorityNotification: (id: string) => void;
  clearAllReviewPriorityNotifications: () => void;
}

const EvolveShellContext = createContext<EvolveShellContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EvolveShellProvider({
  dbPath,
  guideMode = false,
  children,
}: {
  dbPath: string | null;
  guideMode?: boolean;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    ephemeral: guideMode,
  });
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const readOnly = guideMode || dataset?.read_only === true;
  useEffect(() => {
    if (!dbPath) return;
    const request = new AbortController();
    getDatasetInfo(dbPath, request.signal)
      .then(setDataset)
      .catch(() => {});
    return () => request.abort();
  }, [dbPath]);

  // Ref for incremental program updates (registered by useProgramLoader)
  const programUpdateCallbackRef = useRef<ProgramUpdateCallbacks | null>(null);

  // Hydrate persisted state from localStorage after first render (avoids SSR mismatch)
  useEffect(() => {
    if (guideMode) return;
    dispatch({
      type: "HYDRATE_LOCAL_STORAGE",
      settings: loadSettings(),
      markedNodeIds: loadMarkedNodes(),
      bannedNodeIds: loadBannedNodes(),
      nodeNotes: loadNodeNotes(),
    });
  }, [guideMode]);

  // Sync banned IDs from backend when a DB is selected
  useEffect(() => {
    if (!dbPath || readOnly) return;
    let cancelled = false;
    getBannedIds(dbPath)
      .then(({ banned_ids }) => {
        if (!cancelled && banned_ids.length > 0) {
          // Merge backend banned IDs with localStorage
          const local = loadBannedNodes();
          const merged = [...new Set([...local, ...banned_ids])];
          if (!state.ephemeral)
            localStorage.setItem("evolve-banned-nodes", JSON.stringify(merged));
          dispatch({
            type: "HYDRATE_LOCAL_STORAGE",
            settings: loadSettings(),
            markedNodeIds: loadMarkedNodes(),
            bannedNodeIds: merged,
            nodeNotes: loadNodeNotes(),
          });
        }
      })
      .catch(() => {}); // Backend may not be running
    return () => {
      cancelled = true;
    };
  }, [dbPath, readOnly, state.ephemeral]);

  // The browser uses the frontend origin; Next.js proxies upgrades to the backend.
  const wsUrl = useMemo(
    () =>
      dbPath && typeof window !== "undefined"
        ? getWebSocketUrl(dbPath, new URL(window.location.href))
        : null,
    [dbPath],
  );

  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "run.status") {
      dispatch({
        type: "MARK_BACKEND_STATUS_SEEN",
        seenAt: Date.now() / 1000,
      });
      dispatch({
        type: "SET_RUN_STATUS",
        status: {
          run_state: msg.run_state,
          generation: msg.generation,
          best_score: msg.best_score,
          queued_jobs: msg.queued_jobs,
          total_programs: msg.total_programs,
          target_generations: msg.target_generations,
          is_resuming: msg.is_resuming,
          updated_at: msg.updated_at,
          generation_backend_heartbeat_at: msg.generation_backend_heartbeat_at,
        },
      });
    } else if (msg.type === "programs.updated") {
      dispatch({ type: "TRIGGER_RELOAD" });
    } else if (msg.type === "review_priority.assigned") {
      dispatch({
        type: "ADD_REVIEW_PRIORITY_NOTIFICATION",
        notification: {
          id: `${msg.program_id}-${Date.now()}`,
          programId: msg.program_id,
          reviewPriorityLevel: msg.review_priority_level,
          reviewPriorityData: msg.review_priority_data,
          combinedScore: msg.combined_score,
          generation: msg.generation,
          timestamp: Date.now(),
          dismissed: false,
          showInBanner: false,
        },
      });
      dispatch({ type: "TRIGGER_RELOAD" });
    } else if (msg.type === "program.queued") {
      // Incremental update — add ghost node directly, no full reload
      console.log(
        "[push] program.queued",
        msg.program_id,
        `gen=${msg.generation}`,
        `parent=${msg.parent_id}`,
      );
      programUpdateCallbackRef.current?.onQueued(msg);
    } else if (msg.type === "program.generated") {
      // Incremental update — upsert real program, no full reload
      const p = msg.program;
      if (!p?.id) {
        console.warn("[push] program.generated with missing program data", msg);
        return;
      }
      console.log(
        "[push] program.generated",
        p.id,
        `gen=${p.generation}`,
        `score=${p.combined_score}`,
      );
      programUpdateCallbackRef.current?.onGenerated(p);
    }
  }, []);

  const handleWsReconnect = useCallback(() => {
    // After reconnection, trigger a full reload to sync any missed updates
    dispatch({ type: "TRIGGER_RELOAD" });
  }, []);

  const { status: wsStatus } = useWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    onReconnect: handleWsReconnect,
  });

  // Sync WS status into state
  useEffect(() => {
    dispatch({ type: "SET_WS_STATUS", status: wsStatus });
  }, [wsStatus]);

  // Fetch initial run status when db changes
  useEffect(() => {
    if (!dbPath) return;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status = await getRunStatus(dbPath);
        if (cancelled) {
          return;
        }
        dispatch({
          type: "MARK_BACKEND_STATUS_SEEN",
          seenAt: Date.now() / 1000,
        });
        dispatch({ type: "SET_RUN_STATUS", status });
      } catch {
        // Ignore poll failures; RunPanel will surface backend liveness separately.
      }
    };

    void fetchStatus();
    const intervalId = window.setInterval(() => {
      void fetchStatus();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dbPath]);

  // ----- convenience actions -----

  const doPause = useCallback(async () => {
    if (!dbPath || readOnly) return;
    dispatch({ type: "INC_PENDING" });
    try {
      await pauseRun(dbPath);
    } finally {
      dispatch({ type: "DEC_PENDING" });
    }
  }, [dbPath, readOnly]);

  const doResume = useCallback(async () => {
    if (!dbPath || readOnly) return;
    dispatch({ type: "INC_PENDING" });
    try {
      await resumeRun(dbPath);
    } finally {
      dispatch({ type: "DEC_PENDING" });
    }
  }, [dbPath, readOnly]);

  const doStop = useCallback(async () => {
    if (!dbPath || readOnly) return;
    dispatch({ type: "INC_PENDING" });
    try {
      await stopRun(dbPath);
    } finally {
      dispatch({ type: "DEC_PENDING" });
    }
  }, [dbPath, readOnly]);

  const doStart = useCallback(async () => {
    if (!dbPath || readOnly) return;
    dispatch({ type: "INC_PENDING" });
    try {
      await startRun(dbPath);
    } finally {
      dispatch({ type: "DEC_PENDING" });
    }
  }, [dbPath, readOnly]);

  const doStep = useCallback(async () => {
    if (!dbPath || readOnly) return;
    dispatch({ type: "INC_PENDING" });
    try {
      await stepRun(dbPath);
    } finally {
      dispatch({ type: "DEC_PENDING" });
    }
  }, [dbPath, readOnly]);

  const doSetTarget = useCallback(
    async (targetGenerations: number) => {
      if (!dbPath || readOnly) return;
      dispatch({ type: "INC_PENDING" });
      try {
        await setTarget(dbPath, targetGenerations);
      } finally {
        dispatch({ type: "DEC_PENDING" });
      }
    },
    [dbPath, readOnly],
  );

  const doSuggest = useCallback(
    async (parentId: string, prompt: string, patchType = "full") => {
      if (!dbPath || readOnly) return;
      dispatch({ type: "INC_PENDING" });
      try {
        await submitSuggestion(dbPath, parentId, prompt, patchType);
      } finally {
        dispatch({ type: "DEC_PENDING" });
      }
    },
    [dbPath, readOnly],
  );

  const doMerge = useCallback(
    async (prompt = "") => {
      if (!dbPath || readOnly || state.mergeSelection.length < 2) return;
      dispatch({ type: "INC_PENDING" });
      try {
        await submitMerge(
          dbPath,
          state.mergeSelection.map((p) => p.id),
          prompt,
        );
        dispatch({ type: "CLEAR_MERGE_SELECTION" });
      } finally {
        dispatch({ type: "DEC_PENDING" });
      }
    },
    [dbPath, readOnly, state.mergeSelection],
  );

  const toggleMergeSelect = useCallback(
    (program: Program) => dispatch({ type: "TOGGLE_MERGE_SELECT", program }),
    [],
  );

  const clearMergeSelection = useCallback(
    () => dispatch({ type: "CLEAR_MERGE_SELECTION" }),
    [],
  );

  const selectProgram = useCallback(
    (id: string | null) => dispatch({ type: "SELECT_PROGRAM", id }),
    [],
  );

  const highlightProgram = useCallback(
    (id: string | null) => dispatch({ type: "HIGHLIGHT_PROGRAM", id }),
    [],
  );
  const setRecommendedPartners = useCallback(
    (ids: string[]) => dispatch({ type: "SET_RECOMMENDED_PARTNERS", ids }),
    [],
  );
  const setMergeModalPrograms = useCallback(
    (ids: string[]) => dispatch({ type: "SET_MERGE_MODAL_PROGRAMS", ids }),
    [],
  );
  const updateSettings = useCallback(
    (settings: Partial<EvolveSettings>) =>
      dispatch({ type: "UPDATE_SETTINGS", settings }),
    [],
  );
  const toggleMarkNode = useCallback(
    (id: string) => dispatch({ type: "TOGGLE_MARK_NODE", id }),
    [],
  );
  const toggleBanNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      dispatch({ type: "TOGGLE_BAN_NODE", id });
      // Sync to backend (fire-and-forget)
      if (dbPath && !readOnly) {
        const isBanned = state.bannedNodeIds.includes(id);
        // After toggle: if it was banned, we're unbanning; if not, banning
        const action = isBanned ? unbanPrograms : banPrograms;
        action(dbPath, [id]).catch(() => {});
      }
    },
    [dbPath, readOnly, state.bannedNodeIds],
  );
  const setNodeNote = useCallback(
    (id: string, note: string) => dispatch({ type: "SET_NODE_NOTE", id, note }),
    [],
  );
  const removeNodeNote = useCallback(
    (id: string) => dispatch({ type: "REMOVE_NODE_NOTE", id }),
    [],
  );
  const dismissReviewPriorityNotification = useCallback(
    (id: string) =>
      dispatch({ type: "DISMISS_REVIEW_PRIORITY_NOTIFICATION", id }),
    [],
  );
  const dismissAllReviewPriorityNotifications = useCallback(
    () => dispatch({ type: "DISMISS_ALL_REVIEW_PRIORITY_NOTIFICATIONS" }),
    [],
  );
  const removeReviewPriorityNotification = useCallback(
    (id: string) =>
      dispatch({ type: "REMOVE_REVIEW_PRIORITY_NOTIFICATION", id }),
    [],
  );
  const clearAllReviewPriorityNotifications = useCallback(
    () => dispatch({ type: "CLEAR_ALL_REVIEW_PRIORITY_NOTIFICATIONS" }),
    [],
  );

  const value = useMemo<EvolveShellContextValue>(
    () => ({
      readOnly,
      guideMode,
      dataset,
      state,
      dispatch,
      programUpdateCallbackRef,
      doPause,
      doResume,
      doStop,
      doStart,
      doStep,
      doSetTarget,
      doSuggest,
      doMerge,
      toggleMergeSelect,
      clearMergeSelection,
      selectProgram,
      highlightProgram,
      setRecommendedPartners,
      setMergeModalPrograms,
      updateSettings,
      toggleMarkNode,
      toggleBanNode,
      setNodeNote,
      removeNodeNote,
      dismissReviewPriorityNotification,
      dismissAllReviewPriorityNotifications,
      removeReviewPriorityNotification,
      clearAllReviewPriorityNotifications,
    }),
    [
      readOnly,
      guideMode,
      dataset,
      state,
      doPause,
      doResume,
      doStop,
      doStart,
      doStep,
      doSetTarget,
      doSuggest,
      doMerge,
      toggleMergeSelect,
      clearMergeSelection,
      selectProgram,
      highlightProgram,
      setRecommendedPartners,
      setMergeModalPrograms,
      updateSettings,
      toggleMarkNode,
      toggleBanNode,
      setNodeNote,
      removeNodeNote,
      dismissReviewPriorityNotification,
      dismissAllReviewPriorityNotifications,
      removeReviewPriorityNotification,
      clearAllReviewPriorityNotifications,
    ],
  );

  return (
    <EvolveShellContext.Provider value={value}>
      {children}
    </EvolveShellContext.Provider>
  );
}

export function useEvolveShell(): EvolveShellContextValue {
  const ctx = useContext(EvolveShellContext);
  if (!ctx) {
    throw new Error("useEvolveShell must be used within EvolveShellProvider");
  }
  return ctx;
}
