import { spawn, ChildProcess, exec } from "child_process";
import { dialog, shell, app } from "electron";
import { logMessage } from "./logger";
import {
  getPythonPath,
  getProcessEnv,
  PID_FILE_PATH,
  webPath,
  appsPath,
} from "./config";
import { forceQuit } from "./window";
import { emitBootMessage, emitServerStarted, emitServerLog } from "./events";
import { serverState } from "./state";
import fs from "fs/promises";
import net from "net";
import { updateTrayMenu, createTray } from "./tray";
import { LOG_FILE } from "./logger";
import { createWorkflowWindow } from "./workflowWindow";
import { readSettings, updateSetting } from "./settings";

let nodeToolBackendProcess: ChildProcess | null = null;

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
 * Displays an error dialog when port 8000 is already in use and quits the application
 */
async function showPortInUseError(): Promise<void> {
  dialog.showErrorBox(
    "Port Already in Use",
    "The required port is already in use. Please ensure no other applications are using this port and try again."
  );
  app.quit();
}

/**
 * Writes the server process ID to a file for process management
 * @param pid - Process ID to write to file
 */
async function writePidFile(pid: number): Promise<void> {
  try {
    await fs.writeFile(PID_FILE_PATH, pid.toString());
    logMessage(`Written PID ${pid} to ${PID_FILE_PATH}`);
  } catch (error) {
    logMessage(
      `Failed to write PID file: ${(error as Error).message}`,
      "error"
    );
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

  const pythonExecutablePath = getPythonPath();

  const basePort = 8000;
  const selectedPort = await findAvailablePort(basePort);
  serverState.serverPort = selectedPort;
  serverState.initialURL = `http://127.0.0.1:${selectedPort}`;

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

  logMessage(`Using command: ${pythonExecutablePath} ${args.join(" ")}`);

  try {
    nodeToolBackendProcess = spawn(pythonExecutablePath, args, {
      stdio: "pipe",
      shell: false,
      env: getProcessEnv(),
      detached: false,
      windowsHide: true,
    });
  } catch (error) {
    forceQuit(`Failed to spawn server process: ${(error as Error).message}`);
    return;
  }

  nodeToolBackendProcess.on("spawn", () => {
    logMessage("NodeTool server starting...");
    emitBootMessage("NodeTool server starting...");
    if (nodeToolBackendProcess?.pid) {
      writePidFile(nodeToolBackendProcess.pid);
    }
  });

  nodeToolBackendProcess.stdout?.on("data", handleServerOutput);
  nodeToolBackendProcess.stderr?.on("data", handleServerOutput);

  nodeToolBackendProcess.on("error", (error) => {
    forceQuit(`Server process error: ${error.message}`);
  });

  nodeToolBackendProcess.on("exit", (code, signal) => {
    logMessage(`Server process exited with code ${code} and signal ${signal}`);
  });
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

  if (output.includes("ModuleNotFoundError")) {
    logMessage("Python module not found error", "error");
    dialog.showErrorBox(
      "Server Error",
      "Failed to start server due to missing Python module. Please try reinstalling the application."
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
 * Verifies if Ollama AI service is running and accessible
 * @returns Promise resolving to true if Ollama is running, false otherwise
 */
async function ensureOllamaIsRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/version");
    return response && response.status === 200;
  } catch (error) {
    await showOllamaInstallDialog();
    return false;
  }
}

/**
 * Shows a dialog prompting user to install Ollama if not present
 */
async function showOllamaInstallDialog(): Promise<void> {
  const downloadUrl = "https://ollama.com/download";

  // Check settings to see if user wants to skip this dialog
  const settings = readSettings();
  if (settings.SKIP_OLLAMA_DIALOG === true) {
    return;
  }

  const response = await dialog.showMessageBox({
    type: "info",
    title: "Download Ollama",
    message: "Ollama is required to run LLMs locally",
    detail:
      "Ollama is an open-source tool that allows NodeTool to run LLMs locally on your machine.\nAlternatively, you can use cloud providers, such as OpenAI, Anthropic or Gemini",
    buttons: ["Download Ollama", "Continue without Ollama"],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: "Don't ask again",
    checkboxChecked: false,
  });

  // Save user preference if they checked "Don't ask again"
  if (response.checkboxChecked) {
    updateSetting("SKIP_OLLAMA_DIALOG", true);
  }

  if (response.response === 0) {
    await shell.openExternal(downloadUrl);
  }
}

/**
 * Checks if the backend server process is currently running
 * @returns Promise resolving to true if server is running, false otherwise
 */
async function isServerRunning(): Promise<boolean> {
  return nodeToolBackendProcess !== null;
}

/**
 * Initializes the backend server, performing necessary checks and startup procedures
 * Handles server health checks, port availability, and process management
 */
async function initializeBackendServer(): Promise<void> {
  logMessage("Initializing backend server");
  try {
    try {
      const response = await fetch(
        `http://127.0.0.1:${serverState.serverPort ?? 8000}/health`
      );
      if (response.ok) {
        logMessage("Server already running and healthy, connecting...");
        emitServerStarted();
        await updateTrayMenu();
        return;
      }
    } catch (error) {
      logMessage("Health check failed, proceeding with server startup");
    }

    if (await isServerRunning()) {
      logMessage("Server already running, connecting...");
      await waitForServer();
      return;
    }

    await killExistingServer();
    await ensureOllamaIsRunning();
    await startServer();
    await waitForServer();
  } catch (error) {
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
      const response = await fetch(
        `http://127.0.0.1:${serverState.serverPort ?? 8000}/health`
      );
      if (response.ok) {
        logMessage(
          `Server endpoint is available at http://127.0.0.1:${serverState.serverPort ?? 8000}/health`
        );
        emitServerStarted();
        return;
      }
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
    if (nodeToolBackendProcess) {
      logMessage("Stopping server process");
      nodeToolBackendProcess.kill("SIGTERM");

      await new Promise<void>((resolve, reject) => {
        nodeToolBackendProcess?.on("exit", () => {
          fs.unlink(PID_FILE_PATH).catch(() => {});
          nodeToolBackendProcess = null;
          resolve();
        });
        nodeToolBackendProcess?.on("error", reject);

        setTimeout(() => {
          if (nodeToolBackendProcess && !nodeToolBackendProcess.killed) {
            nodeToolBackendProcess.kill("SIGKILL");
          }
          nodeToolBackendProcess = null;
          resolve();
        }, 5000);
      });
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
};
