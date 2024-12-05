const { spawn } = require("child_process");
const { dialog, shell, app } = require("electron");
const { logMessage } = require("./logger");
const { PYTHON_ENV, getProcessEnv } = require("./config");
const path = require("path");
const { forceQuit } = require("./window");
const {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
} = require("./events");
const { serverState } = require("./state");
const fs = require("fs").promises;

const webPath = path.join(process.resourcesPath, "web");

let nodeToolBackendProcess = null;
let isAppQuitting = false;
let viteProcess = null;

/**
 * Start the NodeTool backend server process.
 */
function startNodeToolBackendProcess() {
  emitBootMessage("Configuring server environment...");

  const pythonExecutablePath =
    process.platform === "win32"
      ? path.join(PYTHON_ENV.condaEnvPath, "python.exe")
      : path.join(PYTHON_ENV.condaEnvPath, "bin", "python");

  const args = ["-m", "nodetool.cli", "serve"];

  if (app.isPackaged) {
    args.push("--static-folder", webPath);
  } else {
    args.push("--reload");
  }

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
    logMessage("Attempting to start NodeTool backend server");

    await ensureOllamaIsRunning();
    startNodeToolBackendProcess();
  } catch (error) {
    forceQuit(`Critical error starting server: ${error.message}`);
  }
}

/**
 * Start the development server using npm start.
 */
async function startViteServer() {
  logMessage("Starting Vite server...");
  emitBootMessage("Starting Vite server...");

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

  try {
    viteProcess = spawn(npmCmd, ["start"], {
      cwd: path.join(process.cwd(), "..", "web"),
      stdio: "pipe",
      shell: false,
      detached: false,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    });

    viteProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        logMessage(`Vite Server: ${output}`);

        // Parse the port from the output without regex
        if (output.includes("localhost:")) {
          const parts = output.split("localhost:");
          const port = parts[1].split(" ")[0].split("/")[0];
          logMessage(`Vite server started on port ${port}`);
          serverState.initialURL = `http://127.0.0.1:${port}`;
          emitBootMessage("Vite server started");
        }
      }
    });

    viteProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        logMessage(`Vite Server Error: ${output}`, "error");
      }
    });

    viteProcess.on("error", (error) => {
      logMessage(`Failed to start Vite server: ${error.message}`, "error");
      forceQuit(`Failed to start Vite server: ${error.message}`);
    });

    viteProcess.on("exit", (code, signal) => {
      if (code !== 0 && !isAppQuitting) {
        logMessage(
          `Vite server exited with code ${code} and signal ${signal}`,
          "error"
        );
        forceQuit(`Vite server terminated unexpectedly with code ${code}`);
      }
    });

    // Add cleanup on app quit
    app.on("before-quit", () => {
      if (viteProcess) {
        viteProcess.kill();
      }
    });
  } catch (error) {
    logMessage(`Error starting development server: ${error.message}`, "error");
    forceQuit(`Failed to start development server: ${error.message}`);
  }
}

/**
 * Perform graceful shutdown of the server.
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");
  isAppQuitting = true;

  try {
    // Kill Vite process
    if (viteProcess) {
      logMessage("Stopping Vite process");
      viteProcess.kill("SIGTERM");

      await new Promise((resolve, reject) => {
        viteProcess.on("exit", resolve);
        viteProcess.on("error", reject);

        setTimeout(() => {
          if (!viteProcess.killed) {
            viteProcess.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      });
    }

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
  startViteServer,
  gracefulShutdown,
  webPath,
};
