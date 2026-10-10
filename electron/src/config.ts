import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { app } from "electron";
import { logMessage } from "./logger";
import * as fs from "fs";
import { readSettings, updateSetting } from "./settings";
import { getSystemDataPath } from "./systemPaths";
import { isString } from "./typePredicates";

// Base paths
const srcPath: string = __dirname;

const webPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "web", "dist");

// Built Chrome extension, surfaced to the server so the install-helper UI can
// reveal/zip it. Bundled as an app resource in packaged builds.
const extensionDistPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "chrome-extension")
  : path.join(__dirname, "..", "..", "chrome-extension", "dist");

// PID file of the backend this app launched. It lives in the per-user app
// data directory: on Linux the temp directory is the shared /tmp, where
// another account could plant or block the file.
const PID_DIRECTORY: string = app.getPath("userData");
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
    isString(condaPathFromSettings) &&
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
 * Retrieves the environment variables for the process
 * @returns {ProcessEnv} Environment variables
 */
interface ProcessEnv {
  [key: string]: string;
}

/**
 * Returns the default assets directory.
 * Matches backend config path precedence for compatibility.
 */
const getDefaultAssetsPath = (): string => {
  const assetFolder = process.env.ASSET_FOLDER;
  if (assetFolder) {
    return assetFolder;
  }

  const storagePath = process.env.STORAGE_PATH;
  if (storagePath) {
    return storagePath;
  }

  return getSystemDataPath("assets");
};

const getOptionalNodeModulesPath = (): string =>
  path.join(app.getPath("userData"), "optional-node", "node_modules");

/**
 * Cache directory `name` under `$XDG_CACHE_HOME`, unless only the one under
 * `~/.cache` holds data. `marker` names the subdirectory whose presence means
 * the cache holds data (the HF `hub`), else the directory itself counts.
 */
const resolveXdgCacheDir = (
  xdgCacheHome: string | undefined,
  legacyCacheHome: string,
  name: string,
  marker?: string
): string => {
  const legacyDir = path.join(legacyCacheHome, name);
  if (!xdgCacheHome) return legacyDir;
  const xdgDir = path.join(xdgCacheHome, name);
  if (xdgDir === legacyDir) return xdgDir;
  const hasData = (dir: string): boolean => {
    try {
      return fs.readdirSync(marker ? path.join(dir, marker) : dir).length > 0;
    } catch {
      return false;
    }
  };
  return hasData(legacyDir) && !hasData(xdgDir) ? legacyDir : xdgDir;
};

const getProcessEnv = (): ProcessEnv => {
  const condaPath: string = getCondaEnvPath();

  // Sanitize base env to include only string values
  const baseEnv: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isString(value)) {
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

  const clearedKeys = envKeysToClear.filter((key) => isString(baseEnv[key]));
  for (const key of envKeysToClear) {
    delete baseEnv[key];
  }
  if (clearedKeys.length > 0) {
    logMessage(
      `Cleared inherited environment markers before launching bundled runtime: ${clearedKeys.join(", ")}`
    );
  }

  const optionalNodeBin = path.join(
    app.getPath("userData"),
    "optional-node",
    "node_modules",
    ".bin"
  );

  // npm lifecycle scripts run through `sh -c node …`. A Finder-launched app on
  // macOS has only the launchd PATH, so the bundled node must be on PATH itself.
  // A script that calls `npm run …` needs an npm launcher there as well.
  const bundledNode = getBundledNodeBinary();
  const bundledNodeDir = bundledNode ? path.dirname(bundledNode) : "";
  const npmLauncherDir = ensureBundledNpmLaunchers() ?? "";

  const pathSegmentsWin = [
    bundledNodeDir,
    npmLauncherDir,
    path.join(condaPath),
    path.join(condaPath, "Library", "mingw-w64", "bin"),
    path.join(condaPath, "Library", "usr", "bin"),
    path.join(condaPath, "Library", "bin"),
    path.join(condaPath, "Scripts"),
    optionalNodeBin,
    baseEnv.PATH || "",
  ];
  const pathSegmentsUnix = [
    bundledNodeDir,
    npmLauncherDir,
    path.join(condaPath, "bin"),
    path.join(condaPath, "lib"),
    optionalNodeBin,
    baseEnv.PATH || "",
  ];

  // Set HOME if not already set (needed on macOS for GUI processes)
  const homeDir = baseEnv.HOME || os.homedir();

  // HuggingFace home: the user's HF_HOME, else where huggingface_hub puts it
  // ($XDG_CACHE_HOME/huggingface, else ~/.cache/huggingface), so the app, the
  // CLI and a Python script outside the app share one model cache. Flatpak
  // sets XDG_CACHE_HOME per app, so models downloaded before the app followed
  // XDG stay in ~/.cache. Keep using that cache until the XDG one has models.
  const legacyCacheHome = path.join(homeDir, ".cache");
  const hfHome =
    baseEnv.HF_HOME ||
    resolveXdgCacheDir(baseEnv.XDG_CACHE_HOME, legacyCacheHome, "huggingface", "hub");
  // llama.cpp follows XDG_CACHE_HOME only on Linux. The server's resolver
  // honours LLAMA_CACHE, so pin it to the legacy cache the same way.
  const llamaCache =
    !baseEnv.LLAMA_CACHE && process.platform === "linux" && baseEnv.XDG_CACHE_HOME
      ? resolveXdgCacheDir(baseEnv.XDG_CACHE_HOME, legacyCacheHome, "llama.cpp")
      : undefined;

  // UV cache: store inside userData so it's writable by the Electron app.
  // XDG_CACHE_HOME is deliberately left as the user has it: overriding it
  // split torch hub weights, llama.cpp downloads and other XDG caches between
  // the app and the CLI.
  const userDataPath = app.getPath("userData");
  const uvCacheDir = path.join(userDataPath, "uv-cache");

  // Python path for the conda environment
  const pythonLibPath =
    process.platform === "win32"
      ? path.join(condaPath, "Lib", "site-packages")
      : path.join(condaPath, "lib");

  // Ensure cache directories exist
  try {
    fs.mkdirSync(hfHome, { recursive: true });
    fs.mkdirSync(uvCacheDir, { recursive: true });
  } catch (error) {
    logMessage(`Warning: Failed to create cache directories: ${error}`, "warn");
  }

  const env: ProcessEnv = {
    ...baseEnv,
    HOME: homeDir,
    HF_HOME: hfHome,
    PYTHONPATH: pythonLibPath,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    UV_CACHE_DIR: uvCacheDir,
    NODETOOL_OPTIONAL_NODE_MODULES: getOptionalNodeModulesPath(),
    NODETOOL_EXTENSION_DIST: extensionDistPath,
    PATH:
      process.platform === "win32"
        ? pathSegmentsWin.filter(Boolean).join(path.delimiter)
        : pathSegmentsUnix.filter(Boolean).join(path.delimiter),
  };
  if (llamaCache) {
    env.LLAMA_CACHE = llamaCache;
  }
  return env;
};

/** How to invoke npm: the executable plus any args that must precede the npm subcommand. */
interface NpmInvocation {
  command: string;
  baseArgs: string[];
}

/** Bundled Node binary that ships next to the backend (packaged app only). */
const getBundledNodeBinary = (): string | null => {
  if (!app.isPackaged) return null;
  const bin = path.join(
    process.resourcesPath,
    "backend",
    "runtime",
    process.platform === "win32" ? "node.exe" : "node"
  );
  try {
    fs.accessSync(bin, fs.constants.X_OK);
    return bin;
  } catch {
    return null;
  }
};

/** npm CLI bundled next to the backend's Node runtime (packaged app only). */
const getBundledNpmCli = (): string | null => {
  if (!app.isPackaged) return null;
  // Mirrors NPM_CLI_RUNTIME_PATH in scripts/node-runtime.constants.cjs.
  const cli = path.join(
    process.resourcesPath,
    "backend",
    "runtime",
    "npm",
    "bin",
    "npm-cli.js"
  );
  try {
    fs.accessSync(cli);
    return cli;
  } catch {
    return null;
  }
};

const quotePosix = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Write `npm` and `npx` launchers that run the bundled npm with the bundled
 * Node, and return their directory. `runtime/npm` is the npm package itself,
 * not an executable, so without these a lifecycle script that calls
 * `npm run build` finds no npm on a GUI app's PATH. The launchers live in
 * userData because the signed app bundle is read-only. Returns null when the
 * app is unpackaged or the launchers cannot be written.
 */
const ensureBundledNpmLaunchers = (): string | null => {
  const node = getBundledNodeBinary();
  const npmCli = getBundledNpmCli();
  if (!node || !npmCli) return null;
  const dir = path.join(app.getPath("userData"), "runtime-bin");
  const clis = {
    npm: npmCli,
    npx: path.join(path.dirname(npmCli), "npx-cli.js"),
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, cli] of Object.entries(clis)) {
      const [file, content] =
        process.platform === "win32"
          ? [`${name}.cmd`, `@"${node}" "${cli}" %*\r\n`]
          : [name, `#!/bin/sh\nexec ${quotePosix(node)} ${quotePosix(cli)} "$@"\n`];
      const target = path.join(dir, file);
      let current: string | null = null;
      try {
        current = fs.readFileSync(target, "utf8");
      } catch {
        // Not written yet.
      }
      if (current !== content) {
        fs.writeFileSync(target, content);
      }
      if (process.platform !== "win32") {
        fs.chmodSync(target, 0o755);
      }
    }
    return dir;
  } catch (error) {
    logMessage(`Warning: Failed to write npm launchers: ${error}`, "warn");
    return null;
  }
};

/**
 * Resolve how to invoke npm. Prefers the npm bundled with the backend's Node
 * runtime — running `node npm-cli.js …` keeps JavaScript package installs
 * inside the NodeTool environment instead of depending on a system Node/npm on
 * a (GUI-stripped) PATH. Falls back to a system npm on PATH for dev/unpackaged
 * runs. Returns null when no npm can be found.
 */
const resolveNpmInvocation = (): NpmInvocation | null => {
  const node = getBundledNodeBinary();
  const cli = getBundledNpmCli();
  if (node && cli) {
    return { command: node, baseArgs: [cli] };
  }

  const candidates =
    process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], {
        stdio: "ignore",
        env: getProcessEnv(),
        shell: process.platform === "win32",
      });
      if (result.status === 0) return { command: candidate, baseArgs: [] };
    } catch {
      // continue
    }
  }
  return null;
};

/**
 * The `NODETOOL_LOCAL_FILE_ROOTS` the backend runs with.
 *
 * The server defaults to the user's home directory, which is the right
 * allowlist for a self-hosted deployment several people can reach. The desktop
 * app is the opposite case: it spawns the server as this user's own process on
 * loopback, and the user drags files onto the canvas from wherever they keep
 * them. Restricting only the *preview* left a dropped image from a folder
 * outside home running fine (the runner reads any absolute `file://` path) but
 * showing a broken image — nodetool-ai/nodetool#4999. `*` lifts the containment
 * check; the server's denylist for `.ssh`, `.aws` and friends still applies.
 *
 * A launching environment that set its own roots keeps them.
 */
const getLocalFileRootsEnv = (
  env: Record<string, string | undefined> = process.env
): string => env["NODETOOL_LOCAL_FILE_ROOTS"] || "*";

/**
 * Persists a new conda env location. The path is cached for the life of the
 * process, so writing only the setting would leave installs and status reads
 * on the old location until the next launch.
 */
const setCondaEnvPath = (location: string): void => {
  updateSetting("CONDA_ENV", location);
  cachedCondaEnvPath = location;
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
  setCondaEnvPath,
  getNodePath,
  getPythonPath,
  getUVPath,
  getProcessEnv,
  getLocalFileRootsEnv,
  resolveNpmInvocation,
  getSystemDataPath,
  getDefaultAssetsPath,
  getOptionalNodeModulesPath,
  _resetCondaEnvCache,
  PID_FILE_PATH,
  srcPath,
  webPath,
};
