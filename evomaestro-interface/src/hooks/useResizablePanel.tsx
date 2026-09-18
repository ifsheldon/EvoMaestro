"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Direction = "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

/** Persistent size memory shared across all hook instances (survives unmount/remount). */
const sizeMemory = new Map<string, { w: number; h: number }>();

/** Global z-index counter to bring the most recently clicked panel to the front. */
let globalZIndex = 100;

/** Hook to let any component participate in the global z-index system. */
export function useZIndex() {
  const [zIndex, setZIndex] = useState(globalZIndex);
  const bringToFront = useCallback(() => {
    globalZIndex += 1;
    setZIndex(globalZIndex);
  }, []);

  // Bring to front on initial mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount
  useEffect(() => {
    bringToFront();
  }, []);

  return { zIndex, bringToFront };
}

interface Options {
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  /** Returns the initial width, computed once on mount (client-only). */
  initialW?: () => number;
  /** Returns initial {x, y} given the resolved (w, h). Runs once on mount. */
  initialPos?: (w: number, h: number) => { x: number; y: number };
  /** If provided, size (w+h) is saved under this key and restored on next mount. */
  memoryKey?: string;
  /**
   * Positioning model for the panel.
   * - `"fixed"` (default): viewport-relative, used by modals.
   * - `"absolute"`: parent-relative, used by in-page floating panels.
   */
  positioning?: "fixed" | "absolute";
  /**
   * Which resize handles to render.
   * Defaults to all 8 directions. Pass e.g. `["se"]` for a single corner grip.
   */
  resizeDirections?: Direction[];
}

const HANDLE_CLASSES: Record<Direction, string> = {
  // corners
  nw: "top-0 left-0 w-2.5 h-2.5 cursor-nwse-resize",
  ne: "top-0 right-0 w-2.5 h-2.5 cursor-nesw-resize",
  sw: "bottom-0 left-0 w-2.5 h-2.5 cursor-nesw-resize",
  se: "bottom-0 right-0 w-2.5 h-2.5 cursor-nwse-resize",
  // edges
  n: "top-0 left-2.5 right-2.5 h-1.5 cursor-ns-resize",
  e: "right-0 top-2.5 bottom-2.5 w-1.5 cursor-ew-resize",
  s: "bottom-0 left-2.5 right-2.5 h-1.5 cursor-ns-resize",
  w: "left-0 top-2.5 bottom-2.5 w-1.5 cursor-ew-resize",
};

const ALL_DIRECTIONS: Direction[] = [
  "nw",
  "ne",
  "sw",
  "se",
  "n",
  "e",
  "s",
  "w",
];

/**
 * Shared hook providing drag + resize for floating panels.
 *
 * The panel starts with auto height (fit to content). Once the user resizes,
 * an explicit height is applied and the panel becomes scrollable.
 *
 * Usage:
 *   const { panelRef, panelStyle, dragHandlers, resizeHandles } = useResizablePanel({...});
 *
 *   <div ref={panelRef} style={panelStyle} className="flex flex-col ...">
 *     <div {...dragHandlers}>drag handle</div>
 *     <div className="flex-1 overflow-y-auto"> content </div>
 *     {resizeHandles}
 *   </div>
 */
export function useResizablePanel({
  defaultW,
  defaultH,
  minW = 300,
  minH = 150,
  initialW,
  initialPos,
  memoryKey,
  positioning = "fixed",
  resizeDirections = ALL_DIRECTIONS,
}: Options) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: defaultW, h: defaultH });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  // Height is only applied explicitly after the user has resized.
  // Before that the panel sizes itself to fit its content.
  const [hasResized, setHasResized] = useState(false);
  const { zIndex, bringToFront } = useZIndex();

  // Stable ref so resize callbacks can write to memory without re-creating.
  const memoryKeyRef = useRef(memoryKey);
  const positioningRef = useRef(positioning);

  /** Convert viewport clientX/Y to the panel's coordinate system. */
  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      if (positioningRef.current === "absolute") {
        const parentRect =
          panelRef.current?.parentElement?.getBoundingClientRect();
        if (parentRect) {
          return {
            x: clientX - parentRect.left,
            y: clientY - parentRect.top,
          };
        }
      }
      return { x: clientX, y: clientY };
    },
    [], // positioningRef is stable
  );

  // Initialise position and size on mount (client-only)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount; deps are initial config that never changes
  useLayoutEffect(() => {
    const stored = memoryKey ? sizeMemory.get(memoryKey) : undefined;
    let w: number;
    let h: number;
    if (stored) {
      // Restore remembered size and mark as already resized so height is applied.
      w = stored.w;
      h = stored.h;
      setSize({ w, h });
      setHasResized(true);
    } else {
      w = initialW ? initialW() : defaultW;
      h = defaultH;
      if (initialW) setSize((prev) => ({ ...prev, w }));
    }
    const p = initialPos
      ? initialPos(w, h)
      : {
          x: Math.round((window.innerWidth - w) / 2),
          y: Math.round((window.innerHeight - h) / 2),
        };
    setPos(p);
    setIsInitialized(true);
  }, []); // intentionally once

  // Listen for clicks anywhere on the panel to bring it to the front
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    // Use capture: true so we handle this before any children can stop propagation
    const handlePointerDown = () => bringToFront();
    el.addEventListener("pointerdown", handlePointerDown, { capture: true });

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [bringToFront]);

  // ── Text-selection suppression ────────────────────────────────────────
  const suppressSelectionRef = useRef(false);
  const prevUserSelectRef = useRef("");

  const suppressSelection = useCallback(() => {
    if (suppressSelectionRef.current) return;
    suppressSelectionRef.current = true;
    prevUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  }, []);

  const restoreSelection = useCallback(() => {
    if (!suppressSelectionRef.current) return;
    suppressSelectionRef.current = false;
    document.body.style.userSelect = prevUserSelectRef.current;
  }, []);

  // Safety: restore on unmount
  useEffect(() => restoreSelection, [restoreSelection]);

  // ── Drag ─────────────────────────────────────────────────────────────
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      bringToFront();
      if (!panelRef.current) return;
      e.preventDefault();
      suppressSelection();
      const rect = panelRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bringToFront, suppressSelection],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const local = toLocal(e.clientX, e.clientY);
      setPos({
        x: local.x - dragOffset.current.x,
        y: local.y - dragOffset.current.y,
      });
    },
    [toLocal],
  );

  const onDragPointerUp = useCallback(() => {
    draggingRef.current = false;
    restoreSelection();
  }, [restoreSelection]);

  // ── Resize ───────────────────────────────────────────────────────────
  const resizingRef = useRef(false);
  const resizeCorner = useRef<Direction>("se");
  const resizeOrigin = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });
  // Keep latest size/pos in refs so onResizePointerDown captures current values
  const sizeRef = useRef(size);
  const posRef = useRef(pos);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const onResizePointerDown = useCallback(
    (corner: Direction) => (e: React.PointerEvent) => {
      bringToFront();
      e.preventDefault();
      e.stopPropagation();
      suppressSelection();
      resizeCorner.current = corner;
      // Read actual rendered dimensions from DOM (handles auto-height case)
      const rect = panelRef.current?.getBoundingClientRect();
      resizeOrigin.current = {
        x: e.clientX,
        y: e.clientY,
        w: rect?.width ?? sizeRef.current.w,
        h: rect?.height ?? sizeRef.current.h,
        px: posRef.current.x,
        py: posRef.current.y,
      };
      resizingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bringToFront, suppressSelection],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizingRef.current) return;
      const dx = e.clientX - resizeOrigin.current.x;
      const dy = e.clientY - resizeOrigin.current.y;
      const o = resizeOrigin.current;
      const c = resizeCorner.current;
      let newW = o.w,
        newH = o.h,
        newX = o.px,
        newY = o.py;
      // Width / X
      if (["e", "ne", "se"].includes(c)) {
        newW = Math.max(minW, o.w + dx);
      } else if (["w", "nw", "sw"].includes(c)) {
        newW = Math.max(minW, o.w - dx);
        newX = o.px + (o.w - newW);
      }
      // Height / Y
      if (["s", "se", "sw"].includes(c)) {
        newH = Math.max(minH, o.h + dy);
      } else if (["n", "ne", "nw"].includes(c)) {
        newH = Math.max(minH, o.h - dy);
        newY = o.py + (o.h - newH);
      }
      setSize({ w: newW, h: newH });
      setPos({ x: newX, y: newY });
      setHasResized(true);
      if (memoryKeyRef.current)
        sizeMemory.set(memoryKeyRef.current, { w: newW, h: newH });
    },
    [minW, minH],
  );

  const onResizePointerUp = useCallback(() => {
    resizingRef.current = false;
    restoreSelection();
  }, [restoreSelection]);

  const resizeHandles = resizeDirections.map((dir) => (
    <div
      key={dir}
      className={`absolute ${HANDLE_CLASSES[dir]} z-10`}
      onPointerDown={onResizePointerDown(dir)}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
    />
  ));

  const dragHandlers = {
    onPointerDown: onDragPointerDown,
    onPointerMove: onDragPointerMove,
    onPointerUp: onDragPointerUp,
  };

  const panelStyle: React.CSSProperties = {
    position: positioning,
    left: pos.x,
    top: pos.y,
    width: size.w,
    zIndex,
    overflow: "hidden",
    ...(hasResized ? { height: size.h } : { maxHeight: "85vh" }),
    ...(isInitialized ? null : { visibility: "hidden" }),
  };

  return {
    panelRef,
    size,
    pos,
    panelStyle,
    dragHandlers,
    resizeHandles,
    bringToFront,
    hasResized,
  };
}
