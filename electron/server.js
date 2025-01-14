const { spawn } = require("child_process");
const { dialog, shell, app } = require("electron");
const { logMessage } = require("./logger");
const {
  getPythonPath,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  LAUNCHD_SERVICE_NAME,
  PLIST_PATH,
  webPath,
} = require("./config");
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
 * Start the NodeTool server process.
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
    logMessage("NodeTool server starting...");
    emitBootMessage("NodeTool server starting...");
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
 * Create launchd plist file
 * @returns {Promise<void>}
 */
async function createLaunchdPlist() {
  const pythonPath = getPythonPath();
  const binPath = path.dirname(pythonPath);
  const logPath = path.join(app.getPath("logs"), "nodetool-server.log");
  const errorLogPath = path.join(
    app.getPath("logs"),
    "nodetool-server-error.log"
  );

  // make sure the log folder exists
  await fs.mkdir(app.getPath("logs"), { recursive: true });

  // Create log directory if it doesn't exist
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${pythonPath}</string>
        <string>-m</string>
        <string>nodetool.cli</string>
        <string>serve</string>
        <string>--port</string>
        <string>8000</string>
        <string>--static-folder</string>
        <string>${webPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${app.getAppPath()}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONPATH</key>
        <string>${srcPath}</string>
        <key>PATH</key>
        <string>${binPath}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${errorLogPath}</string>
</dict>
</plist>`;

  await fs.writeFile(PLIST_PATH, plistContent);
  // Set proper permissions for the plist file
  await fs.chmod(PLIST_PATH, 0o644);
}

/**
 * Start server using launchd
 */
async function startServerWithLaunchd() {
  try {
    await createLaunchdPlist();
    logMessage("Starting server with launchd...");

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const process = spawn("launchctl", ["load", PLIST_PATH]);
      let stdout = "",
        stderr = "";

      process.stdout.on("data", (data) => (stdout += data));
      process.stderr.on("data", (data) => (stderr += data));

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new Error(`launchctl load failed with code ${code}: ${stderr}`)
          );
        }
      });
    });

    if (stderr) {
      logMessage(`launchctl warning: ${stderr}`, "warn");
    }

    // Wait briefly to allow the service to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the service is running
    const isRunning = await isServerRunningViaLaunchd();
    if (!isRunning) {
      throw new Error("Failed to start server via launchd");
    }

    logMessage("Server started successfully via launchd");
    emitBootMessage("Server started, waiting for availability...");
  } catch (error) {
    logMessage(
      `Failed to start server with launchd: ${error.message}`,
      "error"
    );
    throw error;
  }
}

/**
 * Stop server using launchd
 */
async function stopServerWithLaunchd() {
  try {
    await spawn("launchctl", ["remove", LAUNCHD_SERVICE_NAME]);
    await fs.unlink(PLIST_PATH);
  } catch (error) {
    logMessage(`Error stopping launchd service: ${error.message}`, "error");
  }
}

/**
 * Check if server is running via launchd
 * @returns {Promise<boolean>}
 */
async function isServerRunningViaLaunchd() {
  try {
    const { exec } = require("child_process");
    return new Promise((resolve) => {
      exec(
        `launchctl list ${LAUNCHD_SERVICE_NAME}`,
        (error, stdout, stderr) => {
          // If the command succeeds and returns PID, service is running
          if (!error && stdout && !stdout.includes("Could not find service")) {
            logMessage("Server is already running via launchd");
            resolve(true);
          } else {
            logMessage("Server is not running via launchd");
            resolve(false);
          }
        }
      );
    });
  } catch (error) {
    logMessage(`Error checking launchd status: ${error.message}`, "error");
    return false;
  }
}

/**
 * Check if the server is running
 * @returns {Promise<boolean>} True if server is running
 */
async function isServerRunning() {
  // check if the server is running via launchd or the process is running
  if (process.platform === "darwin") {
    return await isServerRunningViaLaunchd();
  } else {
    return nodeToolBackendProcess !== null;
  }
}

/**
 * Initialize the backend server
 * @returns {Promise<void>}
 * @throws {Error} If server fails to start
 */
async function initializeBackendServer() {
  try {
    if (process.platform !== "darwin") {
      return startNodeToolBackendProcess();
    }

    const isRunning = await isServerRunningViaLaunchd();
    if (isRunning) {
      logMessage("Server already running, connecting...");
      // Wait for server to be available
      await waitForServer();
      return;
    }

    await killExistingServer();
    const isPortFree = await isPortAvailable(8000);
    if (!isPortFree) {
      await showPortInUseError();
      return;
    }

    await ensureOllamaIsRunning();
    await startServerWithLaunchd();
    await waitForServer();
  } catch (error) {
    forceQuit(`Critical error starting server: ${error.message}`);
  }
}

/**
 * Wait for server to become available
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function waitForServer(timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch("http://127.0.0.1:8000/health");
      if (response.ok) {
        logMessage(
          "Server endpoint is available at http://127.0.0.1:8000/health"
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
 * Perform graceful shutdown of the server
 * @returns {Promise<void>}
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");
  isAppQuitting = true;

  if (process.platform === "darwin") {
    await stopServerWithLaunchd();
  } else {
    try {
      if (nodeToolBackendProcess) {
        logMessage("Stopping server process");
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
  }

  logMessage("Graceful shutdown complete");
}

/** @type {Object.<string, any>} */
module.exports = {
  serverState,
  initializeBackendServer,
  gracefulShutdown,
  webPath,
  LAUNCHD_SERVICE_NAME,
  isServerRunning,
};
