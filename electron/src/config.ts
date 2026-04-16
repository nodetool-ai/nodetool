import * as path from "path";
import * as os from "os";
import { app } from "electron";
import { logMessage } from "./logger";
import * as fs from "fs";
import { readSettings, updateSetting } from "./settings";

// Base paths
const resourcesPath: string = process.resourcesPath;
const srcPath: string = __dirname;

const webPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "web", "dist");

// PID file configuration for server process management
// Note: E2E tests in tests/e2e/ must use the same paths for proper cleanup
const PID_DIRECTORY: string = path.join(app.getPath("temp"), "nodetool-electron");
const PID_FILE_PATH: string = path.join(PID_DIRECTORY, "server.pid");

// Returns a sane default install location if settings do not define CONDA_ENV
// IMPORTANT: These paths MUST match getDefaultInstallLocation() in python.ts
// to avoid looking in the wrong place when settings are unavailable
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
      // Use ~/nodetool_env to match getDefaultInstallLocation() in python.ts
      return path.join(os.homedir(), "nodetool_env");
    case "linux":
      return process.env.SUDO_USER
        ? "/opt/nodetool/conda_env"
        : path.join(os.homedir(), ".local/share/nodetool/conda_env");
    default:
      return path.join(os.homedir(), ".nodetool/conda_env");
  }
};

let cachedCondaEnvPath: string | null = null;

const getCondaEnvPath = (): string => {
  if (cachedCondaEnvPath !== null) {
    return cachedCondaEnvPath;
  }

  // In explicit dev mode, prefer an already-activated conda environment so
  // local Electron development can reuse the shell environment.
  if (process.env.NT_ELECTRON_DEV_MODE === "1") {
    const activeEnv = process.env.CONDA_PREFIX?.trim();
    if (activeEnv) {
      logMessage(`Using activated conda environment in dev mode: ${activeEnv}`);
      cachedCondaEnvPath = activeEnv;
      return activeEnv;
    }
  }

  let settings: Record<string, unknown> = {};
  try {
    settings = readSettings();
  } catch (error) {
    logMessage(
      `Failed to read settings, using default conda path. Error: ${error}`,
      "error"
    );
    const fallbackOnError = getDefaultCondaEnvPath();
    logMessage(`Conda path fallback: ${fallbackOnError}`);
    cachedCondaEnvPath = fallbackOnError;
    return fallbackOnError;
  }

  const condaPathFromSettings: unknown = settings["CONDA_ENV"];

  if (
    typeof condaPathFromSettings === "string" &&
    condaPathFromSettings.trim().length > 0
  ) {
    logMessage(`Conda env path: ${condaPathFromSettings}`);
    cachedCondaEnvPath = condaPathFromSettings;
    return condaPathFromSettings;
  }

  // CONDA_ENV not set - use default and persist it immediately to avoid future inconsistencies
  const fallbackPath = getDefaultCondaEnvPath();
  logMessage(
    `CONDA_ENV not set in settings. Using and persisting default path: ${fallbackPath}`
  );

  // Persist the default so it's always consistent going forward
  try {
    updateSetting("CONDA_ENV", fallbackPath);
  } catch (error) {
    logMessage(
      `Failed to persist default CONDA_ENV to settings: ${error}`,
      "warn"
    );
  }

  cachedCondaEnvPath = fallbackPath;
  return fallbackPath;
};

/**
 * Retrieves the path to the Node.js binary in the conda environment
 * @returns {string} Path to Node.js executable
 */
const findNodeInPath = (): string | null => {
  const exe = process.platform === "win32" ? "node.exe" : "node";
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    const full = path.join(dir, exe);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // not here, keep looking
    }
  }
  return null;
};

const getNodePath = (): string => {
  const condaNode =
    process.platform === "win32"
      ? path.join(getCondaEnvPath(), "node.exe")
      : path.join(getCondaEnvPath(), "bin", "node");
  try {
    fs.accessSync(condaNode);
    return condaNode;
  } catch {
    // conda env has no node — resolve full path from current process PATH
    return findNodeInPath() ?? (process.platform === "win32" ? "node.exe" : "node");
  }
};

/**
 * Retrieves the path to the Python executable
 * @returns {string} Path to Python executable
 */
const getPythonPath = (): string => {
  const condaPath = getCondaEnvPath();
  return process.platform === "win32"
    ? path.join(condaPath, "python.exe")
    : path.join(condaPath, "bin", "python");
};

/**
 * Retrieves the path to the uv package manager executable from the conda environment.
 */
const getUVPath = (): string => {
  const condaPath: string = getCondaEnvPath();
  return process.platform === "win32"
    ? path.join(condaPath, "Library", "bin", "uv.exe")
    : path.join(condaPath, "bin", "uv");
};

/**
 * Retrieves the path to the llama-server executable from the conda environment.
 */
const getLlamaServerPath = (): string => {
  const condaPath: string = getCondaEnvPath();
  return process.platform === "win32"
    ? path.join(condaPath, "Library", "bin", "llama-server.exe")
    : path.join(condaPath, "bin", "llama-server");
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

  const envKeysToClear = [
    "CONDA_PREFIX",
    "CONDA_DEFAULT_ENV",
    "CONDA_PROMPT_MODIFIER",
    "CONDA_SHLVL",
    "CONDA_EXE",
    "CONDA_PYTHON_EXE",
    "_CE_CONDA",
    "_CE_M",
    "VIRTUAL_ENV",
    "PYTHONHOME",
    "PYTHONPATH",
    "UV_PYTHON",
    "UV_PROJECT_ENVIRONMENT",
  ] as const;

  const clearedKeys = envKeysToClear.filter((key) => typeof baseEnv[key] === "string");
  for (const key of envKeysToClear) {
    delete baseEnv[key];
  }
  if (clearedKeys.length > 0) {
    logMessage(
      `Cleared inherited environment markers before launching bundled runtime: ${clearedKeys.join(", ")}`
    );
  }

  const pathSegmentsWin = [
    path.join(condaPath),
    path.join(condaPath, "Library", "mingw-w64", "bin"),
    path.join(condaPath, "Library", "usr", "bin"),
    path.join(condaPath, "Library", "bin"),
    path.join(condaPath, "Scripts"),
    baseEnv.PATH || "",
  ];
  const pathSegmentsUnix = [
    path.join(condaPath, "bin"),
    path.join(condaPath, "lib"),
    baseEnv.PATH || "",
  ];

  // Set HOME if not already set (needed on macOS for GUI processes)
  const homeDir = baseEnv.HOME || os.homedir();

  // HuggingFace cache: Use env var if set, otherwise default to ~/.cache/huggingface
  // This ensures consistency between Electron app and CLI usage
  const hfHome = baseEnv.HF_HOME || path.join(homeDir, ".cache", "huggingface");

  // UV cache: store inside userData so it's writable by the Electron app
  const userDataPath = app.getPath("userData");
  const uvCacheDir = path.join(userDataPath, "uv-cache");
  const xdgCacheHome = path.join(userDataPath, "cache");

  // Python path for the conda environment
  const pythonLibPath =
    process.platform === "win32"
      ? path.join(condaPath, "Lib", "site-packages")
      : path.join(condaPath, "lib");

  // Ensure cache directories exist
  try {
    fs.mkdirSync(hfHome, { recursive: true });
    fs.mkdirSync(uvCacheDir, { recursive: true });
    fs.mkdirSync(xdgCacheHome, { recursive: true });
  } catch (error) {
    logMessage(`Warning: Failed to create cache directories: ${error}`, "warn");
  }

  return {
    ...baseEnv,
    HOME: homeDir,
    HF_HOME: hfHome,
    PYTHONPATH: pythonLibPath,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    UV_CACHE_DIR: uvCacheDir,
    XDG_CACHE_HOME: xdgCacheHome,
    PATH:
      process.platform === "win32"
        ? pathSegmentsWin.filter(Boolean).join(path.delimiter)
        : pathSegmentsUnix.filter(Boolean).join(path.delimiter),
  };
};

/**
 * Resets the cached conda env path. Intended for use in tests only so that
 * each test case starts with a clean slate.
 */
const _resetCondaEnvCache = (): void => {
  cachedCondaEnvPath = null;
};

export {
  getCondaEnvPath,
  getNodePath,
  getPythonPath,
  getUVPath,
  getLlamaServerPath,
  getProcessEnv,
  getSystemDataPath,
  _resetCondaEnvCache,
  PID_FILE_PATH,
  PID_DIRECTORY,
  srcPath,
  webPath,
};
