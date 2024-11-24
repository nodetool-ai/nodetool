const { spawn } = require('child_process');
const { dialog, shell, app } = require('electron');
const { logMessage } = require('./logger');
const { getMainWindow } = require('./window');
const { processEnv, condaEnvPath, srcPath } = require('./python');
const path = require('path');
const { forceQuit } = require('./window');
const { checkPythonPackages, updateCondaEnvironment } = require('./python');
const { emitBootMessage, emitServerStarted, emitServerLog } = require('./events');
const { serverState } = require('./state');

// Define webPath here since it's server-specific
const webPath = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "web", "dist");

let nodeToolBackendProcess = null;
let isAppQuitting = false;

/**
 * Start the NodeTool backend server process.
 */
function startNodeToolBackendProcess() {
  emitBootMessage("Configuring server environment...");

  const pythonExecutablePath = process.platform === "win32"
    ? path.join(condaEnvPath, "python.exe")
    : path.join(condaEnvPath, "bin", "python");

  const args = ["-m", "nodetool.cli", "serve", "--static-folder", webPath];

  logMessage(`Using command: ${pythonExecutablePath} ${args.join(" ")}`);

  try {
    nodeToolBackendProcess = spawn(
      pythonExecutablePath,
      args,
      {
        stdio: "pipe",
        shell: false,
        env: processEnv,
      }
    );
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
  const ollamaVersion = "0.3.14";
  const downloadUrl =
    process.platform === "darwin"
      ? `https://github.com/ollama/ollama/releases/download/v${ollamaVersion}/Ollama-darwin.zip`
      : `https://github.com/ollama/ollama/releases/download/v${ollamaVersion}/OllamaSetup.exe`;

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
 * Perform graceful shutdown of the server.
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");

  try {
    if (nodeToolBackendProcess) {
      logMessage("Stopping NodeTool backend process");
      nodeToolBackendProcess.kill("SIGTERM");

      await new Promise((resolve, reject) => {
        nodeToolBackendProcess.on('exit', resolve);
        nodeToolBackendProcess.on('error', reject);

        setTimeout(() => {
          if (!nodeToolBackendProcess.killed) {
            nodeToolBackendProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }
  } catch (error) {
    logMessage(`Error stopping backend process: ${error.message}`, "error");
  }

  logMessage("Graceful shutdown complete");
}

module.exports = {
  serverState,
  initializeBackendServer,
  gracefulShutdown,
  webPath
}; 