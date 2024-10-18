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
const crypto = require("crypto");
const tar = require("tar");

// For making HTTP requests (GitHub API)
const fetch = require("node-fetch");

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
  "nodetool==0.5.0-preview.2",
  "--extra-index-url",
  "https://download.pytorch.org/whl/cu121",
];

/** @type {string[]} */
const macPipArgs = ["install", "nodetool==0.5.0-preview.2"];

/**
 * Install Python requirements
 * @returns {Promise<void>}
 */
async function installRequirements() {
  log(`Installing requirements. Platform: ${process.platform}`);
  const pipArgs = process.platform === "darwin" ? macPipArgs : windowsPipArgs;
  log(`Using pip arguments: ${pipArgs.join(" ")}`);

  // Check if nodetool 0.5.0-preview.1 is already installed
  const isNodeToolInstalled = await checkNodeToolInstalled();
  if (isNodeToolInstalled) {
    log(
      "nodetool 0.5.0-preview.1 is already installed. Skipping installation."
    );
    return;
  }

  // Use pythonExecutable instead of relying on system PATH
  const pipProcess = spawn(pythonExecutable, ["-m", "pip", ...pipArgs], {
    env,
  });

  emitBootMessage("Installing Python packages");
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
 * Ensure dependencies are available
 * @returns {Promise<void>}
 */
async function ensureDependencies() {
  // No need to check for Ollama and FFmpeg
  log("Skipping dependency check for Ollama and FFmpeg");
}

/**
 * Start the NodeTool server with improved error handling
 */
async function startServer() {
  try {
    log("Starting server");

    // Ensure dependencies are available
    let pythonEnvExecutable, pipEnvExecutable;
    const componentsDir = path.join(app.getPath("userData"), "components");

    // Set up paths for Python and pip executables based on the platform
    if (process.platform === "darwin") {
      pythonEnvExecutable = path.join(
        componentsDir,
        "python_env",
        "bin",
        "python"
      );
      pipEnvExecutable = path.join(componentsDir, "python_env", "bin", "pip");
    } else {
      pythonEnvExecutable = path.join(
        componentsDir,
        "python_env",
        "python.exe"
      );
      pipEnvExecutable = path.join(
        componentsDir,
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
            componentsDir,
            "python_env",
            "lib",
            "python3.11",
            "site-packages"
          )
        : path.join(componentsDir, "python_env", "Lib", "site-packages")
      : null;

    log(`Site-packages directory: ${sitePackagesDir}`);

    if (pythonEnvExists) {
      env.PATH = `${path.join(componentsDir, "ollama")}:${env.PATH}`;
      log(`Updated PATH: ${env.PATH}`);

      webDir = path.join(componentsDir, "web");
      log(`Web directory: ${webDir}`);
    } else {
      throw new Error("Python environment is not available");
    }

    log("Attempting to run NodeTool");
    runNodeTool(env);
  } catch (error) {
    log(`Critical error starting server: ${error.message}`);
    dialog.showErrorBox(
      "Critical Error",
      `Failed to start the server: ${error.message}`
    );
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

  if (serverProcess) {
    log("Stopping server process");
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.on("exit", resolve));
  }

  // Remove Ollama process shutdown
  // if (ollamaProcess) {
  //   log("Stopping Ollama process");
  //   ollamaProcess.kill();
  //   await new Promise((resolve) => ollamaProcess.on("exit", resolve));
  // }

  log("Graceful shutdown complete");
}

app.on("ready", async () => {
  log("Electron app is ready");
  createWindow();
  emitBootMessage("Checking for updates...");
  await checkForUpdates();
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
  // Remove Ollama process kill
  // if (ollamaProcess) {
  //   log("Killing Ollama process");
  //   ollamaProcess.kill();
  // }
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

/**
 * Check for updates and download necessary packages
 * @returns {Promise<void>}
 */
async function checkForUpdates() {
  try {
    log("Checking for updates");

    const owner = "nodetool-ai";
    const repo = "nodetool";

    const latestRelease = await fetchLatestRelease(owner, repo);
    const assets = latestRelease.assets;

    const componentsDir = path.join(app.getPath("userData"), "components");
    await fs.mkdir(componentsDir, { recursive: true });

    const system = process.platform === "win32" ? "win" : "mac";
    const arch = process.arch === "x64" ? "x64" : "arm64";

    const componentsToUpdate = await getComponentsToUpdate(
      assets,
      system,
      arch,
      componentsDir
    );

    if (componentsToUpdate.length > 0) {
      log(
        `Components to update: ${componentsToUpdate
          .map((c) => c.name)
          .join(", ")}`
      );

      for (const component of componentsToUpdate) {
        await downloadAndExtractComponent(component, componentsDir);
      }
    } else {
      log("All components are up to date");
    }
  } catch (error) {
    log(`Error checking for updates: ${error.message}`, "error");
  }
}

/**
 * Get components that need to be updated
 * @param {Array<{name: string, browser_download_url: string}>} assets
 * @param {string} system
 * @param {string} arch
 * @param {string} componentsDir
 * @returns {Promise<Array<{name: string, url: string, checksumUrl: string}>>}
 */
async function getComponentsToUpdate(assets, system, arch, componentsDir) {
  const componentsToUpdate = [];
  const componentNames = ["python_env", "web", "ollama", "ffmpeg"];

  for (const name of componentNames) {
    const assetName = `${name}-${system}-${arch}.tar`;
    const checksumName = `${assetName}.sha256`;

    const asset = assets.find((a) => a.name === assetName);
    const checksumAsset = assets.find((a) => a.name === checksumName);

    if (asset && checksumAsset) {
      const remoteChecksum = await downloadFileToString(
        checksumAsset.browser_download_url
      );
      const localChecksum = await getLocalChecksum(componentsDir, name);

      if (remoteChecksum.trim() !== localChecksum) {
        componentsToUpdate.push({
          name,
          url: asset.browser_download_url,
          checksumUrl: checksumAsset.browser_download_url,
        });
      }
    }
  }

  return componentsToUpdate;
}

/**
 * Get the local checksum for a component
 * @param {string} componentsDir
 * @param {string} componentName
 * @returns {Promise<string>}
 */
async function getLocalChecksum(componentsDir, componentName) {
  const checksumPath = path.join(componentsDir, `${componentName}.sha256`);
  try {
    return await fs.readFile(checksumPath, "utf-8");
  } catch (error) {
    return "";
  }
}

/**
 * Download and extract a component package
 * @param {{name: string, url: string, checksumUrl: string}} component
 * @param {string} componentsDir
 * @returns {Promise<void>}
 */
async function downloadAndExtractComponent(component, componentsDir) {
  const tempFile = path.join(componentsDir, `${component.name}.tmp`);
  const finalFile = path.join(componentsDir, `${component.name}.tar`);
  const checksumFile = path.join(componentsDir, `${component.name}.sha256`);

  log(`Downloading ${component.name} from ${component.url}`);

  await downloadFile(component.url, tempFile);
  const checksum = await downloadFileToString(component.checksumUrl);

  // Verify checksum
  const fileChecksum = await computeFileHash(tempFile);
  if (fileChecksum !== checksum.trim()) {
    throw new Error(
      `Checksum mismatch for ${
        component.name
      }. Expected ${checksum.trim()}, got ${fileChecksum}`
    );
  }

  // Rename temp file to final file
  await fs.rename(tempFile, finalFile);

  // Save checksum
  await fs.writeFile(checksumFile, checksum);

  // Extract the component
  await extractTar(finalFile, componentsDir);

  log(`${component.name} updated successfully`);
}

/**
 * Compute SHA256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>}
 */
async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = require("fs").createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Extract a tar archive
 * @param {string} archivePath - Path to the tar file
 * @param {string} extractTo - Directory to extract to
 * @returns {Promise<void>}
 */
async function extractTar(archivePath, extractTo) {
  return tar.x({
    file: archivePath,
    cwd: extractTo,
  });
}

/**
 * Fetch the latest release from GitHub
 * @param {string} owner - GitHub repository owner
 * @param {string} repo - GitHub repository name
 * @returns {Promise<any>}
 */
async function fetchLatestRelease(owner, repo) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release: ${response.statusText}`);
  }

  const releaseData = await response.json();
  return releaseData;
}

async function checkNodeToolInstalled() {
  return new Promise((resolve) => {
    const checkProcess = spawn(
      pythonExecutable,
      [
        "-c",
        "import pkg_resources; print(pkg_resources.get_distribution('nodetool').version)",
      ],
      { env }
    );

    let output = "";

    checkProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    checkProcess.on("close", (code) => {
      if (code === 0 && output.trim() === "0.5.0-preview.1") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}
