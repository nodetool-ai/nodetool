/**
 * This file is the entry point for the Electron app.
 * It is responsible for creating the main window and starting the server.
 * NodeTool is a no-code AI development platform that allows users to create and run complex AI workflows.
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");

/**
 * Log a message with a timestamp
 * @param {string} message - The message to log
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/** @type {BrowserWindow|null} */
let mainWindow;
/** @type {import('child_process').ChildProcess|null} */
let serverProcess;
/** @type {import('child_process').ChildProcess|null} */
let ollamaProcess;
/** @type {string} */
let pythonExecutable;
/** @type {string|null} */
let sitePackagesDir;
/** @type {string} */
let webDir;
/** @type {string} */
const resourcesPath = process.resourcesPath;
/** @type {NodeJS.ProcessEnv} */
let env = { ...process.env, PYTHONUNBUFFERED: "1" };

/** @type {{ isStarted: boolean, bootMsg: string, logs: string[] }} */
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  logs: [],
};

/** @type {string[]} */
const windowsPipArgs = [
  "install",
  "-r",
  path.join(resourcesPath, "requirements.txt"),
  "--extra-index-url",
  "https://download.pytorch.org/whl/cu121",
];

/** @type {string[]} */
const macPipArgs = [
  "install",
  "-r",
  path.join(resourcesPath, "requirements.txt"),
];

/**
 * Install Python requirements
 * @returns {Promise<void>}
 */
async function installRequirements() {
  log(`Installing requirements. Platform: ${process.platform}`);
  const pipArgs = process.platform === "darwin" ? macPipArgs : windowsPipArgs;
  log(`Using pip arguments: ${pipArgs.join(" ")}`);

  // Use pythonExecutable instead of relying on system PATH
  const pipProcess = spawn(pythonExecutable, ["-m", "pip", ...pipArgs], {
    env,
  });

  emitBootMessage("Installing requirements");

  pipProcess.stdout.on("data", (/** @type {Buffer} */ data) => {
    console.log(data.toString());
    emitServerLog(data.toString());
  });

  pipProcess.stderr.on("data", (/** @type {Buffer} */ data) => {
    console.log(data.toString());
    emitServerLog(data.toString());
  });

  return new Promise((resolve, reject) => {
    pipProcess.on("close", (/** @type {number|null} */ code) => {
      if (code === 0) {
        log("pip install completed successfully");
        resolve();
      } else {
        log(`pip install process exited with code ${code}`);
        reject(new Error(`pip install process exited with code ${code}`));
      }
    });
  });
}

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
    },
  });
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
}

/**
 * Run the NodeTool server
 * @param {NodeJS.ProcessEnv} env - The environment variables for the server process
 */
function runNodeTool(env) {
  log(
    `Running NodeTool. Python executable: ${pythonExecutable}, Web dir: ${webDir}`
  );
  serverProcess = spawn(
    pythonExecutable,
    ["-m", "nodetool.cli", "serve", "--static-folder", webDir],
    { env: env }
  );

  /**
   * Handle server output
   * @param {Buffer} data - The output data from the server
   */
  function handleServerOutput(data) {
    const output = data.toString().trim();
    log(`Server output: ${output}`);
    if (output.includes("Application startup complete.")) {
      log("Server startup complete");
      emitServerStarted();
    }
    emitServerLog(output);
  }

  serverProcess.stdout.on("data", handleServerOutput);
  serverProcess.stderr.on("data", handleServerOutput);
}

/**
 * Check if a file exists
 * @param {string} path - The path to check
 * @returns {Promise<boolean>}
 */
async function checkFileExists(path) {
  try {
    await fs.access(path);
    log(`File exists: ${path}`);
    return true;
  } catch {
    log(`File does not exist: ${path}`);
    return false;
  }
}

/**
 * Start the NodeTool server
 */
async function startServer() {
  log("Starting server");
  let pythonEnvExecutable, pipEnvExecutable;

  // Set up paths for Python and pip executables based on the platform
  if (process.platform === "darwin") {
    pythonEnvExecutable = path.join(
      resourcesPath,
      "python_env",
      "bin",
      "python"
    );
    pipEnvExecutable = path.join(resourcesPath, "python_env", "bin", "pip");
  } else {
    pythonEnvExecutable = path.join(resourcesPath, "python_env", "python.exe");
    pipEnvExecutable = path.join(
      resourcesPath,
      "python_env",
      "Scripts",
      "pip.exe"
    );
  }

  log(`Checking for Python environment. Path: ${pythonEnvExecutable}`);
  const pythonEnvExists = await checkFileExists(pythonEnvExecutable);

  pythonExecutable = pythonEnvExists ? pythonEnvExecutable : "python";
  log(`Using Python executable: ${pythonExecutable}`);

  sitePackagesDir = pythonEnvExists
    ? process.platform === "darwin"
      ? path.join(
          resourcesPath,
          "python_env",
          "lib",
          "python3.11",
          "site-packages"
        )
      : path.join(resourcesPath, "python_env", "Lib", "site-packages")
    : null;

  log(`Site-packages directory: ${sitePackagesDir}`);

  if (sitePackagesDir) {
    const fastApiPath = path.join(sitePackagesDir, "fastapi");
    log(`Checking for FastAPI installation at: ${fastApiPath}`);
    if (await checkFileExists(fastApiPath)) {
      log("FastAPI is installed");
    } else {
      log("FastAPI is not installed, running installRequirements");
      await installRequirements();
    }
  }

  emitBootMessage("Initializing NodeTool");
  if (pythonEnvExists) {
    log("Using conda env");
    env.PYTHONPATH = path.join(resourcesPath, "src");
    log(`Set PYTHONPATH to: ${env.PYTHONPATH}`);

    if (process.platform === "darwin") {
      env.PATH = `${resourcesPath}:${env.PATH}`;
    } else {
      env.PATH = `${resourcesPath};${env.PATH}`;
    }
    log(`Updated PATH: ${env.PATH}`);
    webDir = path.join(resourcesPath, "web");
  } else {
    log("Running from source");
    env.PYTHONPATH = path.join("..", "src");
    log(`Set PYTHONPATH to: ${env.PYTHONPATH}`);
    webDir = path.join("..", "web", "dist");
  }
  log(`Web directory set to: ${webDir}`);

  try {
    log("Attempting to run NodeTool");
    runNodeTool(env);
  } catch (error) {
    log(`Error starting server or Ollama: ${error.message}`);
    console.error("Error starting server or Ollama", error);
  }
  try {
    await startOllama();
  } catch (error) {
    log(`Error starting Ollama: ${error.message}`);
    console.error("Error starting Ollama", error);
  }
}

/**
 * Start the Ollama binary
 */
async function startOllama() {
  log("Starting Ollama");
  const ollamaPath =
    process.platform === "win32"
      ? path.join(resourcesPath, "ollama", "ollama.exe")
      : path.join(resourcesPath, "ollama", "ollama");

  log(`Ollama path: ${ollamaPath}`);

  if (!(await checkFileExists(ollamaPath))) {
    log("Ollama executable not found");
    return;
  }

  ollamaProcess = spawn(ollamaPath, ["serve"]);

  function handleOllamaOutput(data) {
    const output = data.toString().trim();
    log(`Ollama output: ${output}`);
    emitServerLog(output);
  }

  ollamaProcess.stdout.on("data", handleOllamaOutput);
  ollamaProcess.stderr.on("data", handleOllamaOutput);

  ollamaProcess.on("close", (code) => {
    log(`Ollama process exited with code ${code}`);
  });
}

app.on("ready", () => {
  log("Electron app is ready");
  createWindow();
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

function emitBootMessage(message) {
  serverState.bootMsg = message;
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("boot-message", message);
  }
}

function emitServerStarted() {
  serverState.isStarted = true;
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("server-started");
  }
}

function emitServerLog(message) {
  serverState.logs.push(message);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("server-log", message);
  }
}
