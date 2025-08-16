import { Workflow, BasicSystemInfo } from "./types";
import { logMessage } from "./logger";
import { serverState } from "./state";
import { app } from "electron";

export let isConnected = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

/**
 * Fetches workflows from the server
 * @returns {Promise<Workflow[]>} Array of workflows
 */
export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const port = serverState.serverPort ?? 8000;
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
    const port = serverState.serverPort ?? 8000;
    const response = await fetch(`http://127.0.0.1:${port}/health/`);
    console.log("response", response);
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

/**
 * Fetches basic system information for diagnostics
 * @returns {Promise<BasicSystemInfo | null>} Basic system info or null if unavailable
 */
export async function fetchBasicSystemInfo(): Promise<BasicSystemInfo | null> {
  logMessage("Fetching basic system information...");

  try {
    const port = serverState.serverPort ?? 8000;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Try to fetch system info from backend
    const [systemResponse, healthResponse] = await Promise.allSettled([
      fetch(`${baseUrl}/api/system/`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }),
      fetch(`${baseUrl}/api/system/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    let systemData: any = null;
    let serverStatus: "connected" | "disconnected" | "checking" =
      "disconnected";

    // Process system info response
    if (systemResponse.status === "fulfilled" && systemResponse.value.ok) {
      systemData = await systemResponse.value.json();
      serverStatus = "connected";
      logMessage("Successfully fetched system information from backend");
    }

    // Process health response
    if (healthResponse.status === "fulfilled" && healthResponse.value.ok) {
      serverStatus = "connected";
    }

    // Build system info object
    const systemInfo: BasicSystemInfo = {
      os: {
        platform: systemData?.os?.platform || process.platform,
        release: systemData?.os?.release || "Unknown",
        arch: systemData?.os?.arch || process.arch,
      },
      versions: {
        python: systemData?.versions?.python || undefined,
        nodetool_core: systemData?.versions?.nodetool_core || undefined,
        nodetool_base: systemData?.versions?.nodetool_base || undefined,
      },
      paths: {
        data_dir: systemData?.paths?.data_dir || app.getPath("userData"),
        core_logs_dir: systemData?.paths?.core_logs_dir || "Unknown",
        electron_logs_dir: app.getPath("logs"),
      },
      server: {
        status: serverStatus,
        port: serverStatus === "connected" ? port : undefined,
      },
    };

    return systemInfo;
  } catch (error) {
    logMessage(`Failed to fetch system information: ${error}`, "error");

    // Return fallback system info
    return {
      os: {
        platform: process.platform,
        release: "Unknown",
        arch: process.arch,
      },
      versions: {},
      paths: {
        data_dir: app.getPath("userData"),
        core_logs_dir: "Unknown",
        electron_logs_dir: app.getPath("logs"),
      },
      server: {
        status: "disconnected",
      },
    };
  }
}
