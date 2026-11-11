import { promises as fs, constants } from "fs";
import { app } from "electron";
import * as path from "path";
import {
  canImportNodeToolWorker,
  getInstalledPythonPackageVersion,
  installRequiredPythonPackages as installPythonCorePackages,
} from "@nodetool-ai/runtime-install";

import { getNodePath, getPythonPath, getUVPath } from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { checkPermissions } from "./utils";
import { getDesktopRuntimeHost } from "./runtimeHost";
// The bridge-protocol constants live in @nodetool-ai/protocol — a tiny
// zod-only package — specifically so the Electron main bundle can read them
// without dragging the @nodetool-ai/runtime barrel (and every provider's
// heavy SDK) into the main process.
import { MIN_NODETOOL_CORE_VERSION } from "@nodetool-ai/protocol/bridge-protocol";
import { runtimeLocations } from "@nodetool-ai/config";

/**
 * Python environment manager for the Electron shell.
 *
 * This module owns the Electron-side checks of the Python toolchain:
 * - Verify the app can write to user data and log directories before installing
 * - Detect an existing conda/uv-based environment and surface clear failures
 *
 * The install itself is in `@nodetool-ai/runtime-install`.
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
    getDesktopRuntimeHost(),
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

  const workerImportable = await canImportNodeToolWorker(
    getDesktopRuntimeHost(),
    pythonExecutablePath,
  );
  if (!workerImportable) {
    logMessage(
      `Python worker import check failed for ${pythonExecutablePath}; environment appears incomplete`,
      "error",
    );
  }

  return workerImportable;
}

/**
 * Install `nodetool-core` and any additional packages into the Python
 * runtime. See `installRequiredPythonPackages` in `@nodetool-ai/runtime-install`.
 */
async function installRequiredPythonPackages(
  additionalPackages: string[] = []
): Promise<void> {
  await installPythonCorePackages(getDesktopRuntimeHost(), additionalPackages);
}

/**
 * Get the default installation location based on platform
 */
function getDefaultInstallLocation(): string {
  const location = runtimeLocations({ ...process.env, NODETOOL_HOST: "desktop" }, {
    desktopUserData: app.getPath("userData"), settings: {}
  }).condaEnv;
  if (!location) { throw new Error("The desktop host requires a conda environment location"); }
  return location;
}
export {
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  installRequiredPythonPackages,
  getDefaultInstallLocation,
};
