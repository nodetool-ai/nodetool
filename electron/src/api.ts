import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { getServerUrl } from "./utils";

export let isConnected = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

function createApiClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getServerUrl("/trpc"),
        transformer: superjson
      })
    ]
  });
}

/**
 * Fetches workflows from the server via tRPC.
 * Returns [] on any failure — callers (tray, shortcuts) treat empty lists as
 * "server not ready yet" which is common at app startup.
 */
export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const data = await createApiClient().workflows.list.query({ limit: 100 });
    const count = data.workflows.length;
    logMessage(`Successfully fetched ${count} workflows`);
    return data.workflows as unknown as Workflow[];
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(getServerUrl("/health/"));
    logMessage(`Health check response: ${response.ok}`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

export function startPeriodicHealthCheck(
  onStatusChange?: (connected: boolean) => void
): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  const runCheck = async () => {
    const previousConnectionStatus = isConnected;
    isConnected = await checkHealth();
    if (previousConnectionStatus !== isConnected && onStatusChange) {
      onStatusChange(isConnected);
    }
    if (!isConnected) {
      logMessage("Server is not responding.", "error");
    }
  };

  // Run an immediate check when starting
  void runCheck();

  healthCheckTimer = setInterval(runCheck, 10000);
}

export function stopPeriodicHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}
