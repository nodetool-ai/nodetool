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
 *    - Manages the Ollama server process
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
 * - Ollama Process: AI model server
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
const { createReadStream, createWriteStream } = require("fs");
const { access, mkdir, readFile, rename, writeFile, unlink, chmod } =
  require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const { appendFile } = require("fs").promises;

/** @type {string} */
const VERSION = "0.5.0rc13";
/** @type {BrowserWindow|null} */
let mainWindow;
/** @type {import('child_process').ChildProcess|null} */
let serverProcess;
/** @type {import('child_process').ChildProcess|null} */
let ollamaProcess;
/** @type {string} */
const webDir = path.join(path.dirname(process.resourcesPath), "web");

/** @type {string} */
const resourcesPath = process.resourcesPath;
/** @type {NodeJS.ProcessEnv} */
let env = {
  PYTHONUNBUFFERED: "1",
  PYTHONNOUSERSITE: "1",
  PATH: process.env.PATH,
};

console.log("resourcesPath", resourcesPath);

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
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, requestingOrigin, details) => {
      return true;
    }
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      return true;
    }
  );
}

/**
 * Run the NodeTool server with improved error handling
 * @param {NodeJS.ProcessEnv} env - The environment variables for the server process
 */
function runNodeTool(env) {
  const minicondaPath = getMinicondaPath();
  const envName = "nodetool";

  // Construct the command based on platform
  const command =
    process.platform === "win32"
      ? `"${path.join(
          minicondaPath,
          "Scripts",
          "activate.bat"
        )}" ${envName} && python -m nodetool.cli serve --static-folder "${webDir}"`
      : `source "${path.join(
          minicondaPath,
          "bin",
          "activate"
        )}" ${envName} && python -m nodetool.cli serve --static-folder "${webDir}"`;

  log(`Running NodeTool command: ${command}`);

  serverProcess = spawn(command, {
    shell: true,
    env: {
      ...env,
      CONDA_ROOT: minicondaPath,
      PATH: `${path.join(minicondaPath, "condabin")}${path.delimiter}${
        env.PATH
      }`,
    },
  });

  // Start Ollama server
  startOllamaServer();

  function handleServerOutput(data) {
    const output = data.toString().trim();
    log(output);

    // Check for port blocked error
    if (output.includes("Address already in use")) {
      log("Port is blocked, quitting application", "error");
      dialog.showErrorBox(
        "Server Error",
        "The server cannot start because the port is already in use. Please close any applications using the port and try again."
      );
      app.quit();
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
    log(`Server process error: ${error.message}`, "error");
    dialog.showErrorBox(
      "Server Error",
      `An error occurred with the server process: ${error.message}`
    );
  });

  serverProcess.on("exit", (code, signal) => {
    log(`Server process exited with code ${code} and signal ${signal}`);
  });
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
    return false;
  }
}

/**
 * Start the Ollama server
 */
async function startOllamaServer() {
  log(`Checking Ollama server status`);

  if (await isOllamaRunning()) {
    log("Ollama server is already running");
    return;
  }

  log(`Starting Ollama server`);
  ollamaProcess = spawn("ollama", ["serve"], { env: process.env });

  ollamaProcess.stdout.on("data", (data) => {
    const output = data.toString().trim();
    log(output);
  });

  ollamaProcess.stderr.on("data", (data) => {
    const output = data.toString().trim();
    log(output);
  });

  ollamaProcess.on("error", (error) => {
    log(`Ollama process error: ${error.message}`, "error");
  });

  ollamaProcess.on("exit", (code, signal) => {
    log(`Ollama process exited with code ${code} and signal ${signal}`);
  });
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
    runNodeTool(env);
  } catch (error) {
    log(`Critical error starting server: ${error.message}`, "error");
    dialog.showErrorBox("Critical Error", error.message);
    app.exit(1);
  }
}

let isAppQuitting = false;

app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    event.preventDefault();
    gracefulShutdown().then(() => {
      isAppQuitting = true;
      app.quit();
    });
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
      await new Promise((resolve) => serverProcess.on("exit", resolve));
    }
  } catch (error) {
    log(`Error stopping server process: ${error.message}`, "error");
  }

  try {
    if (ollamaProcess) {
      log("Stopping Ollama process");
      ollamaProcess.kill();
      await new Promise((resolve) => ollamaProcess.on("exit", resolve));
    }
  } catch (error) {
    log(`Error stopping Ollama process: ${error.message}`, "error");
  }

  log("Graceful shutdown complete");
}

app.on("ready", async () => {
  log("Electron app is ready");

  createWindow();

  // Check if conda is installed and properly configured
  const config = getConfig();
  if (!config.condaPath || !(await isCondaInstalled())) {
    emitBootMessage("Installing Miniconda...");
    await installMiniconda();
  }

  if (!(await condaEnvironmentExists())) {
    emitBootMessage("Creating Conda environment...");
    await createCondaEnvironment();
  }

  await checkAndUpdateNodeTool();

  emitBootMessage("Starting Nodetool...");
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
  if (ollamaProcess) {
    log("Killing Ollama process");
    ollamaProcess.kill();
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
function emitUpdateStep(step, isComplete = false) {
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send("update-step", step, isComplete);
    } catch (error) {
      console.error("Error emitting update step:", error);
    }
  }
}

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
  return path.join(app.getPath("userData"), "miniconda3");
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
      "Miniconda will be installed in a folder at the location you select.\n\nPlease ensure you have at least 3GB of free space available. This installation is necessary to run the Python-based components of NodeTool and will contain all required dependencies.\n\nRecommended location: A drive with plenty of free space, outside of system folders.",
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
          "/D=" + minicondaPath,
          "/RegisterPython=0", // Don't register as system Python
          "/AddToPath=0", // Don't modify system PATH
        ],
        {
          shell: true,
        }
      );

      installProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Miniconda installation failed with code ${code}`));
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
          reject(new Error(`Miniconda installation failed with code ${code}`));
        }
      });

      installProcess.on("error", reject);
    });
  }

  // Update environment variables
  const condaBinPath =
    platform === "win32"
      ? path.join(minicondaPath, "Scripts")
      : path.join(minicondaPath, "bin");

  env.PATH = `${condaBinPath}${path.delimiter}${env.PATH}`;

  // Initialize conda for the shell
  await new Promise((resolve, reject) => {
    const initProcess = spawn(
      path.join(condaBinPath, platform === "win32" ? "conda.exe" : "conda"),
      ["init"]
    );

    initProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Failed to initialize conda"));
      }
    });

    initProcess.on("error", reject);
  });

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

  return new Promise((resolve, reject) => {
    let output = "";

    checkEnvProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    checkEnvProcess.on("close", (code) => {
      if (code === 0) {
        try {
          const envList = JSON.parse(output);
          const envName = "nodetool";
          const exists = envList.envs.some(
            (env) => env.endsWith(envName) || env === envName
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
  const envFilePath = path.join(resourcesPath, "environment.yaml");
  const minicondaPath = getMinicondaPath();
  const condaPath =
    process.platform === "win32"
      ? path.join(minicondaPath, "Scripts", "conda.exe")
      : path.join(minicondaPath, "bin", "conda");

  // Create the Conda environment
  log("Creating Conda environment...");
  emitBootMessage("Creating Conda environment...");

  await new Promise((resolve, reject) => {
    const createEnvProcess = spawn(condaPath, [
      "env",
      "create",
      "--file",
      envFilePath,
      "--json",
    ]);

    createEnvProcess.stdout.on("data", (buffer) => {
      const data = buffer.toString();
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.progress) {
          emitUpdateProgress(
            jsonData.progress.name,
            jsonData.progress.percentage,
            "Installing"
          );
        }
        log(JSON.stringify(jsonData));
      } catch (error) {
        log("Failed to parse conda environment create output", "error");
      }
    });

    createEnvProcess.stderr.on("data", (data) => {
      log(data.toString(), "error");
    });

    createEnvProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Failed to create Conda environment"));
      }
    });

    createEnvProcess.on("error", reject);
  });

  log(`Conda environment created successfully`);
}

// Add these constants
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");

// Add this function to handle config operations
function getConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return config;
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Check and update nodetool package version
 * @returns {Promise<void>}
 */
async function checkAndUpdateNodeTool() {
  const minicondaPath = getMinicondaPath();
  const envName = "nodetool";
  const pipPath =
    process.platform === "win32"
      ? path.join(minicondaPath, "envs", envName, "Scripts", "pip.exe")
      : path.join(minicondaPath, "envs", envName, "bin", "pip");

  // Get current installed version
  const getCurrentVersion = spawn(pipPath, ["show", "nodetool"]);
  let currentVersion = null;

  await new Promise((resolve) => {
    getCurrentVersion.stdout.on("data", (data) => {
      const versionMatch = data.toString().match(/Version:\s*([^\s]+)/);
      if (versionMatch) {
        currentVersion = versionMatch[1];
      }
    });

    getCurrentVersion.on("close", resolve);
  });

  if (!currentVersion || currentVersion < VERSION) {
    log(`Updating nodetool from ${currentVersion || "none"} to ${VERSION}`);
    emitBootMessage(`Updating nodetool to version ${VERSION}...`);

    await new Promise((resolve, reject) => {
      const updateProcess = spawn(pipPath, [
        "install",
        "--upgrade",
        `nodetool==${VERSION}`,
      ]);

      updateProcess.stdout.on("data", (data) => log(data.toString()));
      updateProcess.stderr.on("data", (data) => log(data.toString(), "error"));

      updateProcess.on("close", (code) => {
        if (code === 0) {
          log("nodetool package updated successfully");
          resolve();
        } else {
          reject(new Error("Failed to update nodetool package"));
        }
      });

      updateProcess.on("error", reject);
    });
  }
}

// Add these constants near the top with other constants
const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

// Add new IPC handler to get log file path
ipcMain.handle("get-log-file-path", () => LOG_FILE);

// Add new IPC handler to open log file
ipcMain.handle("open-log-file", () => {
  shell.showItemInFolder(LOG_FILE);
});
