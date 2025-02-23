import { Workflow } from "./types";
import { logMessage } from "./logger";

export let isConnected = false;

/**
 * Fetches workflows from the server
 * @returns {Promise<Workflow[]>} Array of workflows
 */
export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const response = await fetch("http://127.0.0.1:8000/api/workflows/", {
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
  const response = await fetch("http://127.0.0.1:8000/api/health/");
  return response.ok;
}

export function startPeriodicHealthCheck(): void {
  setInterval(async () => {
    isConnected = await checkHealth();
    if (!isConnected) {
      logMessage("Server is not responding.", "error");
    }
  }, 10000);
}
