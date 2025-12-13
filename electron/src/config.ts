import * as path from "path";
import * as os from "os";
import { app } from "electron";
import { logMessage } from "./logger";
import * as fs from "fs";
import { readSettings, updateSetting } from "./settings";

// Base paths
const resourcesPath: string = process.resourcesPath;
const srcPath: string = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "..", "src");

const webPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "web", "dist");

const PID_DIRECTORY: string = path.join(app.getPath("temp"), "nodetool-electron");
const PID_FILE_PATH: string = path.join(PID_DIRECTORY, "server.pid");

const PLATFORM_SPECIFIC_LOCK_FILES: Partial<
  Record<NodeJS.Platform, Record<string, string>>
> = {
  darwin: {
    x64: "environment-osx-64.lock.yml",
    arm64: "environment-osx-arm64.lock.yml",
  },
  linux: {
    x64: "environment-linux-64.lock.yml",
    arm64: "environment-linux-aarch64.lock.yml",
  },
  win32: {
    x64: "environment-win-64.lock.yml",
  },
};

const FALLBACK_LOCK_FILE_NAME = "environment.lock.yml";

// Returns a sane default install location if settings do not define CONDA_ENV
const getDefaultCondaEnvPath = (): string => {
  switch (process.platform) {
    case "win32":
      return process.env.ALLUSERSPROFILE
        ? path.join(process.env.ALLUSERSPROFILE, "nodetool", "conda_env")
        : path.join(
            process.env.APPDATA ||
              path.join(os.homedir(), "AppData", "Roaming"),
            "nodetool",
            "conda_env"
          );
    case "darwin":
      return process.env.SUDO_USER
        ? path.join("/Library/Application Support/nodetool/conda_env")
        : path.join(
            os.homedir(),
            "Library/Application Support/nodetool/conda_env"
          );
    case "linux":
      return process.env.SUDO_USER
        ? "/opt/nodetool/conda_env"
        : path.join(os.homedir(), ".local/share/nodetool/conda_env");
    default:
      return path.join(os.homedir(), ".nodetool/conda_env");
  }
};

const getCondaEnvPath = (): string => {
  logMessage("=== Getting Conda Environment Path ===");

  let settings: Record<string, unknown> = {};
  try {
    settings = readSettings();
    logMessage(`Settings loaded: ${JSON.stringify(settings, null, 2)}`);
  } catch (error) {
    logMessage(
      `Failed to read settings, using default conda path. Error: ${error}`,
      "error"
    );
    const fallbackOnError = getDefaultCondaEnvPath();
    logMessage(`Conda path fallback (readSettings error): ${fallbackOnError}`);
    return fallbackOnError;
  }

  const condaPathFromSettings: unknown = settings["CONDA_ENV"];

  if (
    typeof condaPathFromSettings === "string" &&
    condaPathFromSettings.trim().length > 0
  ) {
    logMessage(`Final conda path (from settings): ${condaPathFromSettings}`);
    return condaPathFromSettings;
  }

  const fallbackPath = getDefaultCondaEnvPath();
  logMessage(
    `CONDA_ENV not set in settings. Using default path: ${fallbackPath}`
  );
  return fallbackPath;
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
  const pythonPath =
    process.platform === "win32"
      ? path.join(condaPath, "python.exe")
      : path.join(condaPath, "bin", "python");

  logMessage(`getPythonPath() - condaPath: ${condaPath}`);
  logMessage(`getPythonPath() - pythonPath: ${pythonPath}`);

  return pythonPath;
};

/**
 * Retrieves the path to the Ollama executable from the conda environment.
 * Note: Actual presence is ensured at runtime by ensureOllamaInstalled().
 */
const getOllamaPath = (): string => {
  const condaPath: string = getCondaEnvPath();
  return process.platform === "win32"
    ? path.join(condaPath, "Scripts", "ollama.exe")
    : path.join(condaPath, "bin", "ollama");
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
 * Retrieves the path to the locked micromamba environment manifest
 */
const resolvePlatformLockFileName = (): string => {
  const platformLockMap = PLATFORM_SPECIFIC_LOCK_FILES[process.platform];
  if (!platformLockMap) {
    logMessage(
      `No platform-specific lock map for platform ${process.platform}, using fallback.`
    );
    return FALLBACK_LOCK_FILE_NAME;
  }

  const lockForArch = platformLockMap[process.arch];
  if (lockForArch) {
    return lockForArch;
  }

  logMessage(
    `No lock file entry for ${process.platform}/${process.arch}, falling back to ${FALLBACK_LOCK_FILE_NAME}`
  );
  return FALLBACK_LOCK_FILE_NAME;
};

const getCondaLockFilePath = (): string => {
  const lockFileName = resolvePlatformLockFileName();

  const resourcesRoot =
    typeof process.resourcesPath === "string"
      ? process.resourcesPath
      : path.join(__dirname, "..", "resources");

  const packagedPath = path.join(resourcesRoot, lockFileName);
  if (app.isPackaged) {
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }

    logMessage(
      `Expected packaged lock file ${packagedPath} not found. Falling back to ${FALLBACK_LOCK_FILE_NAME}.`
    );
    return path.join(resourcesRoot, FALLBACK_LOCK_FILE_NAME);
  }

  const devPath = path.join(__dirname, "..", "resources", lockFileName);
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  logMessage(
    `Expected dev lock file ${devPath} not found. Falling back to ${FALLBACK_LOCK_FILE_NAME}.`
  );
  return path.join(__dirname, "..", "resources", FALLBACK_LOCK_FILE_NAME);
};

/**
 * Retrieves the environment variables for the process
 * @returns {ProcessEnv} Environment variables
 */
interface ProcessEnv {
  [key: string]: string;
}

/**
 * Returns the system data path matching Python's get_system_data_path() function
 * This ensures logs are stored in the same location as the Python backend expects
 * @param filename - The filename or subdirectory to append
 * @returns {string} The full path to the data directory
 */
const getSystemDataPath = (filename: string): string => {
  const homeDir = os.homedir();

  switch (process.platform) {
    case "darwin":
    case "linux":
      return path.join(homeDir, ".local", "share", "nodetool", filename);
    case "win32": {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        return path.join(localAppData, "nodetool", filename);
      }
      return path.join("data", filename);
    }
    default:
      return path.join("data", filename);
  }
};

const getProcessEnv = (): ProcessEnv => {
  const condaPath: string = getCondaEnvPath();

  // Sanitize base env to include only string values
  const baseEnv: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      baseEnv[key] = value;
    }
  }

  const pathSegmentsWin = [
    path.join(condaPath),
    path.join(condaPath, "Library", "mingw-w64", "bin"),
    path.join(condaPath, "Library", "usr", "bin"),
    path.join(condaPath, "Library", "bin"),
    path.join(condaPath, "Lib", "site-packages", "torch", "lib"),
    path.join(condaPath, "Scripts"),
    baseEnv.PATH || "",
  ];
  const pathSegmentsUnix = [
    path.join(condaPath, "bin"),
    path.join(condaPath, "lib"),
    baseEnv.PATH || "",
  ];

  return {
    ...baseEnv,
    PYTHONPATH: srcPath,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    PATH:
      process.platform === "win32"
        ? pathSegmentsWin.filter(Boolean).join(path.delimiter)
        : pathSegmentsUnix.filter(Boolean).join(path.delimiter),
  };
};

export {
  getCondaEnvPath,
  getPythonPath,
  getUVPath,
  getOllamaPath,
  getOllamaModelsPath,
  getCondaLockFilePath,
  getProcessEnv,
  getSystemDataPath,
  srcPath,
  PID_FILE_PATH,
  PID_DIRECTORY,
  webPath,
};
