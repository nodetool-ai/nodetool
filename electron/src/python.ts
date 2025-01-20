import { promises as fs, constants } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import { app, dialog } from "electron";
import * as https from "https";
import * as path from "path";

import {
  getPythonPath,
  getPipPath,
  saveUserRequirements,
  getRequirementsPath,
  getProcessEnv,
} from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions } from "./utils";
import { emitBootMessage } from "./events";
import { IncomingMessage } from "http";
import { downloadFromFile, getFileSizeFromUrl } from "./download";

interface PathCheck {
  path: string;
  mode: number;
  desc: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface PermissionResult {
  accessible: boolean;
  error?: string;
}

/**
 * Check if installed packages match requirements
 */
async function checkPythonPackages(): Promise<boolean> {
  try {
    // In development, we don't need to check for updates
    if (!app.isPackaged) {
      return true;
    }

    const VERSION = app.getVersion();
    const requirementsURL = `https://packages.nodetool.ai/requirements-${VERSION}.txt`;

    emitBootMessage(`Downloading requirements...`);
    logMessage(`Downloading requirements from ${requirementsURL}`);

    const remoteRequirements = await downloadToString(requirementsURL);
    const localRequirements = await fs.readFile(getRequirementsPath(), "utf8");

    if (localRequirements === remoteRequirements) {
      emitBootMessage("No updates needed");
      logMessage("Requirements are up to date");
      return false;
    }

    saveUserRequirements(remoteRequirements);
    return true;
  } catch (error: any) {
    logMessage(`Failed to check Python packages: ${error.message}`, "error");
    throw error;
  }
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
async function updateCondaEnvironment(): Promise<void> {
  try {
    if (!app.isPackaged) {
      return;
    }

    const installNeeded = await checkPythonPackages();

    if (!installNeeded) {
      logMessage("No packages to update");
      emitBootMessage("No packages to update");
      return;
    }

    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Update", "Cancel"],
      defaultId: 0,
      title: "Python Package Updates",
      message: "Python package updates are available",
      detail: "Would you like to update the Python packages now?",
    });

    if (response === 1) {
      logMessage("Package update cancelled by user");
      emitBootMessage("Update cancelled");
      return;
    }

    emitBootMessage(`Updating packages...`);
    logMessage("Updating packages...");

    const pipExecutable = getPipPath();
    const installCommand: string[] = [
      pipExecutable,
      "install",
      "-r",
      getRequirementsPath(),
    ];

    if (process.platform !== "darwin") {
      installCommand.push("--extra-index-url");
      installCommand.push("https://download.pytorch.org/whl/cu121");
    }

    logMessage(`Running pip command: ${installCommand.join(" ")}`);
    await runPipCommand(installCommand);

    logMessage("Python packages update completed successfully");
  } catch (error: any) {
    logMessage(`Failed to update Pip packages: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Helper function to run pip commands
 */
async function runPipCommand(command: string[]): Promise<void> {
  const updateProcess = spawn(command[0], command.slice(1), {
    stdio: "pipe",
    env: getProcessEnv(),
  });

  logMessage(`Running pip command: ${command.join(" ")}`);

  updateProcess.stdout?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(`Pip update: ${message}`);
    }
  });

  updateProcess.stderr?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(`Pip update error: ${message}`, "error");
    }
  });

  return new Promise<void>((resolve, reject) => {
    updateProcess.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pip command failed with code ${code}`));
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
 * Get environment size based on platform
 */
function getEnvironmentSize(): string {
  switch (process.platform) {
    case "darwin":
      return "2.5 GB";
    case "linux":
      return "8 GB";
    case "win32":
      return "8 GB";
    default:
      return "unknown";
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
    fileName = `conda-env-windows-x64-${VERSION}.zip`;
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    fileName = `conda-env-darwin-${archSuffix}-${VERSION}.tar.gz`;
  } else if (platform === "linux") {
    fileName = `conda-env-linux-x64-${VERSION}.tar.gz`;
  } else {
    throw new Error("Unsupported platform");
  }

  return `https://packages.nodetool.ai/${fileName}`;
}

export {
  checkPythonPackages,
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
  downloadToString,
  getCondaEnvUrl,
  getCondaEnvSize,
  getEnvironmentSize,
  getDefaultInstallLocation,
};
