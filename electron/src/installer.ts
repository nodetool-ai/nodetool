/**
 * The desktop installer's prompts and IPC: the install-location wizard and
 * the folder picker. The conda environment and micromamba work is in
 * `@nodetool-ai/runtime-install`; the functions below bind it to the app.
 */
import path from "path";
import { BrowserWindow, dialog } from "electron";
import {
  ensureCondaEnvironment as ensureEnvironment,
  installCondaPackages,
  removeCondaPackages,
} from "@nodetool-ai/runtime-install";

import { getDefaultInstallLocation } from "./python";
import { logMessage } from "./logger";
import { errorMessage } from "./utils";
import { updateSettings } from "./settings";
import { InstallToLocationData, IpcChannels } from "./types.d";
import { createIpcMainHandler } from "./ipc";
import { isString } from "./typePredicates";
import { getDesktopRuntimeHost } from "./runtimeHost";

interface InstallationPreferences {
  location: string;
}

interface InstallationSelection extends InstallationPreferences {
  installLlamaCpp?: boolean;
}

function normalizeInstallLocation(location: unknown): string {
  if (!isString(location) || location.trim().length === 0) {
    return getDefaultInstallLocation();
  }
  return location.trim();
}

function persistInstallationPreferences(
  location: unknown,
): InstallationPreferences {
  const normalizedLocation = normalizeInstallLocation(location);

  try {
    updateSettings({
      CONDA_ENV: normalizedLocation,
    });
    logMessage(
      `Persisted installer preferences: location=${normalizedLocation}`
    );
  } catch (error) {
    logMessage(
      `Failed to persist installer preferences: ${
        errorMessage(error)
      }`,
      "error"
    );
  }

  return {
    location: normalizedLocation,
  };
}

/**
 * Prompt for install location
 * @returns The path to the install location
 */
async function promptForInstallLocation(
  defaults?: InstallationPreferences
): Promise<InstallationSelection> {
  const defaultLocation = defaults?.location ?? getDefaultInstallLocation();

  return new Promise<InstallationSelection>((resolve, reject) => {
    createIpcMainHandler(
      IpcChannels.INSTALL_TO_LOCATION,
      async (
        _event,
        {
          location,
          installLlamaCpp,
        }: InstallToLocationData
      ) => {
        const preferences = persistInstallationPreferences(location);
        resolve({
          ...preferences,
          installLlamaCpp,
        });
      }
    );

    let mainWindow = BrowserWindow.getFocusedWindow();

    if (!mainWindow) {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length > 0) {
        mainWindow = allWindows[0];
      }
    }

    if (!mainWindow) {
      reject(new Error("No active window found"));
      return;
    }

    mainWindow.webContents.send(IpcChannels.INSTALL_LOCATION_PROMPT, {
      defaultPath: defaultLocation,
    });
  });
}

createIpcMainHandler(IpcChannels.SELECT_CUSTOM_LOCATION, async (_event) => {
  const defaultLocation = getDefaultInstallLocation();
  const { filePaths, canceled } = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Select the folder to install the Python environment to",
    buttonLabel: "Select Folder",
    defaultPath: defaultLocation,
  });

  if (canceled || !filePaths?.[0]) {
    return null;
  }

  return path.join(filePaths[0], "nodetool-python");
});

/**
 * Install conda package specs into the existing conda environment. Used by
 * the package manager to install packages like yt-dlp on demand.
 */
async function installCondaPackageBySpec(
  envPrefix: string,
  packageSpecs: string[],
  progressLabel?: string,
): Promise<void> {
  await installCondaPackages(getDesktopRuntimeHost(), envPrefix, packageSpecs, progressLabel);
}

/** Remove conda packages from the existing conda environment. */
async function removeCondaPackageBySpec(
  envPrefix: string,
  packageNames: string[],
  progressLabel?: string,
): Promise<void> {
  await removeCondaPackages(getDesktopRuntimeHost(), envPrefix, packageNames, progressLabel);
}

/** Set the conda environment install location in settings. */
function setCondaInstallLocation(location: string): void {
  getDesktopRuntimeHost().setCondaEnvPath(location);
}

/**
 * Ensure a conda environment exists, creating a minimal one if needed. If
 * the env doesn't exist and no location is recorded, the user is asked for
 * the install folder. Returns the conda env path.
 */
async function ensureCondaEnvironment(installLocation?: string): Promise<string> {
  return ensureEnvironment(getDesktopRuntimeHost(), installLocation);
}

export {
  promptForInstallLocation,
  ensureCondaEnvironment,
  installCondaPackageBySpec,
  removeCondaPackageBySpec,
  setCondaInstallLocation,
};
