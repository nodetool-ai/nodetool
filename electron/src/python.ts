import { promises as fs, constants } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import { app, dialog } from "electron";
import * as https from "https";
import * as path from "path";

import { getPythonPath, getProcessEnv, getUVPath } from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions } from "./utils";
import { emitBootMessage } from "./events";
import { IncomingMessage } from "http";
import { downloadFromFile, getFileSizeFromUrl } from "./download";

/**
 * API Module for Electron-Server Communication
 *
 * This module handles all communication between the Electron app and the backend server,
 * including REST API calls and WebSocket connections for real-time updates.
 *
 * Key Features:
 * - REST API integration for fetching workflows
 * - WebSocket connection management for real-time workflow updates
 * - Automatic reconnection handling for WebSocket failures
 * - Integration with system tray and global shortcuts
 *
 * The module maintains a persistent WebSocket connection to receive live updates about:
 * - Workflow creation
 * - Workflow updates/modifications
 * - Workflow deletions
 *
 * When updates are received, it:
 * 1. Updates the system tray menu
 * 2. Manages global keyboard shortcuts
 * 3. Logs relevant events for debugging
 *
 * @module api
 */

interface PathCheck {
  path: string;
  mode: number;
  desc: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Verify write permissions for critical paths
 */
async function verifyApplicationPaths(): Promise<ValidationResult> {
  const pathsToCheck: PathCheck[] = [
    {
      path: app.getPath("userData"),
      mode: constants.W_OK,
      desc: "User data directory",
    },
    {
      path: path.dirname(LOG_FILE),
      mode: constants.W_OK,
      desc: "Log file directory",
    },
  ];

  const errors: string[] = [];

  for (const { path, mode, desc } of pathsToCheck) {
    const { accessible, error } = await checkPermissions(path, mode);
    logMessage(`Checking ${desc} permissions: ${accessible ? "OK" : "FAILED"}`);
    if (!accessible && error) {
      errors.push(`${desc}: ${error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if the Python environment is installed
 */
async function isCondaEnvironmentInstalled(): Promise<boolean> {
  const pythonExecutablePath = getPythonPath();
  try {
    await fs.access(pythonExecutablePath);
    logMessage(`Python executable found at ${pythonExecutablePath}`);
    return true;
  } catch {
    logMessage(`Python executable not found at ${pythonExecutablePath}`);
    return false;
  }
}

/**
 * Update the Python environment packages
 */
async function updateCondaEnvironment(packages: string[]): Promise<void> {
  try {
    emitBootMessage(`Updating python packages...`);

    const uvExecutable = getUVPath();
    packages = [
      "nodetool-ai/nodetool-core",
      "nodetool-ai/nodetool-base",
      ...packages,
    ];
    const githubRepos = packages.map((repoId) => {
      return `git+https://github.com/${repoId}.git`;
    });
    const installCommand: string[] = [
      uvExecutable,
      "pip",
      "install",
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      ...githubRepos,
    ];

    if (process.platform !== "darwin") {
      installCommand.push("--extra-index-url");
      installCommand.push("https://download.pytorch.org/whl/cu121");
    }

    logMessage(`Running command: ${installCommand.join(" ")}`);
    await runCommand(installCommand);

    logMessage("Python packages update completed successfully");
  } catch (error: any) {
    logMessage(`Failed to update Pip packages: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Helper function to run pip commands
 */
async function runCommand(command: string[]): Promise<void> {
  const updateProcess = spawn(command[0], command.slice(1), {
    stdio: "pipe",
    env: getProcessEnv(),
  });

  logMessage(`Running command: ${command.join(" ")}`);

  updateProcess.stdout?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(message);
    }
  });

  updateProcess.stderr?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(message);
    }
  });

  return new Promise<void>((resolve, reject) => {
    updateProcess.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    updateProcess.on("error", reject);
  });
}
/**
 * Download a file's contents directly to a string
 */
async function downloadToString(url: string): Promise<string> {
  if (url.startsWith("file://")) {
    return downloadFromFile(url.replace("file://", ""));
  }

  return new Promise((resolve, reject) => {
    let data = "";

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function handleResponse(response: IncomingMessage) {
      if (response.statusCode === 404) {
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        https
          .get(response.headers.location!, handleResponse)
          .on("error", handleError);
        return;
      }

      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (data += chunk));
      response.on("end", () => resolve(data));
      response.on("error", handleError);
    }

    function handleError(err: Error) {
      reject(new Error(`Error downloading file: ${err.message}`));
    }
  });
}

/**
 * Get the conda environment size from remote URL
 */
async function getCondaEnvSize(): Promise<number> {
  try {
    const url = getCondaEnvUrl();
    const size = await getFileSizeFromUrl(url);
    return size;
  } catch (error: any) {
    logMessage(`Failed to get conda env size: ${error.message}`, "error");
    throw error;
  }
}


/**
 * Get the default installation location based on platform
 */
function getDefaultInstallLocation(): string {
  switch (process.platform) {
    case "win32":
      // Use ProgramData on Windows for all users, or AppData for current user
      return process.env.ALLUSERSPROFILE
        ? path.join(process.env.ALLUSERSPROFILE, "nodetool", "conda_env")
        : path.join(process.env.APPDATA!, "nodetool", "conda_env");
    case "darwin":
      // Use /Library/Application Support for all users, or ~/Library/Application Support for current user
      return process.env.SUDO_USER
        ? path.join("/Library/Application Support/nodetool/conda_env")
        : path.join(
          os.homedir(),
          "Library/Application Support/nodetool/conda_env"
        );
    case "linux":
      // Use /opt for all users, or ~/.local/share for current user
      return process.env.SUDO_USER
        ? "/opt/nodetool/conda_env"
        : path.join(os.homedir(), ".local/share/nodetool/conda_env");
    default:
      return path.join(os.homedir(), ".nodetool/conda_env");
  }
}
/**
 * Get the conda environment URL for the current platform
 */
function getCondaEnvUrl(): string {
  const VERSION = app.getVersion();
  const platform = process.platform;
  const arch = process.arch;
  let fileName: string;

  if (platform === "win32") {
    fileName = `conda-env-windows-x64.zip`;
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    fileName = `conda-env-darwin-${archSuffix}.tar.gz`;
  } else if (platform === "linux") {
    fileName = `conda-env-linux-x64.tar.gz`;
  } else {
    throw new Error("Unsupported platform");
  }

  return `https://github.com/nodetool-ai/nodetool/releases/download/v${VERSION}/${fileName}`;
}

export {
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
  downloadToString,
  getCondaEnvUrl,
  getCondaEnvSize,
  getDefaultInstallLocation,
};
