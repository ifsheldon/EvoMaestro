"use client";

import { useEffect, useRef, useState } from "react";
import { parseReviewPriorityAssignedMessage } from "@/lib/wsMessages";
import type { WSMessage } from "@/types";

export type WSStatus = "connecting" | "connected" | "disconnected";
interface UseWebSocketOptions {
  url: string | null;
  onMessage?: (msg: WSMessage) => void;
  onReconnect?: () => void;
  reconnectDelay?: number;
}

/** Each connection owns its callbacks and reconnect timer until disposed. */
export function useWebSocket({
  url,
  onMessage,
  onReconnect,
  reconnectDelay = 3000,
}: UseWebSocketOptions) {
  const [status, setStatus] = useState<WSStatus>("disconnected");
  const callbacks = useRef({ onMessage, onReconnect });
  callbacks.current = { onMessage, onReconnect };
  useEffect(() => {
    let disposed = false;
    let connected = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!url || disposed) return;
      setStatus("connecting");
      const current = new WebSocket(url);
      socket = current;
      current.onopen = () => {
        if (disposed || socket !== current) return;
        setStatus("connected");
        if (connected) callbacks.current.onReconnect?.();
        connected = true;
      };
      current.onmessage = (event) => {
        if (disposed || socket !== current) return;
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (typeof parsed !== "object" || !parsed || !("type" in parsed))
            return;
          if (parsed.type === "review_priority.assigned") {
            const message = parseReviewPriorityAssignedMessage(parsed);
            if (message) callbacks.current.onMessage?.(message);
          } else callbacks.current.onMessage?.(parsed as WSMessage);
        } catch {
          /* Malformed messages do not mutate the active workspace. */
        }
      };
      current.onclose = () => {
        if (disposed || socket !== current) return;
        socket = null;
        setStatus("disconnected");
        timer = setTimeout(connect, reconnectDelay);
      };
    };
    if (url) connect();
    else setStatus("disconnected");
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [url, reconnectDelay]);
  return { status };
}
