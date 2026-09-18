"use client";

import { useCallback, useRef, useState } from "react";
import type { Program } from "@/types";

interface PositionedNodeMenu {
  program: Program;
  x: number;
  y: number;
}

interface PositionedCanvasMenu {
  x: number;
  y: number;
}

export function useContextMenus(closeGuardMs: number) {
  const [contextMenu, setContextMenu] = useState<PositionedNodeMenu | null>(
    null,
  );
  const [canvasContextMenu, setCanvasContextMenu] =
    useState<PositionedCanvasMenu | null>(null);
  const contextMenuClosedAt = useRef(0);
  const canvasContextMenuClosedAt = useRef(0);

  const openNodeContextMenu = useCallback(
    (program: Program, screenX: number, screenY: number) => {
      setContextMenu({ program, x: screenX, y: screenY });
    },
    [],
  );

  const closeNodeContextMenu = useCallback(() => {
    contextMenuClosedAt.current = Date.now();
    setContextMenu(null);
  }, []);

  const openCanvasContextMenu = useCallback(
    (screenX: number, screenY: number) => {
      setCanvasContextMenu({ x: screenX, y: screenY });
    },
    [],
  );

  const closeCanvasContextMenu = useCallback(() => {
    canvasContextMenuClosedAt.current = Date.now();
    setCanvasContextMenu(null);
  }, []);

  const shouldIgnoreDeselect = useCallback(
    () =>
      Date.now() - contextMenuClosedAt.current < closeGuardMs ||
      Date.now() - canvasContextMenuClosedAt.current < closeGuardMs,
    [closeGuardMs],
  );

  return {
    contextMenu,
    canvasContextMenu,
    openNodeContextMenu,
    closeNodeContextMenu,
    openCanvasContextMenu,
    closeCanvasContextMenu,
    shouldIgnoreDeselect,
  };
}
