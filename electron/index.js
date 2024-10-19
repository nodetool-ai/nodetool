/**
 * This file is the entry point for the Electron app.
 * It is responsible for creating the main window and starting the server.
 * NodeTool is a no-code AI development platform that allows users to create and run complex AI workflows.
 *
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 */

/**
 * NodeTool Installation and Update Process
 *
 * This file manages the installation, updating, and running of the NodeTool application.
 * It handles dependency management, component updates, and server initialization.
 *
 * Installation and Update Procedure:
 *
 * 1. Application Startup:
 *    - The Electron app initializes and creates the main window.
 *    - It then calls `checkForUpdates()` to ensure all components are up-to-date.
 *
 * 2. Update Check (checkForUpdates function):
 *    - Fetches the latest release information from GitHub.
 *    - Determines which components need updating based on local and remote checksums.
 *    - Components checked: python_env, web, ollama, ffmpeg.
 *    - For each component that needs updating:
 *      a. Downloads the component package (.zip file) and its checksum.
 *      b. Verifies the downloaded package's integrity using SHA256 checksum.
 *      c. Extracts the package to the components directory.
 *
 * 3. Server Initialization (startServer function):
 *    - Sets up paths for Python and pip executables.
 *    - Checks if a local Python environment exists.
 *    - If it exists, uses the local environment; otherwise, uses system Python.
 *    - Updates PATH to include Ollama directory.
 *    - Calls `runNodeTool()` to start the server.
 *
 * 4. NodeTool Installation (installRequirements function):
 *    - Checks if the correct version of NodeTool is already installed.
 *    - If not installed or outdated, uses pip to install the specified version.
 *    - Installation command varies based on the platform (Windows or macOS).
 *
 * 5. Running NodeTool (runNodeTool function):
 *    - Spawns a child process to run the NodeTool server.
 *    - Monitors server output for successful startup and logs.
 *    - Handles server errors and unexpected exits.
 *
 * Additional Features:
 * - Graceful shutdown procedure to ensure clean app closure.
 * - IPC communication between main process and renderer for status updates.
 * - Logging system for tracking installation and runtime events.
 *
 * Error Handling:
 * - Comprehensive error catching and reporting throughout the process.
 * - User notifications via dialog boxes for critical errors.
 * - Automatic app restart on server crashes.
 *
 * Platform Specifics:
 * - Handles differences between Windows and macOS for file paths and commands.
 * - Uses platform-specific package URLs and checksums for component updates.
 *
 * This process ensures that the NodeTool application is always up-to-date with the latest
 * components and runs with the correct dependencies, providing a smooth user experience
 * across different platforms.
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { createReadStream, createWriteStream } = require("fs");
const { access, mkdir, readFile, rename, writeFile, unlink } =
  require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const crypto = require("crypto");
const unzip = require("unzip-stream");
const VERSION = "0.5.0rc4";

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
  `nodetool==${VERSION}`,
  "--extra-index-url",
  "https://download.pytorch.org/whl/cu121",
];

/** @type {string[]} */
const macPipArgs = ["install", `nodetool==${VERSION}`];

/**
 * Install Python requirements
 * @returns {Promise<void>}
 */
async function installRequirements() {
  log(`Installing requirements. Platform: ${process.platform}`);
  const pipArgs = process.platform === "darwin" ? macPipArgs : windowsPipArgs;
  log(`Using pip arguments: ${pipArgs.join(" ")}`);

  // Check if nodetool VERSION is already installed
  const isNodeToolInstalled = await checkNodeToolInstalled();
  if (isNodeToolInstalled) {
    log(`nodetool ${VERSION} is already installed. Skipping installation.`);
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

  let output = "";

  pipProcess.stdout.on("data", (/** @type {Buffer} */ data) => {
    const chunk = data.toString();
    console.log(chunk);
    output += chunk;
    emitServerLog(chunk);
  });

  pipProcess.stderr.on("data", (/** @type {Buffer} */ data) => {
    const chunk = data.toString();
    console.log(chunk);
    output += chunk;
    emitServerLog(chunk);
  });

  return new Promise((resolve, reject) => {
    pipProcess.on("close", (/** @type {number|null} */ code) => {
      if (code === 0) {
        log("pip install completed successfully");
        resolve();
      } else {
        log(`pip install process exited with code ${code}`);
        const errorMessage = `
Error: pip installation failed with code ${code}.

Please follow these steps:
1. Uninstall the app and download the newest release from GitHub:
   https://github.com/nodetool-ai/nodetool/releases

2. If the problem persists, please report an issue on GitHub with the following logs:

${output}

https://github.com/nodetool-ai/nodetool/issues/new
`;
        reject(new Error(errorMessage));
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
    log(output);
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
        `The server process has unexpectedly exited.`
      );
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
    await access(path);
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
        emitUpdateProgress(path.basename(dest), progress, "Downloading");
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
    await installRequirements();
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
    emitUpdateStep("Checking for updates");

    const owner = "nodetool-ai";
    const repo = "nodetool";

    log("Fetching latest release information");
    const latestRelease = await fetchLatestRelease(owner, repo);
    log(`Latest release: ${latestRelease.tag_name}`);
    const assets = latestRelease.assets;

    const componentsDir = path.join(app.getPath("userData"), "components");
    mkdir(componentsDir, { recursive: true });

    const system =
      process.platform === "win32"
        ? "windows"
        : process.platform === "darwin"
        ? "darwin"
        : process.platform === "linux"
        ? "linux"
        : "unknown";
    const arch = process.arch;

    if (system === "unknown" || system === "linux") {
      throw new Error("Unsupported platform");
    }

    log(`Checking components for system: ${system}, arch: ${arch}`);
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
      emitUpdateStep(
        `Updating components: ${componentsToUpdate
          .map((c) => c.name)
          .join(", ")}`
      );

      for (const component of componentsToUpdate) {
        try {
          log(`Starting update for ${component.name}`);
          emitUpdateStep(`Downloading ${component.name}`);
          const strip = component.name === "python_env" ? 0 : 1;
          await downloadAndExtractComponent(component, componentsDir, strip);
          log(`Finished updating ${component.name}`);
          emitUpdateStep(`Finished updating ${component.name}`);
        } catch (error) {
          log(`Error updating ${component.name}: ${error.message}`, "error");
          if (component.name === "python_env" || component.name === "web") {
            const errorMessage = `
Error: Failed to update ${component.name}.

Please follow these steps:
1. Uninstall the app and download the newest release from GitHub:
   https://github.com/nodetool-ai/nodetool/releases

2. If the problem persists, please report an issue on GitHub with the following logs:

${error.message}

https://github.com/nodetool-ai/nodetool/issues/new
`;
            throw new Error(errorMessage);
          } else {
            log(
              `Warning: Failed to update ${component.name}: ${error.message}`,
              "warn"
            );
          }
        }
      }
    } else {
      log("All components are up to date");
      emitUpdateStep("All components are up to date", true);
    }
  } catch (error) {
    log(`Error checking for updates: ${error.message}`, "error");
    log(error.stack, "error");
    emitUpdateStep(`Error: ${error.message}`, true);
    dialog.showErrorBox("Update Error", error.message);
    app.exit(1);
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
  const componentNames = ["python_env", "web", "ollama", "ffmpeg"];

  const updateChecks = componentNames.map(async (name) => {
    const assetName = `${name}-${system}-${arch}.zip`;
    const checksumName = `${name}-${system}-${arch}.sha256`;

    log(`Checking component: ${name}`);
    log(`Looking for asset: ${assetName}`);
    log(`Looking for checksum: ${checksumName}`);

    const asset = assets.find((a) => a.name === assetName);
    const checksumAsset = assets.find((a) => a.name === checksumName);

    if (asset && checksumAsset) {
      log(`Found asset and checksum for ${name}`);
      const [remoteChecksum, localChecksum] = await Promise.all([
        downloadFileToString(checksumAsset.browser_download_url),
        getLocalChecksum(componentsDir, name),
      ]);

      log(`Remote checksum for ${name}: ${remoteChecksum.trim()}`);
      log(`Local checksum for ${name}: ${localChecksum}`);

      if (remoteChecksum.trim() !== localChecksum) {
        log(`Checksum mismatch for ${name}, will update`);
        return {
          name,
          url: asset.browser_download_url,
          checksumUrl: checksumAsset.browser_download_url,
        };
      } else {
        log(`Checksum match for ${name}, no update needed`);
      }
    } else {
      log(`Asset or checksum not found for ${name}`);
    }

    return null;
  });

  const results = await Promise.all(updateChecks);
  const componentsToUpdate = results.filter(Boolean);

  log(
    `Components to update: ${componentsToUpdate.map((c) => c.name).join(", ")}`
  );
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
    return await readFile(checksumPath, "utf-8");
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
async function downloadAndExtractComponent(
  component,
  componentsDir,
  strip = 1
) {
  const tempFile = path.join(componentsDir, `${component.name}.tmp`);
  const finalFile = path.join(componentsDir, `${component.name}.zip`);
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
  await rename(tempFile, finalFile);

  // Save checksum
  await writeFile(checksumFile, checksum);

  // Extract the component
  log(`Extracting ${component.name} to ${componentsDir}`);
  await extractZip(finalFile, componentsDir, component.name, strip);

  // Remove the zip file
  await unlink(finalFile);

  log(`${component.name} extracted successfully`);
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
 * Extract a zip archive
 * @param {string} archivePath - Path to the zip file
 * @param {string} extractTo - Directory to extract to
 * @param {string} componentName - Name of the component being extracted
 * @param {number} strip - Number of directories to strip from the archive
 * @returns {Promise<void>}
 */
async function extractZip(archivePath, extractTo, componentName, strip = 1) {
  log(`Starting extraction of ${archivePath} to ${extractTo}`);
  const componentDir = path.join(extractTo, componentName);

  await mkdir(componentDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let totalEntries = 0;
    let processedEntries = 0;

    createReadStream(archivePath)
      .pipe(unzip.Parse())
      .on("entry", (entry) => {
        totalEntries++;
        entry.autodrain();
      })
      .on("close", () => {
        createReadStream(archivePath)
          .pipe(unzip.Extract({ path: componentDir }))
          .on("entry", (entry) => {
            processedEntries++;
            const progress = (processedEntries / totalEntries) * 100;
            emitUpdateProgress(componentName, progress, "Unpacking");
            entry.autodrain();
          })
          .on("close", () => {
            log(`Finished extraction of ${archivePath} to ${componentDir}`);
            resolve();
          })
          .on("error", (error) => {
            log(`Error during extraction: ${error.message}`, "error");
            reject(error);
          });
      });
  });
}

/**
 * Fetch the latest release from GitHub using the native https module
 * @param {string} owner - GitHub repository owner
 * @param {string} repo - GitHub repository name
 * @returns {Promise<any>}
 */
function fetchLatestRelease(owner, repo) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "NodeTool-Electron-App",
  };

  return new Promise((resolve, reject) => {
    const options = {
      headers: headers,
    };

    const request = https.get(apiUrl, options, handleResponse);
    request.on("error", reject);

    function handleResponse(res) {
      if (res.statusCode === 302) {
        https
          .get(res.headers.location, options, handleResponse)
          .on("error", reject);
        return;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const releaseData = JSON.parse(data);
            resolve(releaseData);
          } catch (error) {
            reject(new Error(`Error parsing JSON: ${error.message}`));
          }
        } else {
          reject(
            new Error(
              `Failed to fetch latest release: ${res.statusCode} ${res.statusMessage}`
            )
          );
        }
      });
    }
  });
}

/**
 * Download a file from a URL and return its contents as a string
 * @param {string} url - The URL to download from
 * @returns {Promise<string>}
 */
function downloadFileToString(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, handleResponse);
    request.on("error", reject);

    function handleResponse(res) {
      if (res.statusCode === 302) {
        https.get(res.headers.location, handleResponse).on("error", reject);
        return;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(
            new Error(
              `Failed to download file: ${res.statusCode} ${res.statusMessage}`
            )
          );
        }
      });
    }
  });
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
      console.log("python nodetool version", output);
    });

    checkProcess.on("close", (code) => {
      if (code === 0 && output.trim() === VERSION) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
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

function emitDownloadProgress(componentName, progress) {
  emitUpdateProgress(componentName, progress, "Downloading");
}
