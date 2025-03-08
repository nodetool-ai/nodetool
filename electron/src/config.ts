import * as path from "path";
import { app } from "electron";
import { logMessage } from "./logger";
import * as fs from "fs";
import { readSettings, updateSetting } from "./settings";

// Base paths
const resourcesPath: string = process.resourcesPath;
const srcPath: string = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "..", "src");

const userDataPath: string = app.getPath("userData");
const legacyCondaPath: string = path.join(userDataPath, "conda_env");
const webPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "web", "dist");
const appsPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "apps")
  : path.join(__dirname, "..", "..", "apps", "dist");

const PID_FILE_PATH: string = path.join(app.getPath("userData"), "server.pid");

const getCondaEnvPath = (): string => {
  const settings = readSettings();

  // Check if legacy path exists and settings doesn't have CONDA_ENV
  if (!settings.CONDA_ENV && fs.existsSync(legacyCondaPath)) {
    // Update settings with legacy path
    updateSetting("CONDA_ENV", legacyCondaPath);
    logMessage("Migrated legacy conda environment path to settings");
    return legacyCondaPath;
  }

  const condaPath: string = settings.CONDA_ENV || legacyCondaPath;

  return condaPath;
};

/**
 * Retrieves the path to the uv executable
 * @returns {string} Path to uv executable
 */
const getUVPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Library", "bin", "uv.exe")
    : path.join(getCondaEnvPath(), "bin", "uv");

/**
 * Retrieves the path to the Python executable
 * @returns {string} Path to Python executable
 */
const getPythonPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "python.exe")
    : path.join(getCondaEnvPath(), "bin", "python");

/**
 * Retrieves the path to the conda-unpack executable
 * @returns {string} Path to conda-unpack executable
 */
const getCondaUnpackPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Scripts", "conda-unpack.exe")
    : path.join(getCondaEnvPath(), "bin", "conda-unpack");

/**
 * Retrieves the environment variables for the process
 * @returns {ProcessEnv} Environment variables
 */
interface ProcessEnv {
  [key: string]: string;
}

const getProcessEnv = (): ProcessEnv => {
  const condaPath: string = getCondaEnvPath();

  return {
    ...process.env,
    PYTHONPATH: srcPath,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    PATH:
      process.platform === "win32"
        ? [
          path.join(condaPath),
          path.join(condaPath, "Library", "mingw-w64", "bin"),
          path.join(condaPath, "Library", "usr", "bin"),
          path.join(condaPath, "Library", "bin"),
          path.join(condaPath, "Lib", "site-packages", "torch", "lib"),
          path.join(condaPath, "Scripts"),
          process.env.PATH,
        ].join(path.delimiter)
        : [
          path.join(condaPath, "bin"),
          path.join(condaPath, "lib"),
          process.env.PATH,
        ].join(path.delimiter),
  };
};

export {
  getCondaEnvPath,
  getPythonPath,
  getUVPath,
  getCondaUnpackPath,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  webPath,
  appsPath,
};
