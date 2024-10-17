/**
 * This file is the entry point for the Electron app.
 * It is responsible for creating the main window and starting the server.
 * NodeTool is a no-code AI development platform that allows users to create and run complex AI workflows.
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const { createWriteStream } = require("fs");
const { pipeline } = require("stream").promises;
const { createGunzip } = require("zlib");
const extract = require("extract-zip");

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
  log(
    `Starting pip install with command: ${pythonExecutable} -m pip ${pipArgs.join(
      " "
    )}`
  );

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
 * Run the NodeTool server with improved error handling
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

  serverProcess.on("error", (error) => {
    log(`Server process error: ${error.message}`);
    dialog.showErrorBox(
      "Server Error",
      `An error occurred with the server process: ${error.message}`
    );
  });

  serverProcess.on("exit", (code, signal) => {
    log(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        "Server Crashed",
        `The server process has unexpectedly exited. The application will now restart.`
      );
      app.relaunch();
      app.exit(0);
    }
  });
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
 * Download a file from a URL
 * @param {string} url - The URL to download from
 * @param {string} dest - The destination path
 * @returns {Promise<void>}
 */
async function downloadFile(url, dest) {
  log(`Downloading file from ${url} to ${dest}`);
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (response) => {
        log(`Download started. Status code: ${response.statusCode}`);
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            log(`Download completed: ${dest}`);
            resolve();
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {
          log(`Error downloading file: ${err.message}`);
          reject(err);
        });
      });
  });
}

/**
 * Download and extract Ollama
 * @returns {Promise<void>}
 */
async function downloadOllama() {
  const ollamaDir = path.join(app.getPath("userData"), "ollama");
  await fs.mkdir(ollamaDir, { recursive: true });

  let url, destPath;
  if (process.platform === "win32") {
    url =
      "https://github.com/ollama/ollama/releases/download/v0.3.9/ollama-windows-amd64.zip";
    destPath = path.join(ollamaDir, "ollama.zip");
  } else if (process.platform === "darwin") {
    url =
      "https://github.com/ollama/ollama/releases/download/v0.3.9/ollama-darwin";
    destPath = path.join(ollamaDir, "ollama");
  } else {
    throw new Error("Unsupported platform");
  }

  await downloadFile(url, destPath);

  if (process.platform === "win32") {
    await extract(destPath, { dir: ollamaDir });
    await fs.unlink(destPath);
  } else {
    await fs.chmod(destPath, 0o755);
  }
}

/**
 * Download FFmpeg
 * @returns {Promise<void>}
 */
async function downloadFFmpeg() {
  const ffmpegDir = path.join(app.getPath("userData"), "ffmpeg");
  await fs.mkdir(ffmpegDir, { recursive: true });

  let ffmpegUrl, ffprobeUrl, ffmpegDest, ffprobeDest;
  if (process.platform === "win32") {
    ffmpegUrl =
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
    ffmpegDest = path.join(ffmpegDir, "ffmpeg.zip");
  } else if (process.platform === "darwin") {
    ffmpegUrl = "https://evermeet.cx/ffmpeg/ffmpeg-7.0.2.zip";
    ffprobeUrl = "https://evermeet.cx/ffmpeg/ffprobe-7.0.2.zip";
    ffmpegDest = path.join(ffmpegDir, "ffmpeg.zip");
    ffprobeDest = path.join(ffmpegDir, "ffprobe.zip");
  } else {
    throw new Error("Unsupported platform");
  }

  await downloadFile(ffmpegUrl, ffmpegDest);
  if (process.platform === "darwin") {
    await downloadFile(ffprobeUrl, ffprobeDest);
  }

  await extract(ffmpegDest, { dir: ffmpegDir });
  if (process.platform === "darwin") {
    await extract(ffprobeDest, { dir: ffmpegDir });
  }

  await fs.unlink(ffmpegDest);
  if (process.platform === "darwin") {
    await fs.unlink(ffprobeDest);
  }
}

/**
 * Ensure Ollama and FFmpeg are available
 * @returns {Promise<void>}
 */
async function ensureDependencies() {
  const ollamaDir = path.join(app.getPath("userData"), "ollama");
  const ffmpegDir = path.join(app.getPath("userData"), "ffmpeg");

  if (!(await checkFileExists(ollamaDir))) {
    emitBootMessage("Downloading Ollama...");
    await downloadOllama();
  }

  if (!(await checkFileExists(ffmpegDir))) {
    emitBootMessage("Downloading FFmpeg...");
    await downloadFFmpeg();
  }
}

/**
 * Start the NodeTool server with improved error handling
 */
async function startServer() {
  try {
    log("Starting server");

    // Ensure Ollama and FFmpeg are available
    await ensureDependencies();

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
      pythonEnvExecutable = path.join(
        resourcesPath,
        "python_env",
        "python.exe"
      );
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

    log("Attempting to run NodeTool");
    runNodeTool(env);
    try {
      await startOllama();
    } catch (error) {
      log(`Error starting Ollama: ${error.message}`);
      console.error("Error starting Ollama", error);
    }
  } catch (error) {
    log(`Critical error starting server: ${error.message}`);
    dialog.showErrorBox(
      "Critical Error",
      `Failed to start the server: ${error.message}`
    );
    app.exit(1);
  }
}

/**
 * Start the Ollama binary
 */
async function startOllama() {
  log("Starting Ollama process");
  const ollamaDir = path.join(app.getPath("userData"), "ollama");
  const ollamaPath =
    process.platform === "win32"
      ? path.join(ollamaDir, "ollama.exe")
      : path.join(ollamaDir, "ollama");

  log(`Ollama executable path: ${ollamaPath}`);

  if (!(await checkFileExists(ollamaPath))) {
    log("Ollama executable not found", "error");
    emitServerLog("Ollama executable not found. Skipping Ollama start.");
    return;
  }

  log(`Spawning Ollama process: ${ollamaPath} serve`);
  ollamaProcess = spawn(ollamaPath, ["serve"]);

  log(`Ollama process spawned with PID: ${ollamaProcess.pid}`);

  function handleOllamaOutput(data) {
    const output = data.toString().trim();
    log(`Ollama output: ${output}`);
    emitServerLog(`[Ollama] ${output}`);
  }

  ollamaProcess.stdout.on("data", (data) => {
    handleOllamaOutput(data);
    log("Received data on Ollama stdout");
  });

  ollamaProcess.stderr.on("data", (data) => {
    handleOllamaOutput(data);
    log("Received data on Ollama stderr", "warn");
  });

  ollamaProcess.on("error", (error) => {
    log(`Ollama process error: ${error.message}`, "error");
    emitServerLog(`[Ollama Error] ${error.message}`);
  });

  ollamaProcess.on("close", (code) => {
    log(
      `Ollama process exited with code ${code}`,
      code === 0 ? "info" : "warn"
    );
    emitServerLog(`[Ollama] Process exited with code ${code}`);
  });

  // Wait for a short time to check if the process is still running
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (ollamaProcess.exitCode === null) {
    log("Ollama process started successfully");
    emitServerLog("[Ollama] Process started successfully");
  } else {
    log(
      `Ollama process failed to start (exit code: ${ollamaProcess.exitCode})`,
      "error"
    );
    emitServerLog(
      `[Ollama] Failed to start (exit code: ${ollamaProcess.exitCode})`
    );
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

  if (serverProcess) {
    log("Stopping server process");
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.on("exit", resolve));
  }

  if (ollamaProcess) {
    log("Stopping Ollama process");
    ollamaProcess.kill();
    await new Promise((resolve) => ollamaProcess.on("exit", resolve));
  }

  log("Graceful shutdown complete");
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
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console[level](logMessage);
    emitServerLog(logMessage);

    // Optionally, you could write logs to a file here
  } catch (error) {
    console.error(`Error in log function: ${error.message}`);
  }
}
