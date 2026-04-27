import { dialog, shell, app } from "electron";
import { logMessage } from "./logger";
import {
  getLlamaServerPath,
  getPythonPath,
  getProcessEnv,
  PID_FILE_PATH,
  PID_DIRECTORY,
  webPath,
  getCondaEnvPath,
} from "./config";

/**
 * Resolves the path to the Node.js-based backend server entry point.
 * In packaged mode: resources/backend/server.mjs
 * In dev mode: ../../packages/websocket/src/server.ts (run via tsx)
 */
function getNodeBackendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "server.mjs");
  }
  return path.join(__dirname, "..", "..", "packages", "websocket", "src", "server.ts");
}

/** In dev mode we need tsx to run TypeScript source directly. */
function isDevMode(): boolean {
  return !app.isPackaged;
}
import { emitBootMessage, emitServerError, emitServerStarted, emitServerLog } from "./events";
import { serverState } from "./state";
import { getServerUrl } from "./utils";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { pathToFileURL } from "url";
import { emitServerStateChanged } from "./tray";
import { LOG_FILE } from "./logger";
import { createWorkflowWindow } from "./workflowWindow";
import { Watchdog } from "./watchdog";
import { getModelServiceStartupSettings, readSettingsAsync } from "./settings";
import { probeHttpOk, waitForHttpOk } from "./httpProbe";

let backendWatchdog: Watchdog | null = null;
let llamaWatchdog: Watchdog | null = null;
const LLAMA_PID_FILE_PATH = path.join(PID_DIRECTORY, "llama-server.pid");

/** Server Management Module */

/** Checks if a specific port is available for use */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .listen(port, "127.0.0.1")
      .once("listening", () => {
        server.close();
        resolve(true);
      })
      .once("error", () => resolve(false));
  });
}

/**
 * Checks if a process with the given PID is running
 * @param pid - Process ID to check
 * @returns True if the process is running, false otherwise
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

/**
 * Checks if there's an existing NodeTool server process from a PID file
 * @returns Promise resolving to the PID if a running server is found, null otherwise
 */
async function findExistingServerPid(): Promise<number | null> {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, "utf8");
    const pid = parseInt(pidContent.trim(), 10);
    
    if (!pid || isNaN(pid)) {
      return null;
    }
    
    if (isProcessRunning(pid)) {
      logMessage(`Found existing NodeTool server process with PID ${pid}`);
      return pid;
    }
    
    logMessage(`PID file exists but process ${pid} is not running, will clean up`);
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logMessage("No PID file found, no existing server process");
      return null;
    }
    logMessage(`Error reading PID file: ${(error as Error).message}`, "warn");
    return null;
  }
}

/**
 * Prompts the user about an existing server and gets their choice
 * @param pid - Process ID of the existing server
 * @returns Promise resolving to true if user wants to kill the server, false otherwise
 */
async function promptUserAboutExistingServer(pid: number): Promise<boolean> {
  const result = await dialog.showMessageBox({
    type: "question",
    title: "NodeTool Server Already Running",
    message: "A NodeTool server is already running.",
    detail: `An existing NodeTool server process (PID ${pid}) was detected. Would you like to stop it and start a new server, or connect to the existing server?`,
    buttons: ["Stop and Start New", "Use Existing Server"],
    defaultId: 0,
    cancelId: 1,
  });

  return result.response === 0;
}

/**
 * Finds the next available port starting from a base port
 * @param startPort - Port to start scanning from
 * @param maxIncrements - Maximum number of increments to try
 */
async function findAvailablePort(
  startPort: number,
  maxIncrements: number = 50
): Promise<number> {
  let candidate = startPort;
  for (let i = 0; i <= maxIncrements; i += 1) {
    const available = await isPortAvailable(candidate);
    if (available) return candidate;
    candidate += 1;
  }
  throw new Error(
    `No available port found from ${startPort} to ${startPort + maxIncrements}`
  );
}

/**
 * Checks if a llama-server is already running on a specific port
 */
export async function isLlamaServerResponsive(
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  return probeHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs });
}

/**
 * Starts the llama-server using Watchdog
 */
async function startLlamaServer(): Promise<void> {
  const defaultPort = 8080;

  // Check if an external llama-server is already running
  if (await isLlamaServerResponsive(defaultPort)) {
    serverState.llamaPort = defaultPort;
    serverState.llamaExternalManaged = true;
    logMessage(`Detected running llama-server instance on port ${defaultPort}`);
    return;
  }

  const basePort = serverState.llamaPort ?? defaultPort;
  const selectedPort = await findAvailablePort(basePort);
  serverState.llamaPort = selectedPort;
  serverState.llamaExternalManaged = false;

  const llamaExecutablePath = getLlamaServerPath();
  logMessage(`Llama-server executable path: ${llamaExecutablePath}`);

  // Check if the executable exists
  try {
    await fs.access(llamaExecutablePath);
  } catch {
    logMessage(
      `llama-server executable not found at ${llamaExecutablePath}. Skipping llama-server startup.`,
      "warn"
    );
    return;
  }

  const args = [
    "--host", "127.0.0.1",
    "--port", String(selectedPort),
  ];

  llamaWatchdog = new Watchdog({
    name: "llama-server",
    command: llamaExecutablePath,
    args,
    env: {
      ...process.env,
    },
    pidFilePath: LLAMA_PID_FILE_PATH,
    healthUrl: `http://127.0.0.1:${selectedPort}/health`,
    onOutput: (line) => emitServerLog(line),
    logOutput: false,
  });

  try {
    await llamaWatchdog.start();
    logMessage(`llama-server started on port ${selectedPort}`);
  } catch (error) {
    logMessage(
      `Failed to start llama-server watchdog: ${(error as Error).message}`,
      "error"
    );
    llamaWatchdog = null;
    // Don't throw - llama-server is optional
  }
}

/**
 * Restarts the llama-server (used after downloading new models)
 */
async function restartLlamaServer(): Promise<void> {
  logMessage("Restarting llama-server to pick up new models...");

  // Stop existing server if running
  if (llamaWatchdog) {
    try {
      await llamaWatchdog.stopGracefully();
      logMessage("Stopped existing llama-server");
    } catch (error) {
      logMessage(
        `Error stopping llama-server: ${(error as Error).message}`,
        "warn"
      );
    }
    llamaWatchdog = null;
  }

  // Small delay to ensure port is released
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Start fresh
  await startLlamaServer();
  logMessage("llama-server restarted successfully");
}

/**
 * Attempts to kill any existing server process using the stored PID
 */
async function killExistingServer(): Promise<void> {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, "utf8");
    const pid = parseInt(pidContent, 10);

    if (pid) {
      try {
        logMessage(`Killing existing server process ${pid}`);
        process.kill(pid);

        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            try {
              process.kill(pid, 0);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === "ESRCH") {
                clearInterval(checkInterval);
                resolve();
              }
            }
          }, 100);

          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });

        logMessage(`Killed existing server process ${pid}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          logMessage(
            `Error killing process ${pid}: ${(error as Error).message}`,
            "error"
          );
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logMessage(
        `Error reading PID file: ${(error as Error).message}`,
        "error"
      );
    }
  }
}

/**
 * Starts the NodeTool backend server process.
 * Spawns the Node.js-based TypeScript backend (packages/websocket/dist/server.js).
 */
async function startServer(): Promise<void> {
  emitBootMessage("Configuring server environment...");
  serverState.status = "starting";
  serverState.error = undefined;
  serverState.isStarted = false;

  // Resolve Node.js backend entry point
  const backendEntryPoint = getNodeBackendPath();
  logMessage(`Resolved Node.js backend entry point: ${backendEntryPoint}`);

  try {
    await fs.access(backendEntryPoint);
  } catch {
    const message = `Node.js backend not found at ${backendEntryPoint}. Run 'npm run build:packages' first.`;
    logMessage(message, "error");
    if (!process.env.CI) {
      dialog.showErrorBox("Backend Not Found", message);
    }
    throw new Error(message);
  }

  // Determine managed local model services startup policy
  let startupSettings = {
    startLlamaCppOnStartup: false,
  };
  try {
    const settings = await readSettingsAsync();
    const modelSettings = getModelServiceStartupSettings(settings);
    startupSettings = { startLlamaCppOnStartup: modelSettings.startLlamaCppOnStartup };
  } catch (error) {
    logMessage(
      `Failed to read settings for model service startup, defaulting to llama_cpp=false: ${error}`,
      "warn"
    );
  }

  logMessage(
    `Model service startup settings: llama_cpp=${startupSettings.startLlamaCppOnStartup}`
  );

  // Start model services and find backend port in parallel.
  const modelServicePromises: Promise<void>[] = [];

  if (startupSettings.startLlamaCppOnStartup) {
    logMessage("Starting llama-server...");
    modelServicePromises.push(
      startLlamaServer()
        .then(() => logMessage("llama-server started successfully"))
        .catch((error) => {
          logMessage(
            `Failed to start llama-server: ${(error as Error).message}. Continuing without llama-server.`,
            "warn"
          );
        })
    );
  } else {
    logMessage("Skipping llama-server startup (disabled in settings)");
  }

  const basePort = 7777;
  logMessage(`Finding available port starting from ${basePort}...`);
  const [selectedPort] = await Promise.all([
    findAvailablePort(basePort),
    ...modelServicePromises,
  ]);
  serverState.serverPort = selectedPort;
  serverState.initialURL = `http://127.0.0.1:${selectedPort}`;
  logMessage(`Selected port: ${selectedPort}`);

  logMessage(`Starting backend server via utilityProcess.fork: ${backendEntryPoint}`);
  logMessage(`Backend directory: ${path.dirname(backendEntryPoint)}`);
  emitBootMessage("Starting backend server...");

  // afterPack promotes the staged backend/_modules directory to a real
  // backend/node_modules directory so Node.js can resolve externalized
  // ESM packages with standard package resolution.
  const backendNodeModules = path.join(path.dirname(backendEntryPoint), "node_modules");
  logMessage(`Backend NODE_PATH: ${backendNodeModules}`);

  // Python path may not exist if the Python runtime hasn't been installed yet.
  // The backend will start without Python support in that case.
  let pythonPath = "";
  try {
    const candidatePath = getPythonPath();
    const { promises: fsPromises } = await import("fs");
    try {
      await fsPromises.access(candidatePath);
      pythonPath = candidatePath;
    } catch {
      logMessage(
        `Python executable not found at ${candidatePath}. Backend will start without Python support.`,
        "warn",
      );
    }
  } catch {
    logMessage("Could not resolve Python path. Backend will start without Python support.", "warn");
  }

  const rootDir = path.join(__dirname, "..", "..");

  // In dev mode, preload tsx/esm as a Node.js startup hook via --import so that
  // TypeScript files can be loaded inside the utilityProcess without calling
  // register() at runtime (which spawns a worker thread and fails in utility processes).
  const nodeOptionsParts = [process.env.NODE_OPTIONS, "--conditions=nodetool-dev"];
  if (isDevMode()) {
    const tsxEsmHook = path.join(rootDir, "node_modules", "tsx", "dist", "esm", "index.mjs");
    nodeOptionsParts.push(`--import=${pathToFileURL(tsxEsmHook).href}`);
  }

  const backendEnv: Record<string, string> = {
    ...getProcessEnv(),
    PORT: String(selectedPort),
    HOST: "127.0.0.1",
    STATIC_FOLDER: webPath,
    NODETOOL_PYTHON: pythonPath,
    LLAMA_CPP_URL: serverState.llamaPort ? `http://127.0.0.1:${serverState.llamaPort}` : "",
    NODE_ENV: isDevMode() ? "development" : "production",
    NODE_OPTIONS: nodeOptionsParts.filter(Boolean).join(" "),
    NODE_PATH: backendNodeModules,
  };
  const watchdogOpts: import("./watchdog").WatchdogOptions = isDevMode()
    ? {
        // Dev mode: fork tsx inside Electron's utilityProcess — same ABI as
        // production, no external node binary required.
        name: "nodetool",
        modulePath: path.join(__dirname, "..", "dev-server-runner.cjs"),
        args: [backendEntryPoint],
        env: backendEnv,
        cwd: rootDir,
        pidFilePath: PID_FILE_PATH,
        healthUrl: `http://127.0.0.1:${selectedPort}/health`,
        onOutput: (line) => handleServerOutput(Buffer.from(line)),
        logOutput: false,
      }
    : {
        // Production: fork compiled JS via utilityProcess
        name: "nodetool",
        modulePath: backendEntryPoint,
        env: backendEnv,
        cwd: path.dirname(backendEntryPoint),
        pidFilePath: PID_FILE_PATH,
        healthUrl: `http://127.0.0.1:${selectedPort}/health`,
        onOutput: (line) => handleServerOutput(Buffer.from(line)),
        logOutput: false,
      };

  backendWatchdog = new Watchdog(watchdogOpts);

  try {
    logMessage("Calling watchdog.start() - this will wait for server to become healthy...");
    await backendWatchdog.start();
    logMessage("Watchdog.start() completed - server is healthy");
  } catch (error) {
    const errorMessage = (error as Error).message;
    logMessage(
      `Watchdog failed to start server: ${errorMessage}`,
      "error"
    );
    logMessage(`Error stack: ${(error as Error).stack}`, "error");

    backendWatchdog = null;
    throw error;
  }
}

/**
 * Handles server process output streams (stdout/stderr)
 * Processes server messages, handles error conditions, and emits relevant events
 * @param data - Buffer containing server output
 */
function handleServerOutput(data: Buffer): void {
  const output = data.toString().trim();
  // if (output) {
  //   logMessage(output);
  // }

  if (output.includes("Address already in use")) {
    const message =
      "The server cannot start because the port is already in use. Please close any applications using the port and try again.";
    logMessage("Port is blocked, server startup failed", "error");
    serverState.error = message;
    serverState.status = "error";
    serverState.isStarted = false;
    if (!process.env.CI) {
      dialog.showErrorBox("Server Error", message);
    }
    emitServerError(message);
  }

  if (output.includes("Application startup complete.")) {
    logMessage("Server startup complete");
    emitBootMessage("Loading application...");
    emitServerStarted();
    emitServerStateChanged();
  }
  emitServerLog(output);
}

/**
 * Checks if the backend server process is currently running
 * @returns Promise resolving to true if server is running, false otherwise
 */
async function isServerRunning(): Promise<boolean> {
  // Quick check: if we have a watchdog, server is likely running
  // But we should verify with a health check to be sure
  const port = serverState.serverPort;
  if (!port) {
    return false;
  }

  return probeHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs: 1000 });
}

/**
 * Checks if the llama-server process is currently running
 * @returns true if llama-server is running, false otherwise
 */
function isLlamaServerRunning(): boolean {
  return llamaWatchdog !== null;
}

/**
 * Initializes the backend server, performing necessary checks and startup procedures
 * Handles server health checks, port availability, and process management
 */
async function initializeBackendServer(): Promise<void> {
  logMessage("Initializing backend server");
  try {
    serverState.status = "starting";
    serverState.error = undefined;
    
    // Check if there's an existing NodeTool server process from PID file
    const existingPid = await findExistingServerPid();
    
    if (existingPid) {
      // Server process is running, check if it's responsive
      logMessage(`Checking if server PID ${existingPid} is responsive...`);
      
      // Try to connect to the default port to verify it's actually running
      const defaultPort = 7777;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`http://127.0.0.1:${defaultPort}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          logMessage(`Existing server is responsive on port ${defaultPort}`);
          
          // Prompt the user
          const shouldKillExisting = await promptUserAboutExistingServer(existingPid);
          
          if (shouldKillExisting) {
            // User wants to kill the existing server
            logMessage("User chose to stop existing server");
            
            try {
              logMessage(`Killing process ${existingPid}`);
              process.kill(existingPid);
              
              // Wait for the process to die
              await new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  try {
                    process.kill(existingPid, 0);
                  } catch (e) {
                    if ((e as NodeJS.ErrnoException).code === "ESRCH") {
                      clearInterval(checkInterval);
                      resolve();
                    }
                  }
                }, 100);
                
                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve();
                }, 3000);
              });
              
              logMessage(`Successfully killed process ${existingPid}`);
              
              // Clean up the PID file
              try {
                await fs.unlink(PID_FILE_PATH);
                logMessage("Removed stale PID file");
              } catch (error) {
                logMessage(`Failed to remove PID file: ${(error as Error).message}`, "warn");
              }
              
              // Small delay to ensure port is released
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
              logMessage(
                `Failed to kill process ${existingPid}: ${(error as Error).message}`,
                "error"
              );
            }
          } else {
            // User wants to use the existing server
            logMessage("User chose to use existing server");
            serverState.serverPort = defaultPort;
            serverState.initialURL = `http://127.0.0.1:${defaultPort}`;
            emitServerStarted();
            emitServerStateChanged();
            return;
          }
        }
      } catch (fetchError) {
        logMessage(`Existing server process exists but is not responsive, will start new server`);
        // Server process exists but is not responsive, we can kill it and start fresh
        try {
          logMessage(`Killing unresponsive process ${existingPid}`);
          process.kill(existingPid);
          
          // Wait for the process to die
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              try {
                process.kill(existingPid, 0);
              } catch (e) {
                if ((e as NodeJS.ErrnoException).code === "ESRCH") {
                  clearInterval(checkInterval);
                  resolve();
                }
              }
            }, 100);
            
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 3000);
          });
          
          // Clean up the PID file
          try {
            await fs.unlink(PID_FILE_PATH);
            logMessage("Removed stale PID file");
          } catch (error) {
            logMessage(`Failed to remove PID file: ${(error as Error).message}`, "warn");
          }
          
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          logMessage(
            `Failed to kill unresponsive process ${existingPid}: ${(error as Error).message}`,
            "warn"
          );
        }
      }
    }
    
    // Check if watchdog thinks server is running
    if (await isServerRunning()) {
      logMessage("Watchdog indicates server is running, waiting for health check...");
      await waitForServer();
      return;
    }

    logMessage("No existing server found, starting new server...");
    await killExistingServer();
    logMessage("Starting server process...");
    await startServer();
    logMessage("Server process started, waiting for health check...");
    await waitForServer();
    logMessage("Backend server initialization complete");
  } catch (error) {
    logMessage(
      `Critical error starting server: ${(error as Error).message}`,
      "error"
    );
    logMessage(`Error stack: ${(error as Error).stack}`, "error");
    const errorMessage = (error as Error).message ?? "Unknown server error";
    serverState.status = "error";
    serverState.error = errorMessage;
    emitServerError(`Critical error starting server: ${errorMessage}`);
    throw error;
  }
}

/**
 * Waits for the server to become available by polling the health endpoint
 * @param timeout - Maximum time to wait in milliseconds (default: 30000)
 * @throws Error if server doesn't become available within timeout period
 */
async function waitForServer(timeout: number = 60000): Promise<void> {
  const readyUrl = getServerUrl("/ready");
  await waitForHttpOk(readyUrl, {
    timeoutMs: timeout,
    requestTimeoutMs: 3000,
    pollIntervalMs: 250,
    errorMessage: "Server failed to become available",
  });
  logMessage(`Server endpoint is available at ${readyUrl}`);
  emitServerStarted();
}

/**
 * Gracefully stops the backend server process
 * Attempts SIGTERM first, followed by SIGKILL if necessary
 */
async function stopServer(): Promise<void> {
  logMessage("Initiating graceful shutdown");

  try {
    if (backendWatchdog) {
      logMessage("Stopping NodeTool server (watchdog)");
      await backendWatchdog.stopGracefully();
      backendWatchdog = null;
    }
    if (llamaWatchdog) {
      logMessage("Stopping llama-server (watchdog)");
      await llamaWatchdog.stopGracefully();
      llamaWatchdog = null;
    }
  } catch (error) {
    logMessage(`Error during shutdown: ${(error as Error).message}`, "error");
  }

  serverState.isStarted = false;
  serverState.status = "idle";
  emitServerStateChanged();
  logMessage("Graceful shutdown complete");
}

/**
 * Starts the llama-server watchdog if it is not currently running.
 */
async function startLlamaCppService(): Promise<void> {
  if (llamaWatchdog) {
    logMessage("llama-server is already running", "info");
    return;
  }
  await startLlamaServer();
  emitServerStateChanged();
}

/**
 * Stops the llama-server watchdog if it is managed by this app.
 */
async function stopLlamaCppService(): Promise<void> {
  if (!llamaWatchdog) {
    if (serverState.llamaExternalManaged) {
      logMessage(
        "llama-server appears externally managed; tray stop is only available for app-managed llama-server",
        "warn"
      );
    } else {
      logMessage("llama-server is not running", "info");
    }
    return;
  }

  await llamaWatchdog.stopGracefully();
  llamaWatchdog = null;
  serverState.llamaExternalManaged = false;
  emitServerStateChanged();
}

/**
 * Returns the current server state
 * @returns Current server state object
 */
export function getServerState() {
  return serverState;
}

/**
 * Opens the log file in the system's default file explorer
 */
export function openLogFile() {
  return shell.showItemInFolder(LOG_FILE);
}

/**
 * Opens the log file in the system's default file explorer
 */
export function showItemInFolder(fullPath: string) {
  return shell.showItemInFolder(fullPath);
}

/**
 * Creates a new workflow window for a specific workflow
 * @param workflowId - ID of the workflow to run
 */
export async function runApp(workflowId: string) {
  logMessage(`Running app with workflow ID: ${workflowId}`);
  createWorkflowWindow(workflowId);
}

export {
  serverState,
  initializeBackendServer,
  stopServer,
  restartLlamaServer,
  webPath,
  isServerRunning,
  isLlamaServerRunning,
  startLlamaCppService,
  stopLlamaCppService,
};
