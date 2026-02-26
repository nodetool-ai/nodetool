import { promises as fs, constants } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import { app, dialog } from "electron";
import * as path from "path";

import { getPythonPath, getProcessEnv, getUVPath } from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions, fileExists } from "./utils";
import { emitBootMessage, emitServerLog } from "./events";
import { getTorchIndexUrlAsync } from "./torchPlatformCache";

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

  const results = await Promise.all(
    pathsToCheck.map(async ({ path, mode, desc }) => {
      const { accessible, error } = await checkPermissions(path, mode);
      logMessage(`Checking ${desc} permissions: ${accessible ? "OK" : "FAILED"}`);
      if (!accessible && error) {
        return `${desc}: ${error}`;
      }
      return null;
    })
  );

  const errors = results.filter((e): e is string => e !== null);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if the Python environment is installed
 * Verifies both Python and uv executables exist to detect partial/corrupted installs
 */
async function isCondaEnvironmentInstalled(): Promise<boolean> {
  logMessage("=== Checking Conda Environment Installation ===");

  let pythonExecutablePath: string | null = null;
  let uvExecutablePath: string | null = null;
  
  try {
    pythonExecutablePath = getPythonPath();
    uvExecutablePath = getUVPath();
  } catch (error) {
    // If we cannot even resolve paths, treat as not installed so installer is triggered
    logMessage(
      `Failed to resolve executable paths, treating as not installed: ${error}`,
      "error",
    );
    return false;
  }

  logMessage(`Python executable path: ${pythonExecutablePath}`);
  logMessage(`UV executable path: ${uvExecutablePath}`);

  // Check Python and UV executables in parallel
  const [pythonExists, uvExists] = await Promise.all([
    fs.access(pythonExecutablePath).then(
      () => {
        logMessage(`✓ Python executable found at ${pythonExecutablePath}`);
        return true;
      },
      (error) => {
        logMessage(
          `✗ Python executable not found at ${pythonExecutablePath}`,
          "error",
        );
        logMessage(`Access error: ${error}`, "error");
        return false;
      }
    ),
    fs.access(uvExecutablePath).then(
      () => {
        logMessage(`✓ UV executable found at ${uvExecutablePath}`);
        return true;
      },
      (error) => {
        logMessage(
          `✗ UV executable not found at ${uvExecutablePath} - environment appears incomplete`,
          "error",
        );
        logMessage(`Access error: ${error}`, "error");
        logMessage("Will trigger reinstallation to complete the environment setup");
        return false;
      }
    ),
  ]);

  return pythonExists && uvExists;
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
async function updateCondaEnvironment(
  packages: string[]
): Promise<void> {
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

    // Get the torch platform index URL (e.g., cu128 for CUDA 12.8)
    const torchIndexUrl = await getTorchIndexUrlAsync();

    const installCommand: string[] = [
      uvExecutable,
      "pip",
      "install",
      "--extra-index-url",
      PACKAGE_INDEX_URL,
      // Add PyTorch index URL for the detected GPU platform
      ...(torchIndexUrl ? ["--extra-index-url", torchIndexUrl] : []),
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      ...allPackages,
    ];

    if (torchIndexUrl) {
      logMessage(`Using torch index URL: ${torchIndexUrl}`);
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
  const executable = command[0];
  
  // Check if executable exists before attempting to spawn
  const executableExists = await fileExists(executable);
  if (!executableExists) {
    const errorMsg = `Python environment not properly installed: executable not found at ${executable}. ` +
      `This may happen if the installation was interrupted (e.g., by a macOS permission dialog). ` +
      `Please use "Reinstall environment" to set up the Python environment correctly.`;
    logMessage(errorMsg, "error");
    throw new Error(errorMsg);
  }

  const updateProcess = spawn(executable, command.slice(1), {
    stdio: "pipe",
    env: getProcessEnv(),
  });

  logMessage(`Running command: ${command.join(" ")}`);

  updateProcess.stdout?.on("data", (data: Buffer) => {
    const lines = data
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      logMessage(line);
      emitServerLog(line);
      
      // Parse package names from pip/uv output and emit boot messages
      // Look for lines like "Downloading package-name-version"
      const downloadingMatch = line.match(/Downloading\s+([a-zA-Z0-9_-]+)/i);
      if (downloadingMatch) {
        emitBootMessage(`Downloading ${downloadingMatch[1]}...`);
      }
      
      // Look for lines like "Installing package-name-version"
      const installingMatch = line.match(/Installing\s+([a-zA-Z0-9_-]+)/i);
      if (installingMatch) {
        emitBootMessage(`Installing ${installingMatch[1]}...`);
      }
      
      // Look for lines like "Updating package-name"
      const updatingMatch = line.match(/Updating\s+([a-zA-Z0-9_-]+)/i);
      if (updatingMatch) {
        emitBootMessage(`Updating ${updatingMatch[1]}...`);
      }
    }
  });

  updateProcess.stderr?.on("data", (data: Buffer) => {
    const lines = data
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      logMessage(line);
      emitServerLog(line);
      
      // Parse package names from pip/uv stderr output (some progress info goes to stderr)
      const downloadingMatch = line.match(/Downloading\s+([a-zA-Z0-9_-]+)/i);
      if (downloadingMatch) {
        emitBootMessage(`Downloading ${downloadingMatch[1]}...`);
      }
      
      const installingMatch = line.match(/Installing\s+([a-zA-Z0-9_-]+)/i);
      if (installingMatch) {
        emitBootMessage(`Installing ${installingMatch[1]}...`);
      }
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

    updateProcess.on("error", (error) => {
      // Provide a more helpful error message for ENOENT
      if (error.message.includes("ENOENT")) {
        reject(new Error(
          `Python environment not properly installed: could not run ${executable}. ` +
          `This may happen if the installation was interrupted. ` +
          `Please use "Reinstall environment" to fix this issue.`
        ));
      } else {
        reject(error);
      }
    });
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
