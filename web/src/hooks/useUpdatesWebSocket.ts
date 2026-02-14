/**
 * Hook for connecting to the /ws/updates WebSocket endpoint.
 *
 * Receives system_stats and resource_change broadcasts from the backend
 * and dispatches them to the appropriate stores. Reconnects automatically
 * on close.
 */
import { useEffect, useRef } from "react";
import { UPDATES_WS_URL } from "../stores/BASE_URL";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { queryClient } from "../queryClient";
import { SystemStats } from "../stores/ApiTypes";
import log from "loglevel";

interface SystemStatsUpdate {
  type: "system_stats";
  stats: SystemStats;
}

interface ResourceChangeUpdate {
  type: "resource_change";
  event: "created" | "updated" | "deleted";
  resource_type: string;
  resource: {
    id: string;
    etag: string;
    [key: string]: unknown;
  };
}

type UpdatesMessage = SystemStatsUpdate | ResourceChangeUpdate;

const RECONNECT_DELAY_MS = 3000;

export function useUpdatesWebSocket(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const setSystemStats = useWorkflowManager(
    (state) => state.setSystemStats
  );

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) {
        return;
      }

      try {
        const ws = new WebSocket(UPDATES_WS_URL);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as UpdatesMessage;

            if (data.type === "system_stats") {
              setSystemStats(data.stats);
            } else if (data.type === "resource_change") {
              // Invalidate relevant queries based on resource type
              queryClient.invalidateQueries({
                queryKey: [data.resource_type + "s"]
              });
            }
          } catch (err) {
            log.error("Failed to parse updates WebSocket message:", err);
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (mountedRef.current) {
            reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
          }
        };

        ws.onerror = (error) => {
          log.error("Updates WebSocket error:", error);
        };
      } catch (error) {
        log.error("Failed to create updates WebSocket:", error);
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [setSystemStats]);
}
