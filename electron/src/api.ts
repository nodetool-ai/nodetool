import { Workflow, BasicSystemInfo } from "./types";
import { logMessage } from "./logger";
import { serverState } from "./state";
import { app } from "electron";
import { spawn } from "child_process";
import { getPythonPath } from "./config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
 * Gets Python version locally by executing python --version
 * @returns {Promise<string | null>} Python version or null if unavailable
 */
async function getLocalPythonVersion(): Promise<string | null> {
  try {
    const pythonPath = getPythonPath();

    // Check if Python executable exists
    if (!fs.existsSync(pythonPath)) {
      return null;
    }

    return new Promise((resolve) => {
      const child = spawn(pythonPath, ["--version"], {
        timeout: 3000, // 3 second timeout
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      child.stdout?.on("data", (data) => {
        output += data.toString();
      });

      child.stderr?.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          // Python version is usually in format "Python 3.x.x"
          const version = (output || errorOutput)
            .trim()
            .replace(/^Python\s+/, "");
          resolve(version || null);
        } else {
          resolve(null);
        }
      });

      child.on("error", () => {
        resolve(null);
      });
    });
  } catch (error) {
    logMessage(`Failed to get local Python version: ${error}`, "error");
    return null;
  }
}

/**
 * Gets NodeTool package versions from local package.json files
 * @returns {Promise<{core?: string, base?: string}>} Package versions
 */
async function getLocalNodeToolVersions(): Promise<{
  core?: string;
  base?: string;
}> {
  const versions: { core?: string; base?: string } = {};

  try {
    // Try to find package.json files in common locations
    const appPath = app.getAppPath();
    const possiblePaths = [
      path.join(appPath, "..", "..", "package.json"), // From electron app to root
      path.join(appPath, "..", "package.json"),
      path.join(process.cwd(), "package.json"),
    ];

    for (const pkgPath of possiblePaths) {
      try {
        if (fs.existsSync(pkgPath)) {
          const pkgContent = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

          // Check dependencies for nodetool packages
          const allDeps = {
            ...pkgContent.dependencies,
            ...pkgContent.devDependencies,
            ...pkgContent.peerDependencies,
          };

          if (allDeps["nodetool-core"]) {
            versions.core = allDeps["nodetool-core"];
          }
          if (allDeps["nodetool-base"]) {
            versions.base = allDeps["nodetool-base"];
          }
        }
      } catch (e) {
        // Continue to next path
      }
    }
  } catch (error) {
    logMessage(`Failed to get local NodeTool versions: ${error}`, "error");
  }

  return versions;
}

/**
 * Gets CUDA version locally by checking nvcc or nvidia-smi
 * @returns {Promise<string | null>} CUDA version or null if unavailable
 */
async function getLocalCudaVersion(): Promise<string | null> {
  try {
    // Try nvcc first to get actual CUDA toolkit version
    const nvccVersion = await new Promise<string | null>((resolve) => {
      const child = spawn("nvcc", ["--version"], {
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout?.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          // Extract CUDA version from nvcc output (e.g., "release 12.1")
          const match = output.match(/release (\d+\.\d+)/);
          resolve(match ? match[1] : null);
        } else {
          resolve(null);
        }
      });

      child.on("error", () => {
        resolve(null);
      });
    });

    if (nvccVersion) {
      return nvccVersion;
    }

    // Try nvidia-smi to get CUDA runtime version as fallback
    const nvidiaSmiCudaVersion = await new Promise<string | null>((resolve) => {
      const child = spawn(
        "nvidia-smi",
        ["--query-gpu=cuda_version", "--format=csv,noheader,nounits"],
        {
          timeout: 3000,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let output = "";
      child.stdout?.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && output.trim()) {
          const cudaVersion = output.trim().split("\n")[0];
          // nvidia-smi sometimes returns "N/A" for CUDA version
          resolve(cudaVersion !== "N/A" ? cudaVersion : null);
        } else {
          resolve(null);
        }
      });

      child.on("error", () => {
        resolve(null);
      });
    });

    return nvidiaSmiCudaVersion;
  } catch (error) {
    logMessage(`Failed to get local CUDA version: ${error}`, "error");
    return null;
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

    // Get local fallback information when backend is unavailable
    let localPythonVersion: string | null = null;
    let localNodeToolVersions: { core?: string; base?: string } = {};
    let localCudaVersion: string | null = null;

    if (serverStatus === "disconnected") {
      logMessage("Backend unavailable, fetching local system information...");
      [localPythonVersion, localNodeToolVersions, localCudaVersion] =
        await Promise.all([
          getLocalPythonVersion(),
          getLocalNodeToolVersions(),
          getLocalCudaVersion(),
        ]);
    }

    // Build system info object with enhanced fallbacks
    const systemInfo: BasicSystemInfo = {
      os: {
        platform: systemData?.os?.platform || process.platform,
        release: systemData?.os?.release || os.release(),
        arch: systemData?.os?.arch || process.arch,
      },
      versions: {
        python: systemData?.versions?.python || localPythonVersion || undefined,
        nodetool_core:
          systemData?.versions?.nodetool_core ||
          localNodeToolVersions.core ||
          undefined,
        nodetool_base:
          systemData?.versions?.nodetool_base ||
          localNodeToolVersions.base ||
          undefined,
        cuda: systemData?.versions?.cuda || localCudaVersion || undefined,
      },
      paths: {
        data_dir: systemData?.paths?.data_dir || app.getPath("userData"),
        core_logs_dir: systemData?.paths?.core_logs_dir || "-",
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

    // Enhanced fallback with local information
    const [localPythonVersion, localNodeToolVersions, localCudaVersion] =
      await Promise.all([
        getLocalPythonVersion().catch(() => null),
        getLocalNodeToolVersions().catch(() => ({
          core: undefined,
          base: undefined,
        })),
        getLocalCudaVersion().catch(() => null),
      ]);

    return {
      os: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
      },
      versions: {
        python: localPythonVersion || undefined,
        nodetool_core: localNodeToolVersions.core || undefined,
        nodetool_base: localNodeToolVersions.base || undefined,
        cuda: localCudaVersion || undefined,
      },
      paths: {
        data_dir: app.getPath("userData"),
        core_logs_dir: "-",
        electron_logs_dir: app.getPath("logs"),
      },
      server: {
        status: "disconnected",
      },
    };
  }
}
