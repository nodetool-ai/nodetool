import { promises as fs, constants } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import { app, dialog } from "electron";
import * as path from "path";

import { getPythonPath, getProcessEnv, getUVPath } from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions } from "./utils";
import { emitBootMessage } from "./events";

/**
 * Python environment manager for the Electron shell.
 *
 * This module owns the Electron-side bootstrap of the Python toolchain:
 * - Verify the app can write to user data and log directories before installing
 * - Detect an existing conda/uv-based environment and surface clear failures
 * - Install or update the bundled Python packages from the NodeTool registry
 * - Provide helpers to run commands with the correct environment variables
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
  logMessage("=== Checking Conda Environment Installation ===");

  let pythonExecutablePath: string | null = null;
  try {
    pythonExecutablePath = getPythonPath();
  } catch (error) {
    // If we cannot even resolve a python path, treat as not installed so installer is triggered
    logMessage(
      `Failed to resolve Python path, treating as not installed: ${error}`,
      "error",
    );
    return false;
  }

  logMessage(`Python executable path: ${pythonExecutablePath}`);

  try {
    logMessage("Attempting to access Python executable...");
    await fs.access(pythonExecutablePath);
    logMessage(`✓ Python executable found at ${pythonExecutablePath}`);
    return true;
  } catch (error) {
    logMessage(
      `✗ Python executable not found at ${pythonExecutablePath}`,
      "error",
    );
    logMessage(`Access error: ${error}`, "error");
    return false;
  }
}

/**
 * Convert npm/semver version to PEP 440 (Python) version format
 * e.g., "0.6.2-rc.9" -> "0.6.2rc9"
 */
function convertToPep440Version(npmVersion: string): string {
  // Remove the '-' before prerelease tags and '.' within them
  // npm: 0.6.2-rc.9 -> pip: 0.6.2rc9
  return npmVersion.replace(/-([a-zA-Z]+)\.?(\d*)/, "$1$2");
}

/**
 * Update the Python environment packages using wheel-based package index
 */
async function updateCondaEnvironment(packages: string[]): Promise<void> {
  try {
    emitBootMessage(`Updating python packages...`);

    const uvExecutable = getUVPath();
    const PACKAGE_INDEX_URL =
      "https://nodetool-ai.github.io/nodetool-registry/simple/";

    // Get version from package.json via Electron's app.getVersion()
    const appVersion = app.getVersion();
    const pipVersion = convertToPep440Version(appVersion);
    logMessage(`Pinning packages to version: ${pipVersion} (from ${appVersion})`);

    // Convert repo IDs to package names for wheel installation, pinned to app version
    const corePackages = [
      `nodetool-core==${pipVersion}`,
      `nodetool-base==${pipVersion}`,
    ];

    // Convert additional packages from repo format to package names, pinned to app version
    const additionalPackages = packages.map((repoId) => {
      if (!repoId) {
        return repoId;
      }

      const trimmed = repoId.trim();
      if (!trimmed) {
        return trimmed;
      }

      let packageName: string;
      if (!trimmed.includes("/")) {
        packageName = trimmed;
      } else {
        const [, name = ""] = trimmed.split("/", 2);
        packageName = name || trimmed;
      }

      // Pin to the same version as the app
      return `${packageName}==${pipVersion}`;
    });

    const allPackages = [...corePackages, ...additionalPackages];

    const installCommand: string[] = [
      uvExecutable,
      "pip",
      "install",
      "--extra-index-url",
      PACKAGE_INDEX_URL,
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      ...allPackages,
    ];

    if (process.platform !== "darwin") {
      installCommand.push("--extra-index-url");
      installCommand.push("https://download.pytorch.org/whl/cu129");
    }

    logMessage(`Running command: ${installCommand.join(" ")}`);
    await runCommand(installCommand);

    logMessage(
      "Python packages update completed successfully from wheel index",
    );
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
      return path.join(os.homedir(), "nodetool_env");
    case "linux":
      // Use /opt for all users, or ~/.local/share for current user
      return process.env.SUDO_USER
        ? "/opt/nodetool/conda_env"
        : path.join(os.homedir(), ".local/share/nodetool/conda_env");
    default:
      return path.join(os.homedir(), ".nodetool/conda_env");
  }
}
export {
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
  getDefaultInstallLocation,
  runCommand,
  isOllamaInstalled,
};

/**
 * Check if Ollama is installed on the system by running 'ollama --version'
 * @returns true if installed, false otherwise
 */
async function isOllamaInstalled(): Promise<boolean> {
  const { exec } = await import("child_process");
  return new Promise((resolve) => {
    exec("ollama --version", (error) => {
      if (error) {
        // Command failed or not found
        resolve(false);
      } else {
        // Command succeeded, ollama is in PATH
        resolve(true);
      }
    });
  });
}
