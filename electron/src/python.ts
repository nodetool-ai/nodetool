import { promises as fs, constants } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import { app, dialog } from "electron";
import * as path from "path";

import { getNodePath, getProcessEnv, getPythonPath, getUVPath } from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions, fileExists } from "./utils";
import { emitBootMessage, emitServerLog } from "./events";
import { getTorchIndexUrl } from "./torchPlatformCache";
import { MIN_NODETOOL_CORE_VERSION } from "@nodetool/runtime";

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

const PACKAGE_INDEX_URL =
  "https://nodetool-ai.github.io/nodetool-registry/simple/";
const PYPI_SIMPLE_INDEX_URL = "https://pypi.org/simple";
const REQUIRED_PYTHON_PACKAGES = ["nodetool-core"] as const;

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
 * Check if the conda environment is installed
 * Verifies the Node.js executable exists in the conda environment
 */
async function isCondaEnvironmentInstalled(): Promise<boolean> {
  logMessage("=== Checking Conda Environment Installation ===");

  // In dev mode, skip the conda env check — the system node is used directly
  if (process.env.NT_ELECTRON_DEV_MODE === "1") {
    logMessage("Dev mode detected, skipping conda environment check");
    return true;
  }

  let nodeExecutablePath: string | null = null;
  let pythonExecutablePath: string | null = null;
  let uvExecutablePath: string | null = null;

  try {
    nodeExecutablePath = getNodePath();
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

  logMessage(`Node executable path: ${nodeExecutablePath}`);
  logMessage(`Python executable path: ${pythonExecutablePath}`);
  logMessage(`UV executable path: ${uvExecutablePath}`);

  const [nodeExists, pythonExists, uvExists] = await Promise.all([
    fs.access(nodeExecutablePath).then(
      () => {
        logMessage(`Node executable found at ${nodeExecutablePath}`);
        return true;
      },
      (error) => {
        logMessage(
          `Node executable not found at ${nodeExecutablePath}`,
          "error",
        );
        logMessage(`Access error: ${error}`, "error");
        return false;
      }
    ),
    fs.access(pythonExecutablePath).then(
      () => {
        logMessage(`Python executable found at ${pythonExecutablePath}`);
        return true;
      },
      (error) => {
        logMessage(
          `Python executable not found at ${pythonExecutablePath}`,
          "error",
        );
        logMessage(`Access error: ${error}`, "error");
        return false;
      }
    ),
    fs.access(uvExecutablePath).then(
      () => {
        logMessage(`UV executable found at ${uvExecutablePath}`);
        return true;
      },
      (error) => {
        logMessage(
          `UV executable not found at ${uvExecutablePath}`,
          "error",
        );
        logMessage(`Access error: ${error}`, "error");
        return false;
      }
    ),
  ]);

  if (!nodeExists || !pythonExists || !uvExists) {
    return false;
  }

  // Only verify nodetool-core is installed at all. The actual JS↔Python
  // protocol compatibility check happens at runtime via the bridge's
  // `discover` handshake (see packages/runtime/src/bridge-protocol.ts).
  // This decouples the Electron app version from the nodetool-core
  // release cadence — most app builds do NOT need a fresh core release.
  const installedCoreVersion = await getInstalledPythonPackageVersion(
    pythonExecutablePath,
    "nodetool-core",
  );

  if (!installedCoreVersion) {
    logMessage(
      `Python package nodetool-core is missing at ${pythonExecutablePath} ` +
        `(installer pins nodetool-core>=${MIN_NODETOOL_CORE_VERSION})`,
      "error",
    );
    return false;
  }
  logMessage(
    `nodetool-core ${installedCoreVersion} is installed at ${pythonExecutablePath}`,
  );

  const workerImportable = await canImportNodeToolWorker(pythonExecutablePath);
  if (!workerImportable) {
    logMessage(
      `Python worker import check failed for ${pythonExecutablePath}; environment appears incomplete`,
      "error",
    );
  }

  return workerImportable;
}

async function getInstalledPythonPackageVersion(
  pythonExecutablePath: string,
  packageName: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const proc = spawn(
      pythonExecutablePath,
      [
        "-c",
        [
          "from importlib.metadata import PackageNotFoundError, version",
          `package_name = ${JSON.stringify(packageName)}`,
          "try:",
          "    print(version(package_name))",
          "except PackageNotFoundError:",
          "    raise SystemExit(2)",
        ].join("\n"),
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
        env: getProcessEnv(),
        windowsHide: true,
      }
    );

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        const version = Buffer.concat(stdoutChunks).toString().trim();
        resolve(version || null);
        return;
      }
      if (code === 2) {
        resolve(null);
        return;
      }
      logMessage(
        `Failed to determine installed Python package version for ${packageName} at ${pythonExecutablePath} (exit ${code})`,
        "error",
      );
      resolve(null);
    });

    proc.on("error", (error) => {
      logMessage(
        `Failed to run Python package version check for ${packageName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
      resolve(null);
    });
  });
}

async function canImportNodeToolWorker(
  pythonExecutablePath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      pythonExecutablePath,
      ["-c", "import nodetool.worker"],
      {
        stdio: "ignore",
        env: getProcessEnv(),
        // Prevent a console window from flashing on Windows.
        windowsHide: true,
      }
    );

    proc.on("exit", (code) => {
      resolve(code === 0);
    });

    proc.on("error", (error) => {
      logMessage(
        `Failed to run Python worker import check: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
      resolve(false);
    });
  });
}

function normalizePythonPackageName(packageName: string): string {
  const trimmed = packageName.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (!trimmed.includes("/")) {
    return trimmed;
  }
  const [, resolvedName = ""] = trimmed.split("/", 2);
  return resolvedName || trimmed;
}

async function installRequiredPythonPackages(
  additionalPackages: string[] = []
): Promise<void> {
  emitBootMessage("Installing Nodetool Python packages...");

  const uvExecutable = getUVPath();

  // nodetool-core is pinned by lower bound only (matched to the bridge
  // protocol version). Additional nodetool-* node packages are installed
  // unpinned: their own pyproject.toml declares the nodetool-core range
  // they need, so uv resolves a coherent set automatically. This keeps
  // node packages on an independent release cadence from the Electron
  // app — if a user opts into nodetool-huggingface, they get the latest
  // published version that is compatible with the resolved nodetool-core.
  const corePackageSpecs = REQUIRED_PYTHON_PACKAGES.map(
    normalizePythonPackageName,
  )
    .filter(Boolean)
    .map((pkg) =>
      pkg === "nodetool-core"
        ? `${pkg}>=${MIN_NODETOOL_CORE_VERSION}`
        : pkg,
    );

  const additionalSpecs = additionalPackages
    .map(normalizePythonPackageName)
    .filter(Boolean);

  const packageSpecs = Array.from(
    new Set([...corePackageSpecs, ...additionalSpecs]),
  );

  const installCommand: string[] = [
    uvExecutable,
    "pip",
    "install",
    "--prerelease=allow",
    "--index-url",
    PYPI_SIMPLE_INDEX_URL,
    "--extra-index-url",
    PACKAGE_INDEX_URL,
    "--index-strategy",
    "unsafe-best-match",
    "--system",
    ...packageSpecs,
  ];

  const torchIndexUrl = getTorchIndexUrl();
  if (torchIndexUrl) {
    installCommand.push("--extra-index-url", torchIndexUrl);
  }

  logMessage(
    `Installing required Python packages: ${packageSpecs.join(", ")}`,
  );
  await runCommand(installCommand);
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
    // Prevent a console window from flashing on Windows during pip operations.
    windowsHide: true,
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
  installRequiredPythonPackages,
  getDefaultInstallLocation,
  runCommand,
};
