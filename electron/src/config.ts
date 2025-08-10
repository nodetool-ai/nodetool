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
  logMessage("=== Getting Conda Environment Path ===");
  console.log("Getting conda environment path...");
  
  const settings = readSettings();
  logMessage(`Settings loaded: ${JSON.stringify(settings, null, 2)}`);
  console.log(`Settings:`, settings);

  // Check if legacy path exists and settings doesn't have CONDA_ENV
  logMessage(`Checking legacy path: ${legacyCondaPath}`);
  console.log(`Legacy path: ${legacyCondaPath}`);
  
  if (!settings.CONDA_ENV && fs.existsSync(legacyCondaPath)) {
    logMessage("Legacy conda environment path found, migrating to settings");
    console.log("Legacy conda environment path found, migrating to settings");
    // Update settings with legacy path
    updateSetting("CONDA_ENV", legacyCondaPath);
    logMessage("Migrated legacy conda environment path to settings");
    return legacyCondaPath;
  }

  const condaPath: string = settings.CONDA_ENV || legacyCondaPath;
  logMessage(`Final conda path: ${condaPath}`);
  console.log(`Final conda path: ${condaPath}`);

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
const getPythonPath = (): string => {
  const condaPath = getCondaEnvPath();
  const pythonPath = process.platform === "win32"
    ? path.join(condaPath, "python.exe")
    : path.join(condaPath, "bin", "python");
  
  logMessage(`getPythonPath() - condaPath: ${condaPath}`);
  logMessage(`getPythonPath() - pythonPath: ${pythonPath}`);
  console.log(`getPythonPath() - condaPath: ${condaPath}, pythonPath: ${pythonPath}`);
  
  return pythonPath;
};

/**
 * Retrieves the path to the Ollama executable from the conda environment only.
 * @returns {string} Path to Ollama executable
 */
const getOllamaPath = (): string => {
  const condaPath: string = getCondaEnvPath();
  const ollamaPath = process.platform === "win32"
    ? path.join(condaPath, "Scripts", "ollama.exe")
    : path.join(condaPath, "bin", "ollama");

  logMessage(`getOllamaPath() - condaPath: ${condaPath}`);
  logMessage(`getOllamaPath() - resolved: ${ollamaPath}`);
  return ollamaPath;
};

/**
 * Returns the per-OS models directory to use for Ollama.
 * macOS/Linux: ~/.ollama/models
 * Windows: C:\\Users\\<User>\\.ollama\\models
 */
const getOllamaModelsPath = (): string => {
  const homeDir = app.getPath("home");
  return path.join(homeDir, ".ollama", "models");
};

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
  getOllamaPath,
  getOllamaModelsPath,
  getCondaUnpackPath,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  webPath,
  appsPath,
};
