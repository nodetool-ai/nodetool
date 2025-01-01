const { spawn } = require("child_process");
const { dialog, shell, app } = require("electron");
const { logMessage } = require("./logger");
const { getPythonPath, getProcessEnv } = require("./config");
const path = require("path");
const { forceQuit } = require("./window");
const {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
} = require("./events");
const { serverState } = require("./state");
const fs = require("fs").promises;
const net = require("net");
const { updateTrayMenu } = require("./tray");

const webPath = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "../web/dist");

const PID_FILE_PATH = path.join(app.getPath("userData"), "server.pid");

/**
 * @typedef {Object} ServerState
 * @property {string} initialURL - The initial URL of the server
 */

/** @type {import('child_process').ChildProcess | null} */
let nodeToolBackendProcess = null;
/** @type {boolean} */
let isAppQuitting = false;
/** @type {string[]} */
let recentServerMessages = [];
/** @type {number} */
const MAX_RECENT_MESSAGES = 5;

/**
 * Check if a specific port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available, false otherwise
 */
async function isPortAvailable(port) {
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
 * Show port in use error dialog
 */
async function showPortInUseError() {
  dialog.showErrorBox(
    "Port Already in Use",
    "Port 8000 is already in use. Please ensure no other applications are using this port and try again."
  );
  app.quit();
}

/**
 * Write process ID to PID file
 * @param {number} pid - Process ID to write
 */
async function writePidFile(pid) {
  try {
    await fs.writeFile(PID_FILE_PATH, pid.toString());
    logMessage(`Written PID ${pid} to ${PID_FILE_PATH}`);
  } catch (error) {
    logMessage(`Failed to write PID file: ${error.message}`, "error");
  }
}

/**
 * Kill existing server process if running
 */
async function killExistingServer() {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, "utf8");
    const pid = parseInt(pidContent, 10);

    if (pid) {
      try {
        logMessage(`Killing existing server process ${pid}`);
        process.kill(pid);

        // Wait for the process to be killed
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            try {
              // Try to send signal 0 to check if process exists
              process.kill(pid, 0);
            } catch (e) {
              // ESRCH means process doesn't exist
              if (e.code === "ESRCH") {
                clearInterval(checkInterval);
                resolve();
              }
            }
          }, 100);

          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });

        logMessage(`Killed existing server process ${pid}`);
      } catch (error) {
        if (error.code !== "ESRCH") {
          logMessage(`Error killing process ${pid}: ${error.message}`, "error");
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logMessage(`Error reading PID file: ${error.message}`, "error");
    }
  }
}

/**
 * Start the NodeTool backend server process.
 */
async function startNodeToolBackendProcess() {
  emitBootMessage("Configuring server environment...");

  const pythonExecutablePath = getPythonPath();

  const args = [
    "-m",
    "nodetool.cli",
    "serve",
    "--port",
    "8000",
    "--static-folder",
    webPath,
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
    forceQuit(`Failed to spawn server process: ${error.message}`);
    return;
  }

  nodeToolBackendProcess.on("spawn", () => {
    logMessage("NodeTool backend starting...");
    emitBootMessage("NodeTool backend starting...");
    writePidFile(nodeToolBackendProcess.pid);
  });

  nodeToolBackendProcess.stdout.on("data", handleServerOutput);
  nodeToolBackendProcess.stderr.on("data", handleServerOutput);

  nodeToolBackendProcess.on("error", (error) => {
    forceQuit(`Server process error: ${error.message}`);
  });

  nodeToolBackendProcess.on("exit", (code, signal) => {
    logMessage(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && !isAppQuitting) {
      const recentLogs = recentServerMessages.join("\n");
      dialog.showErrorBox(
        "Server Terminated Unexpectedly",
        `The server process terminated unexpectedly with code ${code}\n\nRecent server messages:\n${recentLogs}`
      );
      forceQuit(`The server process terminated unexpectedly with code ${code}`);
    }
  });
}

/**
 * Handle output from the server process
 * @param {Buffer} data - Output data from the server process
 * @returns {void}
 */
function handleServerOutput(data) {
  const output = data.toString().trim();
  if (output) {
    logMessage(output);
    recentServerMessages.push(output);
    if (recentServerMessages.length > MAX_RECENT_MESSAGES) {
      recentServerMessages.shift();
    }
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
 * Ensure Ollama is installed and running
 * @returns {Promise<boolean>} True if Ollama is running, false otherwise
 */
async function ensureOllamaIsRunning() {
  try {
    const response = await fetch("http://localhost:11434/api/version");
    return response && response.status === 200;
  } catch (error) {
    await showOllamaInstallDialog();
    return false;
  }
}

/**
 * Show dialog explaining Ollama and providing download links
 * @returns {Promise<void>}
 */
async function showOllamaInstallDialog() {
  const downloadUrl = "https://ollama.com/download";
  const response = await dialog.showMessageBox({
    type: "info",
    title: "Ollama Required",
    message: "Ollama is required to run AI models locally",
    detail:
      "Ollama is an open-source tool that allows NodeTool to run AI models locally on your machine. This provides better privacy and performance compared to cloud-based solutions.\n\nPlease download and install Ollama to continue using NodeTool's AI features.",
    buttons: ["Download Ollama", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response.response === 0) {
    await shell.openExternal(downloadUrl);
  }
}

/**
 * Initialize the backend server
 * @returns {Promise<void>}
 * @throws {Error} If server fails to start
 */
async function initializeBackendServer() {
  try {
    await killExistingServer();

    logMessage("Checking if port 8000 is available");

    const isPortFree = await isPortAvailable(8000);
    if (!isPortFree) {
      logMessage("Port 8000 is already in use", "error");
      await showPortInUseError();
      return;
    }

    logMessage(
      "Port 8000 is available, attempting to start NodeTool backend server"
    );

    await ensureOllamaIsRunning();
    startNodeToolBackendProcess();
  } catch (error) {
    forceQuit(`Critical error starting server: ${error.message}`);
  }
}

/**
 * Perform graceful shutdown of the server
 * @returns {Promise<void>}
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");
  isAppQuitting = true;

  try {
    if (nodeToolBackendProcess) {
      logMessage("Stopping NodeTool backend process");
      nodeToolBackendProcess.kill("SIGTERM");

      await new Promise((resolve, reject) => {
        nodeToolBackendProcess.on("exit", () => {
          fs.unlink(PID_FILE_PATH).catch(() => {});
          resolve();
        });
        nodeToolBackendProcess.on("error", reject);

        setTimeout(() => {
          if (!nodeToolBackendProcess.killed) {
            nodeToolBackendProcess.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      });
    }
  } catch (error) {
    logMessage(`Error during shutdown: ${error.message}`, "error");
  }

  logMessage("Graceful shutdown complete");
}

/** @type {Object.<string, any>} */
module.exports = {
  serverState,
  initializeBackendServer,
  gracefulShutdown,
  webPath,
};
