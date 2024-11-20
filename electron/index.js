/**
 * NodeTool Desktop Application - Main Process
 *
 * This is the entry point for the Electron-based NodeTool desktop application.
 * It manages the complete lifecycle of the application including window management,
 * Python environment setup, and server processes.
 *
 * Key Features:
 * - Electron window management and IPC communication
 * - Automated Conda environment setup
 * - Python server process management
 * - Auto-updates via electron-updater
 * - Cross-platform compatibility (Windows/macOS)
 * - Comprehensive logging system
 *
 * Architecture:
 * 1. Main Process (this file)
 *    - Controls application lifecycle
 *    - Manages window creation
 *    - Handles IPC communication
 *    - Controls Python server process
 *
 * 2. Renderer Process
 *    - Handles UI rendering
 *    - Communicates with main process via IPC
 *
 * 3. Python Server
 *    - Runs NodeTool backend services
 *    - Manages AI model interactions
 *    - Handles data processing
 *
 * Security Features:
 * - Context isolation enabled
 * - Node integration disabled
 * - Controlled permissions system
 * - Secure IPC communication
 * - Global error handlers for uncaught exceptions and unhandled promise rejections
 *
 * File Organization:
 * - /electron      - Electron main process code
 * - /src           - Python backend code
 * - /web           - Frontend React application
 * - /resources     - Application resources
 *
 * @module electron/index
 * @requires electron
 * @requires electron-log
 * @requires electron-updater
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  session,
  shell,
} = require("electron");
const path = require("path");
const { createWriteStream } = require("fs");
const { access, appendFile } = require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const extract = require("extract-zip");

const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

/**
 * The main application window instance.
 * Used to manage the primary UI window of the Electron application.
 * @type {BrowserWindow|null}
 */
let mainWindow;

/**
 * Reference to the NodeTool backend server process.
 * Manages the NodeTool backend server running in Python.
 * @type {import('child_process').ChildProcess|null}
 */
let nodeToolBackendProcess;

/**
 * Path to the application's resources directory.
 * In production, this points to the app.asar/resources folder.
 * In development, this points to the project root.
 * @type {string}
 */
const resourcesPath = process.resourcesPath;

/**
 * Path to the Python source code directory.
 * Contains the NodeTool Python backend code.
 * In production: resources/src
 * In development: project_root/src
 * @type {string}
 */
const srcPath = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "src");

/**
 * Path to the web frontend files.
 * Contains the compiled React frontend code.
 * In production: resources/web
 * In development: project_root/web/dist
 * @type {string}
 */
const webPath = app.isPackaged
  ? path.join(resourcesPath, "web")
  : path.join(__dirname, "..", "web", "dist");

/**
 * Normalized platform identifier.
 * Converts 'win32' to 'windows', leaves other platforms as-is.
 * Used for platform-specific file paths and configurations.
 * @type {string}
 */
const normalizedPlatform =
  os.platform() === "win32" ? "windows" : os.platform();

/**
 * Path to the requirements.txt file.
 * Defines Python dependencies and packages needed by NodeTool.
 * In production: resources/requirements.txt
 * In development: project_root/requirements.txt
 * @type {string}
 */
const requirementsFilePath = app.isPackaged
  ? path.join(resourcesPath, "requirements.txt")
  : path.join(__dirname, "..", "requirements.txt");

/**
 * Base directory for the application.
 * In portable mode: uses PORTABLE_EXECUTABLE_DIR
 * Otherwise: uses the directory containing the executable
 * Used as the root for application-specific files and directories.
 * @type {string}
 */
const appDir =
  process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath("exe"));

/**
 * Path to the Conda environment.
 * @type {string}
 */
const condaEnvPath = path.join(appDir, "conda_env");

/**
 * Environment variables for the NodeTool backend process.
 * @type {Object}
 */
const processEnv = {
  ...process.env,
  PYTHONPATH: srcPath,
  PYTHONUNBUFFERED: "1",
  PATH:
    path.join(condaEnvPath, process.platform === "win32" ? "Scripts" : "bin") +
    path.delimiter +
    process.env.PATH,
};

log.info("Resources Path:", resourcesPath);
log.info("Source Path:", srcPath);
log.info("Web Path:", webPath);
log.info("Conda Environment Path:", condaEnvPath);

/** @type {string} - Application version */
const VERSION = "0.5.5";

/**
 * Server state management.
 * @type {{ isStarted: boolean, bootMsg: string, logs: string[] }}
 */
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  logs: [],
};

/**
 * Create the main application window.
 */
function createWindow() {
  logMessage("Creating main window");
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.setBackgroundColor("#111111");
  emitBootMessage("Initializing...");
  mainWindow.loadFile("index.html");
  logMessage("index.html loaded into main window");

  // Wait for the window to be ready before sending initial state
  mainWindow.webContents.on("did-finish-load", () => {
    emitBootMessage(serverState.bootMsg);
    if (serverState.isStarted) {
      emitServerStarted();
    }
    serverState.logs.forEach(emitServerLog);
  });

  mainWindow.on("closed", function () {
    logMessage("Main window closed");
    mainWindow = null;
  });

  // Set the permission check handler
  initializePermissionHandlers();
}

/**
 * Set permission handlers for Electron sessions.
 * All permissions are granted by default. Customize as needed.
 */
function initializePermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      // Customize permissions as needed
      callback(true); // Grant all permissions
    }
  );
  session.defaultSession.setPermissionCheckHandler(() => true);
  logMessage("Permission handlers initialized");
}

/**
 * Start the NodeTool backend server process.
 */
function startNodeToolBackendProcess() {
  emitBootMessage("Configuring server environment...");

  const pythonExecutablePath =
    process.platform === "win32"
      ? path.join(condaEnvPath, "venv", "Scripts", "python.exe")
      : path.join(condaEnvPath, "venv", "bin", "python");

  logMessage(
    `Using command: ${pythonExecutablePath} -m nodetool.cli serve --static-folder ${webPath}`
  );

  nodeToolBackendProcess = spawn(
    pythonExecutablePath,
    ["-m", "nodetool.cli", "serve", "--static-folder", webPath],
    {
      stdio: "pipe",
      shell: false,
      env: processEnv,
    }
  );

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

  // Check if process is running after a delay
  setTimeout(() => {
    if (nodeToolBackendProcess && !nodeToolBackendProcess.killed) {
      logMessage("Server process is still running after startup");
    } else {
      logMessage("Server process failed to start or terminated early", "error");
    }
  }, 1000);

  /**
   * Handle output from the server process.
   * @param {Buffer} data - Output data from the server process.
   */
  function handleServerOutput(data) {
    const output = data.toString().trim();
    if (output) {
      // Only log if there's actual output
      logMessage(`Server output: ${output}`);
    }

    // Check for specific error conditions
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
    }

    if (output.includes("Application startup complete.")) {
      logMessage("Server startup complete");
      emitServerStarted();
    }
    emitServerLog(output);
  }
}

/**
 * Ensure Ollama is installed and running.
 * @returns {Promise<boolean>}
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
 * Start the NodeTool server with error handling.
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
 * Flag to indicate if the app is quitting.
 * @type {boolean}
 */
let isAppQuitting = false;

/**
 * Handle the before-quit event.
 */
app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    isAppQuitting = true;
    gracefulShutdown();
  }
});

/**
 * Perform a graceful shutdown of the application.
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");

  try {
    if (nodeToolBackendProcess) {
      logMessage("Stopping NodeTool backend process");
      nodeToolBackendProcess.kill("SIGKILL");
    }
  } catch (error) {
    logMessage(`Error stopping backend process: ${error.message}`, "error");
  }

  logMessage("Graceful shutdown complete");
}

/**
 * Flag to indicate if an update is available.
 * @type {boolean}
 */
let updateAvailable = false;

/**
 * Setup the auto-updater.
 */
function setupAutoUpdater() {
  if (!app.isPackaged) {
    logMessage("Skipping auto-updater in development mode");
    return;
  }

  // Set the feed URL for updates
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "nodetool-ai",
    repo: "nodetool",
    updaterCacheDirName: "nodetool-updater",
  });

  // Configure logging
  autoUpdater.logger = log;

  // Check for updates immediately
  autoUpdater.checkForUpdates();

  // Update events
  autoUpdater.on("checking-for-update", () => {
    logMessage("Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    logMessage(`Update available: ${info.version}`);
    updateAvailable = true;
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-not-available", () => {
    logMessage("No updates available");
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send("update-progress", progress);
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    logMessage(`Update downloaded: ${info.version}`);

    // Create flag file to trigger Conda environment update after restart
    try {
      await fs.promises.writeFile(
        path.join(app.getPath("userData"), "update-conda-env"),
        "true"
      );
      logMessage("Conda environment update flagged for next startup");
    } catch (error) {
      logMessage(`Error creating update flag: ${error.message}`, "error");
    }

    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });

  autoUpdater.on("error", (err) => {
    logMessage(`Update error: ${err.message}`, "error");
  });
}

// Handle requests to install updates
ipcMain.handle("install-update", () => {
  if (updateAvailable) {
    autoUpdater.quitAndInstall(false, true);
  }
});

// Application event handlers
app.on("ready", async () => {
  logMessage("Electron app is ready");
  emitBootMessage("Starting NodeTool Desktop...");

  // Check if we need to update Conda environment after app update
  const updateFlagPath = path.join(app.getPath("userData"), "update-conda-env");
  try {
    if (await fileExists(updateFlagPath)) {
      emitBootMessage("Updating Conda environment after app update...");
      await updateCondaEnvironment();
      await fs.promises.unlink(updateFlagPath);
      logMessage("Conda environment update completed");
    }
  } catch (error) {
    logMessage(
      `Error handling Conda environment update: ${error.message}`,
      "error"
    );
  }

  createWindow();
  setupAutoUpdater();

  emitBootMessage("Checking for Conda environment...");
  if (!(await isCondaEnvironmentInstalled())) {
    await installCondaEnvironment();
  }

  emitBootMessage("Starting NodeTool server...");
  initializeBackendServer();
});

app.on("window-all-closed", function () {
  logMessage("All windows closed");
  if (process.platform !== "darwin") {
    logMessage("Quitting app (not on macOS)");
    app.quit();
  }
});

app.on("activate", function () {
  logMessage("App activated");
  if (mainWindow === null) {
    logMessage("Creating new window on activate");
    createWindow();
  }
});

app.on("quit", () => {
  logMessage("App is quitting");
  if (nodeToolBackendProcess) {
    logMessage("Killing backend process");
    nodeToolBackendProcess.kill();
  }
});

// IPC handlers
ipcMain.handle("get-server-state", () => serverState);
ipcMain.handle("get-log-file-path", () => LOG_FILE);
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});

/**
 * Emit a boot message to the main window.
 * @param {string} message - The message to emit.
 */
function emitBootMessage(message) {
  // Easter Egg: Add a hidden gem when the application starts
  if (message === "Starting NodeTool Desktop...") {
    message += `\n"Every great developer you know got there by solving problems they were unqualified to solve until they actually did it." – Patrick McKenzie`;
  }
  serverState.bootMsg = message;
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("boot-message", message);
    } catch (error) {
      console.error("Error emitting boot message:", error);
    }
  }
}

/**
 * Emit server started event to the main window.
 */
function emitServerStarted() {
  serverState.isStarted = true;
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("server-started");
    } catch (error) {
      console.error("Error emitting server started:", error);
    }
  }
}

/**
 * Emit a server log message to the main window.
 * @param {string} message - The log message.
 */
function emitServerLog(message) {
  serverState.logs.push(message);
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("server-log", message);
    } catch (error) {
      console.error("Error emitting server log:", error);
    }
  }
}

/**
 * Enhanced logging function.
 * @param {string} message - The message to log.
 * @param {'info' | 'warn' | 'error'} level - The log level.
 */
function logMessage(message, level = "info") {
  try {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}\n`;
    log[level](fullMessage);
    emitServerLog(fullMessage);

    // Asynchronously write to log file
    appendFile(LOG_FILE, fullMessage).catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${error.message}`);
  }
}

/**
 * Emit update progress to the main window.
 * @param {string} componentName - Name of the component being updated.
 * @param {number} progress - Progress percentage.
 * @param {string} action - Description of the current action.
 */
function emitUpdateProgress(componentName, progress, action) {
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("update-progress", {
        componentName,
        progress,
        action,
      });
    } catch (error) {
      console.error("Error emitting update progress:", error);
    }
  }
}

/**
 * Get the application configuration.
 * @returns {Object}
 */
function getConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return config;
  } catch {
    return { version: "0.0.0" };
  }
}

/**
 * Save the application configuration.
 * @param {Object} config - Configuration object to save.
 */
function saveConfig(config) {
  const currentConfig = getConfig();
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...currentConfig, ...config }, null, 2)
  );
}

/**
 * Check if the Conda environment is installed.
 * @returns {Promise<boolean>}
 */
async function isCondaEnvironmentInstalled() {
  try {
    // Check if the python executable exists in the environment
    const pythonExecutablePath =
      process.platform === "win32"
        ? path.join(condaEnvPath, "python.exe")
        : path.join(condaEnvPath, "bin", "python");

    await access(pythonExecutablePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and install the pre-packaged Conda environment.
 * @returns {Promise<void>}
 */
async function installCondaEnvironment() {
  try {
    emitBootMessage("Downloading Conda environment...");
    logMessage(`Downloading Conda environment to: ${condaEnvPath}`);

    const platform = process.platform;
    const arch = process.arch;
    let environmentUrl = "";
    let archivePath = "";

    // Update URLs to use version-specific files
    if (platform === "win32") {
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-windows-x64-${VERSION}.zip`;
      archivePath = path.join(
        os.tmpdir(),
        `conda-env-windows-x64-${VERSION}.zip`
      );
    } else if (platform === "darwin") {
      const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-darwin-${archSuffix}-${VERSION}.zip`;
      archivePath = path.join(
        os.tmpdir(),
        `conda-env-darwin-${archSuffix}-${VERSION}.zip`
      );
    } else {
      throw new Error(
        "Unsupported platform for Conda environment installation."
      );
    }

    // Ensure temp directory exists
    await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });

    // Download with retries
    let attempts = 3;
    while (attempts > 0) {
      try {
        await downloadFile(environmentUrl, archivePath);
        break;
      } catch (error) {
        attempts--;
        if (attempts === 0) throw error;
        logMessage(`Download failed, retrying... (${attempts} attempts left)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Ensure destination directory exists
    await fs.promises.mkdir(condaEnvPath, { recursive: true });

    // Unpack and verify
    emitBootMessage("Unpacking Conda environment...");
    await unzipFile(archivePath, condaEnvPath);

    // Cleanup
    await fs.promises.unlink(archivePath);

    logMessage("Conda environment installation completed successfully");
    emitBootMessage("Conda environment is ready");
  } catch (error) {
    logMessage(
      `Failed to install Conda environment: ${error.message}`,
      "error"
    );
    throw error;
  }
}

/**
 * Download a file from a URL with validation.
 * @param {string} url - The URL to download from.
 * @param {string} dest - The destination path.
 * @returns {Promise<void>}
 */
async function downloadFile(url, dest) {
  logMessage(`Downloading file from ${url} to ${dest}`);
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function handleResponse(response) {
      if (response.statusCode === 404) {
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        https
          .get(response.headers.location, handleResponse)
          .on("error", handleError);
        return;
      }

      totalBytes = parseInt(response.headers["content-length"], 10);
      if (!totalBytes) {
        reject(new Error("Invalid content length received"));
        return;
      }

      logMessage(`Download started. Total size: ${totalBytes} bytes`);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / totalBytes) * 100;
        const fileName = path.basename(dest).split(".")[0];
        emitUpdateProgress(fileName, progress, "Downloading");
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close(async () => {
          // Verify file size matches expected size
          try {
            const stats = await fs.promises.stat(dest);
            if (stats.size !== totalBytes) {
              await fs.promises.unlink(dest);
              reject(new Error("Downloaded file size mismatch"));
              return;
            }
            logMessage(`Download completed and verified: ${dest}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }

    function handleError(err) {
      file.close();
      fs.unlink(dest, () => {
        logMessage(`Error downloading file: ${err.message}`);
        reject(err);
      });
    }
  });
}

/**
 * Extract a zip archive to a specified destination.
 * @param {string} zipPath - The path to the zip file.
 * @param {string} destPath - The destination directory.
 * @returns {Promise<void>}
 */
async function unzipFile(zipPath, destPath) {
  emitBootMessage("Unpacking the Conda environment...");
  try {
    await extract(zipPath, { dir: destPath });
    emitBootMessage("Conda environment unpacked successfully");
  } catch (err) {
    logMessage(`Error unpacking Conda environment: ${err.message}`, "error");
    throw err;
  }
}

/**
 * Force quit the application.
 * @param {string} errorMessage - Error message to show before quitting.
 */
function forceQuit(errorMessage) {
  logMessage(`Force quitting application: ${errorMessage}`, "error");
  dialog.showErrorBox("Critical Error", errorMessage);

  // Force kill any remaining processes
  if (nodeToolBackendProcess) {
    try {
      nodeToolBackendProcess.kill("SIGKILL");
    } catch (e) {
      logMessage(`Error killing backend process: ${e.message}`, "error");
    }
  }

  // Force exit the app
  process.exit(1);
}

// Global error handlers
process.on("uncaughtException", (error) => {
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on("unhandledRejection", (error) => {
  forceQuit(`Unhandled Promise Rejection: ${error.message}`);
});

async function updateCondaEnvironment() {
  try {
    logMessage("Starting Python packages update");
    emitBootMessage("Updating Python packages...");

    const pipExecutable =
      process.platform === "win32"
        ? path.join(condaEnvPath, "venv", "Scripts", "pip.exe")
        : path.join(condaEnvPath, "venv", "bin", "pip");

    // Run pip install command
    const updateProcess = spawn(
      pipExecutable,
      ["install", "-r", requirementsFilePath],
      {
        stdio: "pipe",
        env: processEnv,
      }
    );

    // Handle process output
    updateProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`Pip update: ${message}`);
        emitBootMessage(`Updating: ${message}`);
      }
    });

    updateProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`Pip update error: ${message}`, "error");
      }
    });

    // Wait for process to complete
    await new Promise((resolve, reject) => {
      updateProcess.on("exit", (code) => {
        if (code === 0) {
          logMessage("Pip packages update completed successfully");
          resolve();
        } else {
          reject(new Error(`Pip packages update failed with code ${code}`));
        }
      });

      updateProcess.on("error", reject);
    });
  } catch (error) {
    logMessage(`Failed to update Pip packages: ${error.message}`, "error");
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
