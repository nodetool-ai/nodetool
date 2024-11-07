/**
 * NodeTool Desktop Application - Main Process
 *
 * This is the entry point for the Electron-based NodeTool desktop application.
 * It manages the complete lifecycle of the application including window management,
 * Python environment setup, and server processes.
 *
 * Key Features:
 * - Electron window management and IPC communication
 * - Automated Miniconda installation and environment setup
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
 *
 * File Organization:
 * - /electron        - Electron main process code
 * - /src            - Python backend code
 * - /web            - Frontend React application
 * - /resources      - Application resources
 *
 * @module electron/index
 * @requires electron
 * @requires electron-log
 * @requires electron-updater
 */

/**
 *a This file is the entry point for the Electron app.
 * It is responsible for creating the main window and starting the server.
 * NodeTool is a no-code AI development platform that allows users to create and run complex AI workflows.
 *
 * @typedef {import('electron').BrowserWindow} BrowserWindow
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
const { access, unlink, chmod } = require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const { appendFile } = require("fs").promises;
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const extract = require("extract-zip");

/**
 * The main application window instance.
 * Used to manage the primary UI window of the Electron application.
 * @type {BrowserWindow|null}
 */
let mainWindow;
/**
 * Reference to the Python server process.
 * Manages the NodeTool backend server running in Python.
 * @type {import('child_process').ChildProcess|null}
 */
let serverProcess;
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
const platform = os.platform() === "win32" ? "windows" : os.platform();
/**
 * Path to the Conda environment configuration file.
 * Defines Python dependencies and packages needed by NodeTool.
 * In production: resources/environment.yaml
 * In development: project_root/environment-{platform}-{arch}.yaml
 * @type {string}
 */
const envFilePath = app.isPackaged
  ? path.join(resourcesPath, "environment.yaml")
  : path.join(__dirname, "..", `environment-${platform}-${os.arch()}.yaml`);
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
 * Path to the conda-packed environment.
 * @type {string}
 */
const minicondaPath = path.join(appDir, "conda_env");

/**
 * Environment variables for the NodeTool server process.
 * @type {Object}
 */
const env = {
  ...process.env,
  PYTHONPATH: srcPath,
  PYTHONUNBUFFERED: "1",
  PATH:
    path.join(minicondaPath, process.platform === "win32" ? "Scripts" : "bin") +
    path.delimiter +
    process.env.PATH,
};

log.info("resourcesPath", resourcesPath);
log.info("srcPath", srcPath);
log.info("webPath", webPath);
log.info("minicondaPath", minicondaPath);

/** @type {string} */
const VERSION = "0.5.3";

log.info("resourcesPath", resourcesPath);
log.info("envFilePath", envFilePath);
log.info("srcPath", srcPath);
log.info("webPath", webPath);

/** @type {{ isStarted: boolean, bootMsg: string, logs: string[] }} */
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  logs: [],
};

/**
 * Create the main application window
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

  // Add this: Wait for the window to be ready before sending initial state
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

  // Add this line to set the permission check handler
  setPermissionCheckHandler();
}

function setPermissionCheckHandler() {
  session.defaultSession.setPermissionRequestHandler(() => {
    return true;
  });
  session.defaultSession.setPermissionCheckHandler(() => {
    return true;
  });
}

/**
 * Run the NodeTool server with improved error handling
 */
function runNodeTool() {
  emitBootMessage("Configuring server environment...");

  const pythonPath =
    process.platform === "win32"
      ? path.join(minicondaPath, "Scripts", "python.exe")
      : path.join(minicondaPath, "bin", "python");

  logMessage(
    `Using command: ${pythonPath} -m nodetool.cli serve --static-folder ${webPath}`
  );

  serverProcess = spawn(
    pythonPath,
    ["-m", "nodetool.cli", "serve", "--static-folder", webPath],
    {
      stdio: "pipe",
      shell: false,
      env: env,
    }
  );

  // Add detailed error logging
  serverProcess.on("spawn", () => {
    logMessage("Server process spawned successfully");
    emitBootMessage("Server process started...");
  });

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

  serverProcess.stdout.on("data", handleServerOutput);
  serverProcess.stderr.on("data", handleServerOutput);

  serverProcess.on("error", (error) => {
    forceQuit(`Server process error: ${error.message}`);
  });

  serverProcess.on("exit", (code, signal) => {
    logMessage(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && !isAppQuitting) {
      forceQuit(`The server process terminated unexpectedly with code ${code}`);
    }
  });

  // Add this to check if process is running
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      logMessage("Server process is still running after startup");
    } else {
      logMessage("Server process failed to start or terminated early", "error");
    }
  }, 1000);
}

/**
 * Check if Ollama server is already running
 * @returns {Promise<boolean>}
 */
async function checkOllama() {
  try {
    const response = await fetch("http://localhost:11434/api/version");
    return response.status === 200;
  } catch (error) {
    await showOllamaInstallDialog();
    return false;
  }
}

/**
 * Show dialog explaining Ollama and providing download links
 */
async function showOllamaInstallDialog() {
  const ollama_version = "0.3.14";
  const downloadUrl =
    process.platform === "darwin"
      ? `https://github.com/ollama/ollama/releases/download/v${ollama_version}/Ollama-darwin.zip`
      : `https://github.com/ollama/ollama/releases/download/v${ollama_version}/OllamaSetup.exe`;

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
 * Download a file from a URL
 * @param {string} url - The URL to download from
 * @param {string} dest - The destination path
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
      if (response.statusCode === 302) {
        https
          .get(response.headers.location, handleResponse)
          .on("error", handleError);
        return;
      }

      totalBytes = parseInt(response.headers["content-length"], 10);
      logMessage(`Download started. Total size: ${totalBytes} bytes`);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / totalBytes) * 100;
        const fileName = path.basename(dest).split(".")[0];
        emitUpdateProgress(fileName, progress, "Downloading");
      });

      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          logMessage(`Download completed: ${dest}`);
          resolve();
        });
      });
    }

    function handleError(err) {
      unlink(dest, () => {
        logMessage(`Error downloading file: ${err.message}`);
        reject(err);
      });
    }
  });
}

/**
 * Start the NodeTool server with improved error handling
 */
async function startServer() {
  try {
    logMessage("Attempting to run NodeTool");
    await checkOllama();
    runNodeTool();
  } catch (error) {
    forceQuit(`Critical error starting server: ${error.message}`);
  }
}

let isAppQuitting = false;

app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    isAppQuitting = true;
    gracefulShutdown();
  }
});

/**
 * Perform a graceful shutdown of the application
 */
async function gracefulShutdown() {
  logMessage("Initiating graceful shutdown");

  try {
    if (serverProcess) {
      logMessage("Stopping server process");
      serverProcess.kill("SIGKILL");
    }
  } catch (error) {
    logMessage(`Error stopping server process: ${error.message}`, "error");
  }

  logMessage("Graceful shutdown complete");
}

let updateAvailable = false;

function setupAutoUpdater() {
  // Add this configuration block at the start of the function
  if (!app.isPackaged) {
    logMessage("Skipping auto-updater in development mode");
    return;
  }

  // Set the feed URL for updates
  const platform = os.platform() === "win32" ? "win" : "mac";
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "nodetool-ai",
    repo: "nodetool",
    updaterCacheDirName: "nodetool-updater",
  });

  // Configure logging
  autoUpdater.logger = log;

  // Check for updates immediately and every 30 minutes
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

  autoUpdater.on("update-downloaded", (info) => {
    logMessage(`Update downloaded: ${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });

  autoUpdater.on("error", (err) => {
    logMessage(`Update error: ${err.message}`, "error");
  });
}

ipcMain.handle("install-update", () => {
  if (updateAvailable) {
    autoUpdater.quitAndInstall(false, true);
  }
});

app.on("ready", async () => {
  logMessage("Electron app is ready");
  emitBootMessage("Starting NodeTool Desktop...");

  createWindow();
  setupAutoUpdater();

  emitBootMessage("Checking for Conda environment...");
  if (!(await isCondaEnvironmentInstalled())) {
    await installCondaEnvironment();
  }

  emitBootMessage("Starting NodeTool server...");
  startServer();
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
  if (serverProcess) {
    logMessage("Killing server process");
    serverProcess.kill();
  }
});

ipcMain.handle("get-server-state", () => serverState);

/**
 * Emit a boot message to the main window
 * @param {string} message - The message to emit
 */
function emitBootMessage(message) {
  serverState.bootMsg = message;
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("boot-message", message);
    } catch (error) {
      console.error("Error emitting boot message:", error);
    }
  }
}

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
 * Enhanced logging function
 * @param {string} message - The message to log
 * @param {'info' | 'warn' | 'error'} level - The log level
 */
function logMessage(message, level = "info") {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}\n`;
    log[level](logMessage);
    emitServerLog(logMessage);

    // Asynchronously write to log file
    appendFile(LOG_FILE, logMessage).catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${error.message}`);
  }
}

// Add these new event emitter functions

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
 * Check if Conda is installed in the userData directory
 * @returns {Promise<boolean>}
 */
async function isCondaInstalled() {
  try {
    await access(condaPath);

    // Verify conda is working
    return new Promise((resolve) => {
      const condaProcess = spawn(condaPath, ["--version"], {
        env: {
          ...process.env,
          PATH: path.dirname(condaPath) + path.delimiter + process.env.PATH,
        },
      });

      condaProcess.on("close", (code) => {
        resolve(code === 0);
      });

      condaProcess.on("error", () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Download and unpack a pre-packaged conda environment
 * @returns {Promise<void>}
 */
async function installMiniconda() {
  emitBootMessage("Downloading Conda environment...");
  logMessage(`Downloading Conda environment to: ${minicondaPath}`);

  const platform = process.platform;
  const arch = process.arch;
  let environmentUrl = "";
  let archivePath = "";

  // Determine environment URL based on platform and architecture
  if (platform === "win32") {
    environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-windows-x64-0.5.3.zip`;
    archivePath = path.join(os.tmpdir(), `conda-env-windows-x64-0.5.3.zip`);
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-darwin-${archSuffix}-0.5.3.zip`;
    archivePath = path.join(
      os.tmpdir(),
      `conda-env-darwin-${archSuffix}-0.5.3.zip`
    );
  } else {
    throw new Error("Unsupported platform for Conda environment installation.");
  }

  logMessage(`Downloading Conda environment from ${environmentUrl}`);
  emitBootMessage("Downloading Conda environment...");

  // Download the environment archive
  await downloadFile(environmentUrl, archivePath);
  logMessage("Conda environment archive downloaded successfully");
  emitBootMessage("Conda environment archive downloaded successfully");

  // Unpack the archive into the minicondaPath
  emitBootMessage("Unpacking Conda environment...");
  await unzipFile(archivePath, minicondaPath);

  logMessage("Conda environment unpacked successfully");
  emitBootMessage("Conda environment unpacked successfully");

  // Run conda-unpack
  emitBootMessage("Running conda-unpack...");
  await runCondaUnpack();

  logMessage("Conda environment ready");
  emitBootMessage("Conda environment is ready");
}

/**
 * Check if Conda environment exists
 * @returns {Promise<boolean>}
 */
async function condaEnvironmentExists() {
  const checkEnvProcess = spawn(condaPath, ["env", "list", "--json"]);

  logMessage("Checking if conda environment exists...");

  return new Promise((resolve, reject) => {
    let output = "";

    checkEnvProcess.stdout.on("data", (data) => {
      output += data.toString();
      logMessage(data.toString());
    });

    checkEnvProcess.on("close", (code) => {
      logMessage(`Conda environment check completed with code ${code}`);
      if (code === 0) {
        try {
          const envList = JSON.parse(output);
          const exists = envList.envs.some(
            (env) =>
              env.startsWith(minicondaPath) &&
              (env.endsWith(envName) || env === envName)
          );
          logMessage(
            `Checking if conda environment '${envName}' exists: ${exists}`
          );
          resolve(exists);
        } catch (error) {
          logMessage("Failed to parse conda environment list", "error");
          reject(new Error("Failed to parse conda environment list"));
        }
      } else {
        logMessage("Failed to list conda environments", "error");
        reject(new Error("Failed to list conda environments"));
      }
    });

    checkEnvProcess.on("error", (error) => {
      logMessage(`Error checking conda environment: ${error.message}`, "error");
      reject(error);
    });
  });
}

/**
 * Create Conda environment from the environment.yml file
 * @returns {Promise<void>}
 */
async function createCondaEnvironment() {
  logMessage("Creating Conda environment...");
  emitBootMessage("Creating Python environment...");

  await new Promise((resolve, reject) => {
    const createEnvProcess = spawn(condaPath, [
      "env",
      "create",
      "--file",
      envFilePath,
      "--verbose",
    ]);

    let currentPackage = "";

    createEnvProcess.stdout.on("data", (buffer) => {
      const msg = buffer.toString();
      logMessage(msg);

      // Match different conda progress messages
      const extractMatch = msg.match(
        /DEBUG conda\.gateways\.disk\.create:extract_tarball.*extracting (.+) to/
      );
      const downloadMatch = msg.match(
        /(\d+)%\s*\|?\s*(\d+\/\d+)?\s*\[([^\]]+)\]?\s*(\S+)?/
      );
      const packageMatch = msg.match(/Installing\s+([^\.]+)/);

      if (extractMatch) {
        currentPackage = path.basename(extractMatch[1]);
        emitBootMessage(`Extracting ${currentPackage}...`);
      } else if (downloadMatch) {
        const [, percentage, progress, speed, package] = downloadMatch;
        currentPackage = package || currentPackage;
        emitBootMessage(
          `Downloading ${currentPackage} (${percentage}%) - ${speed}`
        );
      } else if (packageMatch) {
        currentPackage = packageMatch[1].trim();
        emitBootMessage(`Installing ${currentPackage}...`);
      } else if (msg.includes("Collecting package metadata")) {
        emitBootMessage("Collecting package information...");
      } else if (msg.includes("Solving environment")) {
        emitBootMessage(
          "Resolving dependencies (this may take a few minutes)..."
        );
      } else if (msg.includes("Installing pip dependencies")) {
        emitBootMessage(
          "Installing pip dependencies (this may take a few minutes)..."
        );
      }
    });

    createEnvProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      logMessage(msg, "warn");

      // Also check stderr for pip installation progress
      if (msg.includes("Installing collected packages")) {
        const pipPackage = msg.match(/Installing collected packages:\s*(.+)/);
        if (pipPackage) {
          emitBootMessage(`Installing pip package: ${pipPackage[1]}`);
        }
      }
    });

    createEnvProcess.on("close", (code) => {
      if (code === 0) {
        emitBootMessage("Python environment created successfully");
        resolve();
      } else {
        reject(
          new Error(`Failed to create Conda environment (exit code: ${code})`)
        );
      }
    });

    createEnvProcess.on("error", (err) => {
      logMessage(`Error creating conda environment: ${err.message}`, "error");
      reject(err);
    });
  });

  saveConfig({ version: VERSION });

  logMessage("Conda environment created successfully");
}

// Add these constants
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");

// Add this function to handle config operations
function getConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return config;
  } catch {
    return { version: "0.0.0" };
  }
}

function saveConfig(config) {
  const currentConfig = getConfig();
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...currentConfig, ...config }, null, 2)
  );
}

// Add these constants near the top with other constants
const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

// Add new IPC handler to get log file path
ipcMain.handle("get-log-file-path", () => LOG_FILE);

// Add new IPC handler to open log file
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});

/**
 * Check if Conda is installed in the userData directory
 * @returns {Promise<boolean>}
 */
async function isCondaInstalled() {
  try {
    await access(condaPath);

    // Verify conda is working
    return new Promise((resolve) => {
      const condaProcess = spawn(condaPath, ["--version"], {
        env: {
          ...process.env,
          PATH: path.dirname(condaPath) + path.delimiter + process.env.PATH,
        },
      });

      condaProcess.on("close", (code) => {
        resolve(code === 0);
      });

      condaProcess.on("error", () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Download and install the conda-packed environment
 * @returns {Promise<void>}
 */
async function installCondaEnvironment() {
  emitBootMessage("Downloading Conda environment...");
  logMessage(`Downloading Conda environment to: ${minicondaPath}`);

  const platform = process.platform;
  const arch = process.arch;
  let environmentUrl = "";
  let archivePath = "";

  // Determine environment URL based on platform and architecture
  if (platform === "win32") {
    environmentUrl = `https://nodetool-conda.s3.amazonaws.com/condapack_env_windows_x64.zip`;
    archivePath = path.join(os.tmpdir(), `condapack_env_windows_x64.zip`);
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    environmentUrl = `https://nodetool-conda.s3.amazonaws.com/condapack_env_darwin_${archSuffix}.zip`;
    archivePath = path.join(
      os.tmpdir(),
      `condapack_env_darwin_${archSuffix}.zip`
    );
  } else {
    throw new Error("Unsupported platform for Conda environment installation.");
  }

  logMessage(`Downloading Conda environment from ${environmentUrl}`);
  emitBootMessage("Downloading Conda environment...");

  // Download the environment archive
  await downloadFile(environmentUrl, archivePath);
  logMessage("Conda environment archive downloaded successfully");
  emitBootMessage("Conda environment archive downloaded successfully");

  // Unpack the archive into the minicondaPath
  emitBootMessage("Unpacking Conda environment...");
  await unzipFile(archivePath, minicondaPath);

  logMessage("Conda environment unpacked successfully");
  emitBootMessage("Conda environment unpacked successfully");

  // Run conda-unpack
  emitBootMessage("Running conda-unpack...");
  await runCondaUnpack();

  logMessage("Conda environment ready");
  emitBootMessage("Conda environment is ready");
}

/**
 * Check if the conda-packed environment is installed
 * @returns {Promise<boolean>}
 */
async function isCondaEnvironmentInstalled() {
  try {
    // Check if the python executable exists in the environment
    const pythonPath =
      process.platform === "win32"
        ? path.join(minicondaPath, "Scripts", "python.exe")
        : path.join(minicondaPath, "bin", "python");

    await access(pythonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a zip archive to a specified destination
 * @param {string} zipPath - The path to the zip file
 * @param {string} destPath - The destination directory
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
 * Run conda-unpack script to fix the environment paths
 * @returns {Promise<void>}
 */
async function runCondaUnpack() {
  emitBootMessage("Running conda-unpack to fix environment paths...");

  const condaUnpackScript =
    process.platform === "win32"
      ? path.join(minicondaPath, "Scripts", "conda-unpack.exe")
      : path.join(minicondaPath, "bin", "conda-unpack");

  await new Promise((resolve, reject) => {
    const unpackProcess = spawn(condaUnpackScript, [], {
      env: {
        ...process.env,
        PATH:
          path.dirname(condaUnpackScript) + path.delimiter + process.env.PATH,
      },
    });

    unpackProcess.stdout.on("data", (data) => {
      logMessage(data.toString());
    });

    unpackProcess.stderr.on("data", (data) => {
      logMessage(data.toString(), "error");
    });

    unpackProcess.on("close", (code) => {
      if (code === 0) {
        emitBootMessage("conda-unpack completed successfully");
        resolve();
      } else {
        reject(new Error(`conda-unpack failed with code ${code}`));
      }
    });

    unpackProcess.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Force quit the application
 * @param {string} errorMessage - Error message to show before quitting
 */
function forceQuit(errorMessage) {
  logMessage(`Force quitting application: ${errorMessage}`, "error");
  dialog.showErrorBox("Critical Error", errorMessage);

  // Force kill any remaining processes
  if (serverProcess) {
    try {
      serverProcess.kill("SIGKILL");
    } catch (e) {
      logMessage(`Error killing server process: ${e.message}`, "error");
    }
  }

  // Force exit the app
  process.exit(1);
}

// Add global error handlers
process.on("uncaughtException", (error) => {
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on("unhandledRejection", (error) => {
  forceQuit(`Unhandled Promise Rejection: ${error.message}`);
});
