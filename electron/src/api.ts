import { Workflow } from "./types";
import { logMessage } from "./logger";
import { serverState } from "./state";

export let isConnected = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

/**
 * Fetches workflows from the server
 * @returns {Promise<Workflow[]>} Array of workflows
 */
export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const port = serverState.serverPort ?? 7777;
    const response = await fetch(`http://127.0.0.1:${port}/api/workflows/`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    logMessage(`Successfully fetched ${data.workflows?.length || 0} workflows`);
    return data.workflows || [];
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}

async function checkHealth(): Promise<boolean> {
  try {
    const port = serverState.serverPort ?? 7777;
    const response = await fetch(`http://127.0.0.1:${port}/health/`);
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
