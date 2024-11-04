/**
 *a This file is the entry point for the Electron app.
 * It is responsible for creating the main window and starting the server.
 * NodeTool is a no-code AI development platform that allows users to create and run complex AI workflows.
 *
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 */

/**
 * NodeTool Desktop Application - Main Process
 *
 * This file serves as the entry point for the Electron-based NodeTool desktop application.
 * It manages the application lifecycle, window creation, and server processes.
 *
 * Core Responsibilities:
 * 1. Application Window Management
 *    - Creates and manages the main application window
 *    - Handles window events and permissions
 *    - Manages IPC communication between main and renderer processes
 *
 * 2. Python Environment Management
 *    - Handles Miniconda installation and setup
 *    - Creates and maintains the Python virtual environment
 *    - Manages Python dependencies and packages
 *
 * 3. Server Process Management
 *    - Starts and monitors the NodeTool server
 *    - Handles server logs and status updates
 *
 * 4. Application Lifecycle
 *    - Handles application startup and initialization
 *    - Manages graceful shutdown procedures
 *    - Coordinates updates and component installations
 *
 * Key Components:
 * - Main Window: BrowserWindow instance for the UI
 * - Server Process: Python-based NodeTool server
 * - IPC Communication: Event system for process communication
 *
 * State Management:
 * - Server State: Tracks server status, boot messages, and logs
 * - Environment Variables: Manages Python and system paths
 * - Process States: Monitors running processes and their status
 *
 * Error Handling:
 * - Comprehensive error catching for all critical operations
 * - User notifications for important errors
 * - Graceful degradation when possible
 *
 * Platform Support:
 * - Windows and macOS compatibility
 * - Platform-specific path handling
 * - Architecture-aware installations
 *
 * Security:
 * - Controlled permissions system
 * - Isolated Python environment
 * - Secure IPC communication
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

/** @type {BrowserWindow|null} */
let mainWindow;
/** @type {import('child_process').ChildProcess|null} */
let serverProcess;
/** @type {string} */
const resourcesPath = process.resourcesPath;
/** @type {string} */ 
const srcPath = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, '..', 'src');
/** @type {string} */
const webPath = app.isPackaged
  ? path.join(resourcesPath, "web")
  : path.join(__dirname, '..', 'web', 'dist');
const platform = os.platform() === "win32" ? "windows" : os.platform();
/** @type {string} */
const envFilePath = app.isPackaged
  ? path.join(resourcesPath, "environment.yaml")
  : path.join(__dirname, '..', `environment-${platform}-${os.arch()}.yaml`);
/** @type {string} */
const VERSION = "0.5.1";

console.log("resourcesPath", resourcesPath);
console.log("envFilePath", envFilePath);
console.log("srcPath", srcPath);
console.log("webPath", webPath);

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
  log("Creating main window");
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
  log("index.html loaded into main window");

  // Add this: Wait for the window to be ready before sending initial state
  mainWindow.webContents.on("did-finish-load", () => {
    emitBootMessage(serverState.bootMsg);
    if (serverState.isStarted) {
      emitServerStarted();
    }
    serverState.logs.forEach(emitServerLog);
  });

  mainWindow.on("closed", function () {
    log("Main window closed");
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
  const minicondaPath = getMinicondaPath();
  const envName = "nodetool";
  emitBootMessage("Configuring server environment...");
  const env = {
    ...process.env,
    PYTHONPATH: srcPath,
    PYTHONUNBUFFERED: "1",
    PATH: path.join(minicondaPath, "envs", envName, "bin") + path.delimiter + process.env.PATH
  };
  
  if (process.platform === "win32") {
    const pythonPath = path.join(minicondaPath, "envs", envName, "python.exe");
    log(`Using command: ${pythonPath} -m nodetool.cli serve --static-folder ${webPath}`);
    serverProcess = spawn(pythonPath, ["-m", "nodetool.cli", "serve", "--static-folder", webPath], {
      stdio: 'pipe',
      shell: false,
      env: env
    });
  } else {
    const pythonPath = path.join(minicondaPath, "envs", envName, "bin", "python");
    log(`Using command: ${pythonPath} -m nodetool.cli serve --static-folder ${webPath}`);
    serverProcess = spawn(pythonPath, ["-m", "nodetool.cli", "serve", "--static-folder", webPath], {
      stdio: 'pipe',
      shell: true,
      env: env
    });
  }

  // Add detailed error logging
  serverProcess.on("spawn", () => {
    log("Server process spawned successfully");
    emitBootMessage("Server process started...");
  });

  function handleServerOutput(data) {
    const output = data.toString().trim();
    if (output) { // Only log if there's actual output
      log(`Server output: ${output}`);
    }

    // Check for specific error conditions
    if (output.includes("Address already in use")) {
      log("Port is blocked, quitting application", "error");
      dialog.showErrorBox(
        "Server Error",
        "The server cannot start because the port is already in use. Please close any applications using the port and try again."
      );
      app.quit();
    }

    if (output.includes("ModuleNotFoundError")) {
      log("Python module not found error", "error");
      dialog.showErrorBox(
        "Server Error",
        "Failed to start server due to missing Python module. Please try reinstalling the application."
      );
    }

    if (output.includes("Application startup complete.")) {
      log("Server startup complete");
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
    log(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && !isAppQuitting) {
      forceQuit(`The server process terminated unexpectedly with code ${code}`);
    }
  });

  // Add this to check if process is running
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      log("Server process is still running after startup");
    } else {
      log("Server process failed to start or terminated early", "error");
    }
  }, 1000);
}

/**
 * Check if Ollama server is already running
 * @returns {Promise<boolean>}
 */
async function isOllamaRunning() {
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
  log(`Downloading file from ${url} to ${dest}`);
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
      log(`Download started. Total size: ${totalBytes} bytes`);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / totalBytes) * 100;
        const fileName = path.basename(dest).split(".")[0];
        emitUpdateProgress(fileName, progress, "Downloading");
      });

      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          log(`Download completed: ${dest}`);
          resolve();
        });
      });
    }

    function handleError(err) {
      unlink(dest, () => {
        log(`Error downloading file: ${err.message}`);
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
    log("Attempting to run NodeTool");
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
  log("Initiating graceful shutdown");

  try {
    if (serverProcess) {
      log("Stopping server process");
      serverProcess.kill();
    }
  } catch (error) {
    log(`Error stopping server process: ${error.message}`, "error");
  }

  log("Graceful shutdown complete");
}

let updateAvailable = false;

function setupAutoUpdater() {
  // Add this configuration block at the start of the function
  if (!app.isPackaged) {
    log('Skipping auto-updater in development mode');
    return;
  }

  // Set the feed URL for updates
  const platform = os.platform() === 'win32' ? 'win' : 'mac';
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'nodetool-ai',
    repo: 'nodetool',
    updaterCacheDirName: 'nodetool-updater'
  });

  // Configure logging
  autoUpdater.logger = require("electron-log");
  autoUpdater.logger.transports.file.level = "info";

  // Check for updates immediately and every 30 minutes
  autoUpdater.checkForUpdates();
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 30 * 60 * 1000);

  // Update events
  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log(`Update available: ${info.version}`);
    updateAvailable = true;
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', () => {
    log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', progress);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(`Update downloaded: ${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    log(`Update error: ${err.message}`, 'error');
  });
}

ipcMain.handle('install-update', () => {
  if (updateAvailable) {
    autoUpdater.quitAndInstall(false, true);
  }
});

app.on("ready", async () => {
  log("Electron app is ready");
  emitBootMessage("Starting NodeTool Desktop...");

  createWindow();
  setupAutoUpdater();

  const config = getConfig();
  emitBootMessage("Checking Python environment...");
  if (!config.condaPath || !(await isCondaInstalled())) {
    emitBootMessage("Installing Miniconda...");
    await installMiniconda();
  }

  emitBootMessage("Verifying Python environment...");
  if (!(await condaEnvironmentExists())) {
    emitBootMessage("Creating Python environment...");
    await createCondaEnvironment();
  } else {
    await checkEnvironmentUpdate();
  }

  emitBootMessage("Starting NodeTool server...");
  startServer();
});

app.on("window-all-closed", function () {
  log("All windows closed");
  if (process.platform !== "darwin") {
    log("Quitting app (not on macOS)");
    app.quit();
  }
});

app.on("activate", function () {
  log("App activated");
  if (mainWindow === null) {
    log("Creating new window on activate");
    createWindow();
  }
});

app.on("quit", () => {
  log("App is quitting");
  if (serverProcess) {
    log("Killing server process");
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
function log(message, level = "info") {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}\n`;
    console[level](logMessage);
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
 * Get the Miniconda installation path for the current platform
 * @returns {string}
 */
function getMinicondaPath() {
  const config = getConfig();
  if (config.condaPath) {
    return config.condaPath;
  }
  throw new Error("Conda path not found");
}

/**
 * Check if Conda is installed in the userData directory
 * @returns {Promise<boolean>}
 */
async function isCondaInstalled() {
  const config = getConfig();
  if (!config.condaPath) {
    return false;
  }

  const condaPath =
    process.platform === "win32"
      ? path.join(config.condaPath, "Scripts", "conda.exe")
      : path.join(config.condaPath, "bin", "conda");

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
 * Download and install Miniconda silently to userData directory
 * @returns {Promise<void>}
 */
async function installMiniconda() {
  // Show information dialog first
  await dialog.showMessageBox({
    type: "info",
    title: "Miniconda Installation",
    message: "Select Installation Directory for Miniconda",
    detail:
      "Miniconda will be installed in a folder at the location you select.\n\nPlease ensure you have at least 5GB of free space available. This installation is necessary to run the Python-based components of NodeTool and will contain all required dependencies.\n\nRecommended location: A drive with plenty of free space, outside of system folders.",
    buttons: ["Continue"],
  });

  // Prompt user for installation directory
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Miniconda Installation Directory",
    buttonLabel: "Select Folder",
  });

  if (result.canceled) {
    throw new Error("Miniconda installation cancelled by user");
  }

  const minicondaPath = path.join(result.filePaths[0], "miniconda3");
  
  log(`Selected Miniconda installation path: ${minicondaPath}`);

  // Save the selected path to config
  saveConfig({ condaPath: minicondaPath });

  const platform = process.platform;
  const arch = process.arch;
  let installerUrl = "";
  let installerPath = "";

  // Determine installer URL based on platform and architecture
  if (platform === "win32") {
    installerUrl = `https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-${
      arch === "x64" ? "x86_64" : "x86"
    }.exe`;
    installerPath = path.join(os.tmpdir(), "Miniconda3-latest-Windows.exe");
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    installerUrl = `https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-${archSuffix}.sh`;
    installerPath = path.join(os.tmpdir(), "Miniconda3-latest-MacOSX.sh");
  } else {
    throw new Error("Unsupported platform for Miniconda installation.");
  }

  log(`Downloading Miniconda from ${installerUrl}`);
  emitBootMessage("Downloading Miniconda...");

  // Download the installer
  await downloadFile(installerUrl, installerPath);
  log("Miniconda installer downloaded successfully");

  // Install Miniconda silently
  if (platform === "win32") {
    await new Promise((resolve, reject) => {
      const installProcess = spawn(
        installerPath,
        [
          "/S",
          "/InstallationType=JustMe",
          "/RegisterPython=0", // Don't register as system Python
          "/AddToPath=0", // Don't modify system PATH
          "/D=" + minicondaPath,
        ],
      );
      
      installProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          throw new Error(`Miniconda installation failed with code ${code}`);
        }
      });

      installProcess.on("error", reject);
    });
  } else {
    // Make the installer executable
    await chmod(installerPath, 0o755);

    await new Promise((resolve, reject) => {
      const installProcess = spawn("bash", [
        installerPath,
        "-b", // batch mode (no user interaction)
        "-p", // prefix
        minicondaPath,
      ]);

      installProcess.stdout.on("data", (data) => {
        log(data.toString());
      });

      installProcess.stderr.on("data", (data) => {
        log(data.toString(), "error");
      });

      installProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          throw new Error(`Miniconda installation failed with code ${code}`);
        }
      });

      installProcess.on("error", reject);
    });
  }

  log("Miniconda installed successfully");
}

/**
 * Check if Conda environment exists
 * @returns {Promise<boolean>}
 */
async function condaEnvironmentExists() {
  const condaPath =
    process.platform === "win32"
      ? path.join(getMinicondaPath(), "Scripts", "conda.exe")
      : path.join(getMinicondaPath(), "bin", "conda");

  const checkEnvProcess = spawn(condaPath, ["env", "list", "--json"]);
  
  log("Checking if conda environment exists...");

  return new Promise((resolve, reject) => {
    let output = "";

    checkEnvProcess.stdout.on("data", (data) => {
      output += data.toString();
      log(data.toString());
    });

    checkEnvProcess.on("close", (code) => {
      log(`Conda environment check completed with code ${code}`);
      if (code === 0) {
        try {
          const envList = JSON.parse(output);
          const envName = "nodetool";
          const minicondaPath = getMinicondaPath();
          const exists = envList.envs.some(
            (env) => env.startsWith(minicondaPath) && (env.endsWith(envName) || env === envName)
          );
          log(`Checking if conda environment '${envName}' exists: ${exists}`);
          resolve(exists);
        } catch (error) {
          log("Failed to parse conda environment list", "error");
          reject(new Error("Failed to parse conda environment list"));
        }
      } else {
        log("Failed to list conda environments", "error");
        reject(new Error("Failed to list conda environments"));
      }
    });

    checkEnvProcess.on("error", (error) => {
      log(`Error checking conda environment: ${error.message}`, "error");
      reject(error);
    });
  });
}

/**
 * Create Conda environment from the environment.yml file
 * @returns {Promise<void>}
 */
async function createCondaEnvironment() {
  const minicondaPath = getMinicondaPath();
  const condaPath = process.platform === "win32"
    ? path.join(minicondaPath, "Scripts", "conda.exe")
    : path.join(minicondaPath, "bin", "conda");

  log("Creating Conda environment...");
  emitBootMessage("Creating Python environment (this may take a few minutes)...");

  await new Promise((resolve, reject) => {
    const createEnvProcess = spawn(condaPath, [
      "env",
      "create",
      "--file",
      envFilePath,
      "--verbose"
    ]);

    let currentPackage = "";
    let downloadProgress = 0;

    createEnvProcess.stdout.on("data", (buffer) => {
      const msg = buffer.toString();
      log(msg);

      // Match different conda progress messages
      const downloadMatch = msg.match(/(\d+)%\s*\|\s*(\d+\/\d+)\s*\[([^\]]+)\]\s*(\S+)/);
      const packageMatch = msg.match(/Installing\s+([^\.]+)/);
      const preparingMatch = msg.match(/Preparing transaction:/);
      const verifyingMatch = msg.match(/Verifying transaction:/);
      const executingMatch = msg.match(/Executing transaction:/);

      if (downloadMatch) {
        const [, percentage, progress, speed, package] = downloadMatch;
        currentPackage = package;
        downloadProgress = parseInt(percentage);
        emitBootMessage(`Downloading ${currentPackage} (${percentage}%) - ${speed}`);
        emitUpdateProgress(currentPackage, downloadProgress, "Downloading");
      } 
      else if (packageMatch) {
        currentPackage = packageMatch[1].trim();
        emitBootMessage(`Installing ${currentPackage}...`);
        emitUpdateProgress(currentPackage, 0, "Installing");
      }
      else if (msg.includes("Collecting package metadata")) {
        emitBootMessage("Collecting package information...");
      } 
      else if (msg.includes("Solving environment")) {
        emitBootMessage("Resolving dependencies...");
      }
      else if (preparingMatch) {
        emitBootMessage("Preparing installation...");
      }
      else if (verifyingMatch) {
        emitBootMessage("Verifying packages...");
      }
      else if (executingMatch) {
        emitBootMessage("Installing packages...");
      }
      else if (msg.includes("Installing pip dependencies")) {
        emitBootMessage("Installing Python packages via pip...");
      }
    });

    createEnvProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      log(msg, "warn");
      
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
        reject(new Error(`Failed to create Conda environment (exit code: ${code})`));
      }
    });

    createEnvProcess.on("error", (err) => {
      log(`Error creating conda environment: ${err.message}`, "error");
      reject(err);
    });
  });

  saveConfig({ version: VERSION });
  
  log("Conda environment created successfully");
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...currentConfig, ...config }, null, 2));
}

// Add these constants near the top with other constants
const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

// Add new IPC handler to get log file path
ipcMain.handle("get-log-file-path", () => LOG_FILE);

// Add new IPC handler to open log file
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});

// Add this new function to check if environment needs update
async function checkEnvironmentUpdate() {
  const config = getConfig();
  if (config.version !== VERSION) {
    log(`Version mismatch: installed=${config.version}, current=${VERSION}`);
    emitBootMessage("Updating Python environment...");
    
    const minicondaPath = getMinicondaPath();
    const condaPath = process.platform === "win32"
      ? path.join(minicondaPath, "Scripts", "conda.exe")
      : path.join(minicondaPath, "bin", "conda");

    try {
      await new Promise((resolve, reject) => {
        const updateProcess = spawn(condaPath, [
          "env",
          "update",
          "--name",
          "nodetool",
          "--file",
          envFilePath,
          "--prune"
        ]);

        updateProcess.stdout.on("data", (data) => {
          const msg = data.toString();
          log(msg);
          emitBootMessage(`Updating: ${msg.trim()}`);
        });

        updateProcess.stderr.on("data", (data) => {
          log(data.toString(), "warn");
        });

        updateProcess.on("close", (code) => {
          if (code === 0) {
            saveConfig({ version: VERSION });
            resolve();
          } else {
            reject(new Error(`Environment update failed with code ${code}`));
          }
        });

        updateProcess.on("error", reject);
      });
      
      log("Environment updated successfully");
      emitBootMessage("Python environment updated successfully");
    } catch (error) {
      log(`Failed to update environment: ${error.message}`, "error");
      throw error;
    }
  }
}

/**
 * Force quit the application
 * @param {string} errorMessage - Error message to show before quitting
 */
function forceQuit(errorMessage) {
  log(`Force quitting application: ${errorMessage}`, "error");
  dialog.showErrorBox("Critical Error", errorMessage);
  
  // Force kill any remaining processes
  if (serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch (e) {
      log(`Error killing server process: ${e.message}`, "error");
    }
  }

  // Force exit the app
  process.exit(1);
}

// Add global error handlers
process.on('uncaughtException', (error) => {
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  forceQuit(`Unhandled Promise Rejection: ${error.message}`);
});
