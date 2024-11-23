/**
 * NodeTool Desktop Application - Main Process
 *
 * This is the entry point for the Electron-based NodeTool desktop application.
 * It manages the complete lifecycle of the application including window management,
 * Python environment setup, and server processes.
 *
 * Key Features:
 * - Electron window management and IPC communication
 * - Automated Python environment setup
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
const unzipper = require('unzipper');

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
 * Path to the Python environment.
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
  PATH: process.platform === "win32"
    ? [
        path.join(condaEnvPath),
        path.join(condaEnvPath, "Library", "mingw-w64", "bin"),
        path.join(condaEnvPath, "Library", "usr", "bin"),
        path.join(condaEnvPath, "Library", "bin"),
        path.join(condaEnvPath, "Lib", "site-packages", "torch", "lib"),
        path.join(condaEnvPath, "Scripts"),
        process.env.PATH
      ].join(path.delimiter)
    : [
        path.join(condaEnvPath, "bin"),
        path.join(condaEnvPath, "lib"),
        path.join(condaEnvPath, "usr", "bin"),
        path.join(condaEnvPath, "usr", "lib"),
        process.env.PATH
      ].join(path.delimiter),
  // Add additional conda-specific environment variables
  CONDA_PREFIX: condaEnvPath,
  CONDA_DEFAULT_ENV: path.basename(condaEnvPath),
  // Platform-specific library paths
  ...(process.platform !== "win32" && {
    LD_LIBRARY_PATH: [
      path.join(condaEnvPath, "lib"),
      process.env.LD_LIBRARY_PATH
    ].filter(Boolean).join(path.delimiter),
    DYLD_LIBRARY_PATH: process.platform === "darwin" ? [
      path.join(condaEnvPath, "lib"),
      process.env.DYLD_LIBRARY_PATH
    ].filter(Boolean).join(path.delimiter) : undefined
  })
};

log.info("Resources Path:", resourcesPath);
log.info("Source Path:", srcPath);
log.info("Web Path:", webPath);
log.info("Python environment Path:", condaEnvPath);

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

  const pythonExecutablePath = process.platform === "win32"
    ? path.join(condaEnvPath, "python.exe")
    : path.join(condaEnvPath, "bin", "python");

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

  try {
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
    autoUpdater.checkForUpdates().catch(err => {
      logMessage(`Failed to check for updates: ${err.message}`, "warn");
    });

    // Update events with error handling
    autoUpdater.on("checking-for-update", () => {
      logMessage("Checking for updates...");
    });

    autoUpdater.on("update-available", (info) => {
      try {
        logMessage(`Update available: ${info.version}`);
        updateAvailable = true;
        if (mainWindow) {
          mainWindow.webContents.send("update-available", info);
        }
      } catch (err) {
        logMessage(`Error handling update-available event: ${err.message}`, "error");
      }
    });

    autoUpdater.on("update-not-available", () => {
      logMessage("No updates available");
    });

    autoUpdater.on("download-progress", (progress) => {
      try {
        if (mainWindow) {
          mainWindow.webContents.send("update-progress", progress);
        }
      } catch (err) {
        logMessage(`Error handling download progress: ${err.message}`, "error");
      }
    });

    autoUpdater.on("update-downloaded", async (info) => {
      try {
        logMessage(`Update downloaded: ${info.version}`);

        // Create flag file to trigger Python environment update after restart
        try {
          await fs.promises.writeFile(
            path.join(app.getPath("userData"), "update-conda-env"),
            "true"
          );
          logMessage("Python environment update flagged for next startup");
        } catch (error) {
          logMessage(`Error creating update flag: ${error.message}`, "error");
        }

        if (mainWindow) {
          mainWindow.webContents.send("update-downloaded", info);
        }
      } catch (err) {
        logMessage(`Error handling update-downloaded event: ${err.message}`, "error");
      }
    });

    autoUpdater.on("error", (err) => {
      logMessage(`Update error: ${err.message}`, "error");
      try {
        if (mainWindow) {
          mainWindow.webContents.send("update-error", {
            message: "Failed to check for updates. Please try again later.",
            details: err.message
          });
        }
      } catch (sendErr) {
        logMessage(`Error sending update error to window: ${sendErr.message}`, "error");
      }
    });

  } catch (err) {
    logMessage(`Failed to setup auto-updater: ${err.message}`, "error");
  }
}

// Handle requests to install updates with error handling
ipcMain.handle("install-update", async () => {
  try {
    if (updateAvailable) {
      await autoUpdater.quitAndInstall(false, true);
    }
  } catch (err) {
    logMessage(`Failed to install update: ${err.message}`, "error");
    if (mainWindow) {
      mainWindow.webContents.send("update-error", {
        message: "Failed to install update. Please try again later.",
        details: err.message
      });
    }
    throw err; // Propagate error to renderer
  }
});

// Application event handlers
app.on("ready", async () => {
  logMessage("Electron app is ready");
  emitBootMessage("Starting NodeTool Desktop...");

  // Check if we need to update Python environment after app update
  const updateFlagPath = path.join(app.getPath("userData"), "update-conda-env");
  try {
    if (await fileExists(updateFlagPath)) {
      emitBootMessage("Updating Python environment after app update...");
      await updateCondaEnvironment();
      await fs.promises.unlink(updateFlagPath);
      logMessage("Python environment update completed");
    }
  } catch (error) {
    logMessage(
      `Error handling Python environment update: ${error.message}`,
      "error"
    );
  }

  createWindow();
  setupAutoUpdater();

  emitBootMessage("Checking for Python environment...");
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
 * @param {string} eta - Estimated time of arrival.
 */
function emitUpdateProgress(componentName, progress, action, eta) {
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("update-progress", {
        componentName,
        progress,
        action,
        eta,
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
 * Check if the Python environment is installed.
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
 * Download and install the pre-packaged Python environment.
 * @returns {Promise<void>}
 */
async function installCondaEnvironment() {
  try {
    emitBootMessage("Setting up Python environment...");
    logMessage(`Setting up Python environment at: ${condaEnvPath}`);

    const platform = process.platform;
    const arch = process.arch;
    let environmentUrl = "";
    let archivePath = "";

    // Update URLs to use version-specific files
    if (platform === "win32") {
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-windows-x64-${VERSION}.zip`;
      archivePath = path.join(os.tmpdir(), `conda-env-windows-x64-${VERSION}.zip`);
    } else if (platform === "darwin") {
      const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-darwin-${archSuffix}-${VERSION}.zip`;
      archivePath = path.join(os.tmpdir(), `conda-env-darwin-${archSuffix}-${VERSION}.zip`);
    } else {
      throw new Error("Unsupported platform for Python environment installation.");
    }

    // Ensure temp directory exists
    await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
    
    emitBootMessage("Downloading Python environment...");
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

    await fs.promises.mkdir(condaEnvPath, { recursive: true });
    emitBootMessage("Unpacking Python environment...");
    await unpackPythonEnvironment(archivePath, condaEnvPath);

    // Only cleanup if we downloaded a new file
    if (needsDownload) {
      await fs.promises.unlink(archivePath);
    }

    logMessage("Python environment installation completed successfully");
    emitBootMessage("Python environment is ready");
  } catch (error) {
    logMessage(`Failed to install Python environment: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Get file size from URL using HEAD request
 * @param {string} url - The URL to check
 * @returns {Promise<number>} The file size in bytes
 */
async function getFileSizeFromUrl(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'HEAD' }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        getFileSizeFromUrl(response.headers.location)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      const contentLength = parseInt(response.headers['content-length'], 10);
      if (!contentLength) {
        reject(new Error('Could not determine file size'));
        return;
      }
      resolve(contentLength);
    });
    
    request.on('error', reject);
    request.end();
  });
}

/**
 * Download a file from a URL with validation.
 * @param {string} url - The URL to download from.
 * @param {string} dest - The destination path.
 * @returns {Promise<void>}
 */
async function downloadFile(url, dest) {
  logMessage(`Downloading file from ${url} to ${dest}`);
  
  // Get expected file size from server
  const expectedSize = await getFileSizeFromUrl(url);
  logMessage(`Expected file size: ${expectedSize} bytes`);

  // Check if existing file matches size
  try {
    const stats = await fs.promises.stat(dest);
    if (stats.size === expectedSize) {
      logMessage('Existing file matches expected size, skipping download');
      return;
    }
  } catch (err) {
    // File doesn't exist, continue with download
  }

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let downloadedBytes = 0;
    let startTime = Date.now();
    let lastUpdate = startTime;
    let lastBytes = 0;

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function calculateETA(bytesPerSecond) {
      const remainingBytes = expectedSize - downloadedBytes;
      const remainingSeconds = remainingBytes / bytesPerSecond;
      
      if (remainingSeconds < 60) {
        return `${Math.round(remainingSeconds)} seconds left`;
      } else if (remainingSeconds < 3600) {
        return `${Math.round(remainingSeconds / 60)} minutes left`;
      } else {
        return `${Math.round(remainingSeconds / 3600)} hours left`;
      }
    }

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

      const contentLength = parseInt(response.headers["content-length"], 10);
      if (contentLength !== expectedSize) {
        reject(new Error(`Server file size mismatch. Expected: ${expectedSize}, Got: ${contentLength}`));
        return;
      }

      logMessage(`Download started. Total size: ${expectedSize} bytes`);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / expectedSize) * 100;
        const fileName = path.basename(dest).split(".")[0];
        
        // Calculate speed and ETA every second
        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          const timeDiff = (now - lastUpdate) / 1000;
          const bytesDiff = downloadedBytes - lastBytes;
          const bytesPerSecond = bytesDiff / timeDiff;
          const eta = calculateETA(bytesPerSecond);
          
          emitUpdateProgress(fileName, progress, "Downloading", eta);
          
          lastUpdate = now;
          lastBytes = downloadedBytes;
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close(async () => {
          // Verify final file size matches expected size
          try {
            const stats = await fs.promises.stat(dest);
            if (stats.size !== expectedSize) {
              await fs.promises.unlink(dest);
              reject(new Error(`Downloaded file size mismatch. Expected: ${expectedSize}, Got: ${stats.size}`));
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
 * Extract the Python environment from a zip archive.
 * @param {string} zipPath - The path to the zip file.
 * @param {string} destPath - The destination directory.
 * @returns {Promise<void>}
 */
async function unpackPythonEnvironment(zipPath, destPath) {
  emitBootMessage("Unpacking the Python environment...");
  
  try {
    const stats = await fs.promises.stat(zipPath);
    const totalSize = stats.size;
    let extractedSize = 0;
    let startTime = Date.now();
    let lastUpdate = startTime;
    let lastSize = 0;

    function calculateETA(bytesPerSecond) {
      const remainingBytes = totalSize - extractedSize;
      const remainingSeconds = remainingBytes / bytesPerSecond;
      
      if (remainingSeconds < 60) {
        return `${Math.round(remainingSeconds)} seconds left`;
      } else if (remainingSeconds < 3600) {
        return `${Math.round(remainingSeconds / 60)} minutes left`;
      } else {
        return `${Math.round(remainingSeconds / 3600)} hours left`;
      }
    }

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          try {
            const fileName = entry.path;
            const type = entry.type;
            const size = entry.vars.uncompressedSize;
            const fullPath = path.join(destPath, fileName);
            const dirPath = path.dirname(fullPath);

            // Ensure directory exists
            fs.mkdirSync(dirPath, { recursive: true });

            if (type === 'Directory') {
              entry.autodrain();
            } else {
              entry
                .pipe(fs.createWriteStream(fullPath))
                .on('error', (err) => {
                  const errorMsg = `Error writing file ${fileName}: ${err.message}`;
                  logMessage(errorMsg, "error");
                  logMessage(`Stack trace: ${err.stack}`, "error");
                  reject(new Error(errorMsg));
                })
                .on('finish', () => {
                  extractedSize += size;
                  const progress = (extractedSize / totalSize) * 100;
                  
                  const now = Date.now();
                  if (now - lastUpdate >= 1000) {
                    const timeDiff = (now - lastUpdate) / 1000;
                    const bytesDiff = extractedSize - lastSize;
                    const bytesPerSecond = bytesDiff / timeDiff;
                    const eta = calculateETA(bytesPerSecond);
                    
                    emitUpdateProgress('Python environment', progress, 'Extracting', eta);
                    
                    lastUpdate = now;
                    lastSize = extractedSize;
                  }
                });
            }
          } catch (err) {
            const errorMsg = `Error processing entry ${entry.path}: ${err.message}`;
            logMessage(errorMsg, "error");
            logMessage(`Stack trace: ${err.stack}`, "error");
            reject(new Error(errorMsg));
          }
        })
        .on('error', (err) => {
          const errorMsg = `Error during extraction: ${err.message}`;
          logMessage(errorMsg, "error");
          logMessage(`Stack trace: ${err.stack}`, "error");
          reject(new Error(errorMsg));
        })
        .on('finish', resolve);

      // Handle stream errors
      stream.on('error', (err) => {
        const errorMsg = `Error reading zip file: ${err.message}`;
        logMessage(errorMsg, "error");
        logMessage(`Stack trace: ${err.stack}`, "error");
        reject(new Error(errorMsg));
      });
    });

    emitBootMessage("Running conda-unpack...");

    // Rest of the conda-unpack process remains the same
    const unpackScript = process.platform === "win32"
      ? path.join(destPath, "Scripts", "conda-unpack.exe")
      : path.join(destPath, "bin", "conda-unpack");

    const unpackProcess = spawn(unpackScript, [], {
      stdio: "pipe",
      env: processEnv,
      cwd: destPath
    });

    // Handle process output
    unpackProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack: ${message}`);
      }
    });

    unpackProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack error: ${message}`, "error");
      }
    });

    // Wait for process to complete
    await new Promise((resolve, reject) => {
      unpackProcess.on("exit", (code) => {
        if (code === 0) {
          logMessage("conda-unpack completed successfully");
          emitBootMessage("Python environment unpacked successfully");
          resolve();
        } else {
          reject(new Error(`conda-unpack failed with code ${code}`));
        }
      });

      unpackProcess.on("error", reject);
    });

  } catch (err) {
    const errorMsg = `Failed to unpack Python environment: ${err.message}`;
    logMessage(errorMsg, "error");
    logMessage(`Stack trace: ${err.stack}`, "error");
    
    // Show error dialog to user
    dialog.showErrorBox(
      "Installation Error",
      `Failed to install Python environment.\n\nError: ${err.message}\n\nPlease check the log file for more details.`
    );
    
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

    const pipExecutable = process.platform === "win32"
      ? path.join(condaEnvPath, "Scripts", "pip.exe")
      : path.join(condaEnvPath, "bin", "pip");

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
