import { spawn, ChildProcess } from "child_process";
import { dialog, shell, app } from "electron";
import { logMessage } from "./logger";
import {
  getPythonPath,
  getOllamaPath,
  getOllamaModelsPath,
  getProcessEnv,
  PID_FILE_PATH,
  PID_DIRECTORY,
  webPath,
  appsPath,
  getCondaEnvPath,
} from "./config";
import { forceQuit } from "./window";
import { emitBootMessage, emitServerStarted, emitServerLog } from "./events";
import { serverState } from "./state";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { updateTrayMenu } from "./tray";
import { LOG_FILE } from "./logger";
import { createWorkflowWindow } from "./workflowWindow";
import { Watchdog } from "./watchdog";

let backendWatchdog: Watchdog | null = null;
let ollamaWatchdog: Watchdog | null = null;
const OLLAMA_PID_FILE_PATH = path.join(PID_DIRECTORY, "ollama.pid");

/**
 * Server Management Module
 *
 * This module handles the lifecycle and management of the NodeTool backend server.
 * It provides functionality for starting, stopping, and monitoring the Python-based
 * backend server process, including health checks, port availability verification,
 * and process management. The module also handles Ollama AI service dependencies
 * and server output logging.
 */

/**
 * Checks if a specific port is available for use
 * @param port - The port number to check
 * @returns Promise resolving to true if port is available, false otherwise
 */
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
 * Checks if the Ollama server is responsive
 * @param port - The port to check
 * @param timeoutMs - The timeout in milliseconds
 * @returns True if the Ollama server is responsive, false otherwise
 */
export async function isOllamaResponsive(
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tags`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Starts the Ollama server on a custom port using Watchdog
 */
async function startOllamaServer(): Promise<void> {
  const existingPort = 11434;
  if (await isOllamaResponsive(existingPort)) {
    serverState.ollamaPort = existingPort;
    serverState.ollamaExternalManaged = true;
    logMessage(`Detected running Ollama instance on port ${existingPort}`);

    const existingBasePath = getProcessEnv().PATH || "";
    const ollamaScriptsDir = path.join(getCondaEnvPath(), "Scripts");
    const ollamaBinDir = path.join(getCondaEnvPath(), "Library", "bin");
    const userOllamaDir = path.join(
      app.getPath("home"),
      "AppData",
      "Local",
      "Programs",
      "Ollama"
    );

    process.env.PATH = [
      ollamaScriptsDir,
      ollamaBinDir,
      userOllamaDir,
      existingBasePath,
    ]
      .filter((segment) => segment && segment.trim().length > 0)
      .join(path.delimiter);

    logMessage(
      `Using externally managed Ollama. Updated PATH with ${ollamaScriptsDir}, ${ollamaBinDir}, and ${userOllamaDir}`
    );

    return;
  }

  const basePort = serverState.ollamaPort ?? 11435;
  const selectedPort = await findAvailablePort(basePort);
  serverState.ollamaPort = selectedPort;
  serverState.ollamaExternalManaged = false;

  const ollamaExecutablePath = await getOllamaPath();
  const args = ["serve"]; // OLLAMA_HOST controls bind address/port
  const modelsPath = getOllamaModelsPath();
  try {
    await fs.mkdir(modelsPath, { recursive: true });
    logMessage(`Ensured OLLAMA_MODELS directory exists at: ${modelsPath}`);
  } catch (error) {
    logMessage(
      `Failed to create OLLAMA_MODELS directory at ${modelsPath}: ${
        (error as Error).message
      }`,
      "error"
    );
  }

  ollamaWatchdog = new Watchdog({
    name: "ollama",
    command: ollamaExecutablePath,
    args,
    env: {
      ...process.env,
      OLLAMA_HOST: `127.0.0.1:${selectedPort}`,
      OLLAMA_MODELS: modelsPath,
    },
    pidFilePath: OLLAMA_PID_FILE_PATH,
    healthUrl: `http://127.0.0.1:${selectedPort}/api/tags`, // Ollama health endpoint
    onOutput: (line) => emitServerLog(line),
  });

  try {
    await ollamaWatchdog.start();
  } catch (error) {
    logMessage(
      `Failed to start Ollama watchdog: ${(error as Error).message}`,
      "error"
    );
    ollamaWatchdog = null;
    throw error;
  }
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
 * Starts the NodeTool backend server process
 * Configures and spawns the Python-based server process with necessary arguments
 */
async function startServer(): Promise<void> {
  emitBootMessage("Configuring server environment...");

  let pythonExecutablePath: string;
  try {
    pythonExecutablePath = getPythonPath();
    logMessage(`Resolved Python executable: ${pythonExecutablePath}`);
  } catch (error) {
    logMessage(
      `Could not resolve Python executable path. Ensure environment is installed. Error: ${error}`,
      "error"
    );
    dialog.showErrorBox(
      "Python Environment Missing",
      "The Python environment could not be found. Please reinstall the Python environment from the installer prompt."
    );
    throw error;
  }

  // Attempt to start Ollama, but continue even if it fails
  try {
    logMessage("Starting Ollama server...");
    await startOllamaServer();
    logMessage("Ollama server started successfully");
  } catch (error) {
    logMessage(
      `Failed to start Ollama server: ${(error as Error).message}. Continuing without Ollama.`,
      "warn"
    );
    // Set default port even if Ollama failed to start
    if (!serverState.ollamaPort) {
      serverState.ollamaPort = 11435;
    }
  }

  const basePort = 7777;
  logMessage(`Finding available port starting from ${basePort}...`);
  const selectedPort = await findAvailablePort(basePort);
  serverState.serverPort = selectedPort;
  serverState.initialURL = `http://127.0.0.1:${selectedPort}`;
  logMessage(`Selected port: ${selectedPort}`);

  const args = [
    "-m",
    "nodetool.cli",
    "serve",
    "--port",
    String(selectedPort),
    "--static-folder",
    webPath,
    "--apps-folder",
    appsPath,
  ];

  logMessage(`Starting backend server with command: ${pythonExecutablePath} ${args.join(" ")}`);
  emitBootMessage("Starting backend server...");

  backendWatchdog = new Watchdog({
    name: "nodetool",
    command: pythonExecutablePath,
    args,
    env: {
      ...getProcessEnv(),
      OLLAMA_API_URL: `http://127.0.0.1:${serverState.ollamaPort ?? 11435}`,
    },
    pidFilePath: PID_FILE_PATH,
    healthUrl: `http://127.0.0.1:${selectedPort}/health`,
    onOutput: (line) => handleServerOutput(Buffer.from(line)),
  });

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
  if (output) {
    logMessage(output);
  }

  if (output.includes("Address already in use")) {
    logMessage("Port is blocked, quitting application", "error");
    dialog.showErrorBox(
      "Server Error",
      "The server cannot start because the port is already in use. Please close any applications using the port and try again."
    );
    app.quit();
  }

  if (output.includes("Application startup complete.")) {
    logMessage("Server startup complete");
    emitBootMessage("Loading application...");
    emitServerStarted();
    updateTrayMenu();
  }
  emitServerLog(output);
}

/**
 * Checks if the backend server process is currently running
 * @returns Promise resolving to true if server is running, false otherwise
 */
async function isServerRunning(): Promise<boolean> {
  return backendWatchdog !== null;
}

/**
 * Checks if the Ollama server process is currently running
 * @returns true if Ollama is running, false otherwise
 */
function isOllamaRunning(): boolean {
  return ollamaWatchdog !== null;
}

/**
 * Initializes the backend server, performing necessary checks and startup procedures
 * Handles server health checks, port availability, and process management
 */
async function initializeBackendServer(): Promise<void> {
  logMessage("Initializing backend server");
  try {
    // Quick check: if PID file exists, server might be running - do a fast health check
    let pidFileExists = false;
    try {
      await fs.access(PID_FILE_PATH);
      pidFileExists = true;
    } catch {
      // PID file doesn't exist, server definitely not running - skip HTTP check
    }

    if (pidFileExists) {
      // PID file exists, do a quick health check (500ms timeout for fast failure)
      try {
        logMessage(`PID file found, checking if server is healthy on port ${serverState.serverPort ?? 7777}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms timeout for fast startup
        
        try {
          const response = await fetch(
            `http://127.0.0.1:${serverState.serverPort ?? 7777}/health`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (response.ok) {
            logMessage("Server already running and healthy, connecting...");
            emitServerStarted();
            await updateTrayMenu();
            return;
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            logMessage("Health check timed out (server may have crashed), proceeding with server startup");
          } else {
            logMessage(`Health check failed: ${fetchError.message}, proceeding with server startup`);
          }
        }
      } catch (error) {
        logMessage("Health check failed, proceeding with server startup");
      }
    } else {
      logMessage("No PID file found, server not running - skipping health check");
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
    forceQuit(`Critical error starting server: ${(error as Error).message}`);
  }
}

/**
 * Waits for the server to become available by polling the health endpoint
 * @param timeout - Maximum time to wait in milliseconds (default: 30000)
 * @throws Error if server doesn't become available within timeout period
 */
async function waitForServer(timeout: number = 60000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout per request (faster polling)
      
      try {
        const response = await fetch(
          `http://127.0.0.1:${serverState.serverPort ?? 7777}/health`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (response.ok) {
          logMessage(
            `Server endpoint is available at http://127.0.0.1:${
              serverState.serverPort ?? 7777
            }/health`
          );
          emitServerStarted();
          return;
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name !== 'AbortError') {
          // Only log non-timeout errors
          logMessage(`Health check error: ${fetchError.message}`);
        }
      }
    } catch (error) {
      // Fallback error handling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server failed to become available");
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
    if (ollamaWatchdog) {
      logMessage("Stopping Ollama server (watchdog)");
      await ollamaWatchdog.stopGracefully();
      ollamaWatchdog = null;
    }
  } catch (error) {
    logMessage(`Error during shutdown: ${(error as Error).message}`, "error");
  }

  logMessage("Graceful shutdown complete");
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
  webPath,
  isServerRunning,
  isOllamaRunning,
};
