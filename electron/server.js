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

const webPath = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "../web/dist");

let nodeToolBackendProcess = null;
let isAppQuitting = false;

/**
 * Find a free port starting from the given port number
 * @param {number} startPort - Port to start scanning from
 * @returns {Promise<number>} - First available port
 */
async function findFreePort(startPort = 8088) {
  const isPortFree = (port) => {
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
  };

  let port = startPort;
  while (!(await isPortFree(port))) {
    port++;
  }
  return port;
}

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
  await dialog.showErrorBox(
    "Port Already in Use",
    "Port 8000 is already in use. Please ensure no other applications are using this port and try again."
  );
  app.quit();
}

/**
 * Start the NodeTool backend server process.
 */
async function startNodeToolBackendProcess() {
  emitBootMessage("Configuring server environment...");

  // const freePort = await findFreePort(3000);

  // if (app.isPackaged) {
  //   serverState.initialURL = `http://127.0.0.1:${freePort}`;
  // }

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
    logMessage("Server process spawned successfully");
    emitBootMessage("Server process started...");
  });

  nodeToolBackendProcess.stdout.on("data", handleServerOutput);
  nodeToolBackendProcess.stderr.on("data", handleServerOutput);

  nodeToolBackendProcess.on("error", (error) => {
    forceQuit(`Server process error: ${error.message}`);
  });

  nodeToolBackendProcess.on("exit", (code, signal) => {
    logMessage(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && !isAppQuitting) {
      forceQuit(`The server process terminated unexpectedly with code ${code}`);
    }
  });
}

/**
 * Handle output from the server process.
 * @param {Buffer} data - Output data from the server process.
 */
function handleServerOutput(data) {
  const output = data.toString().trim();
  if (output) {
    logMessage(`Server output: ${output}`);
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
  }
  emitServerLog(output);
}

/**
 * Ensure Ollama is installed and running.
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
 * Show dialog explaining Ollama and providing download links.
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
 * Initialize the backend server.
 */
async function initializeBackendServer() {
  try {
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
 * Perform graceful shutdown of the server.
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");
  isAppQuitting = true;

  try {
    // Existing NodeTool backend process shutdown
    if (nodeToolBackendProcess) {
      logMessage("Stopping NodeTool backend process");
      nodeToolBackendProcess.kill("SIGTERM");

      await new Promise((resolve, reject) => {
        nodeToolBackendProcess.on("exit", resolve);
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

module.exports = {
  serverState,
  initializeBackendServer,
  gracefulShutdown,
  webPath,
};
