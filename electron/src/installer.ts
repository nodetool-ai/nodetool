import { promises as fs, writeFileSync } from "fs";
import type { Stats } from "fs";
import * as http from "http";
import * as https from "https";
import { app, dialog } from "electron";
import {
  getDefaultInstallLocation,
  installRequiredPythonPackages,
  runCommand,
} from "./python";
import { getCondaEnvPath } from "./config";

import { logMessage } from "./logger";
import path from "path";
import {
  readSettings,
  updateSettings,
  updateSetting,
  getModelServiceStartupDefaults,
} from "./settings";
import { emitBootMessage, emitServerLog, emitUpdateProgress } from "./events";
import os from "os";
import { fileExists } from "./utils";
import { spawn, spawnSync } from "child_process";
import { BrowserWindow } from "electron";
// Lock file no longer used — packages are specified directly via runtime configuration
import { InstallToLocationData, IpcChannels, ModelBackend } from "./types.d";
import { createIpcMainHandler } from "./ipc";

const CUDA_LLAMA_SPEC = "llama.cpp=*=cuda126*";
const CPU_LLAMA_SPEC = "llama.cpp";
const CONDA_CHANNELS = ["conda-forge"];
const MICROMAMBA_ENV_VAR = "MICROMAMBA_EXE";
const MICROMAMBA_BIN_DIR_NAME = "bin";
const MICROMAMBA_EXECUTABLE_NAME =
  process.platform === "win32" ? "micromamba.exe" : "micromamba";
const MICROMAMBA_BUNDLED_DIR_NAME = "micromamba";
const MODEL_BACKEND_SETTING_KEY = "MODEL_BACKEND";
const MICROMAMBA_LOCK_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MICROMAMBA_LOCK_ERROR_PATTERN = /could not set lock|cannot lock/i;
const DEFAULT_MAMBA_HOME_DIR = ".mamba";

interface InstallationPreferences {
  location: string;
  modelBackend: ModelBackend;
}

interface InstallationSelection extends InstallationPreferences {
  installLlamaCpp?: boolean;
  startLlamaCppOnStartup?: boolean;
}

function normalizeModelBackend(backend: unknown): ModelBackend {
  if (backend === "ollama" || backend === "llama_cpp" || backend === "none") {
    return backend;
  }
  // Default to ollama if not specified, or fallback to safe default
  return "ollama";
}

function normalizeInstallLocation(location: unknown): string {
  if (location == null || typeof location !== "string" || location.trim().length === 0) {
    return getDefaultInstallLocation();
  }
  return location.trim();
}

function persistInstallationPreferences(
  location: unknown,
  modelBackend: unknown,
  startupSettings?: {
    startLlamaCppOnStartup?: unknown;
  }
): InstallationPreferences {
  const normalizedLocation = normalizeInstallLocation(location);
  const normalizedBackend = normalizeModelBackend(modelBackend);
  const startupDefaults = getModelServiceStartupDefaults(normalizedBackend);
  const startLlamaCppOnStartup =
    typeof startupSettings?.startLlamaCppOnStartup === "boolean"
      ? startupSettings.startLlamaCppOnStartup
      : startupDefaults.startLlamaCppOnStartup;

  try {
    updateSettings({
      CONDA_ENV: normalizedLocation,
      [MODEL_BACKEND_SETTING_KEY]: normalizedBackend,
      START_LLAMA_CPP_ON_STARTUP: startLlamaCppOnStartup,
    });
    logMessage(
      `Persisted installer preferences: location=${normalizedLocation}, backend=${normalizedBackend}`
    );
  } catch (error) {
    logMessage(
      `Failed to persist installer preferences: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "error"
    );
  }

  return {
    location: normalizedLocation,
    modelBackend: normalizedBackend,
  };
}

function readInstallationPreferences(): InstallationPreferences {
  try {
    const settings = readSettings();
    const location = normalizeInstallLocation(settings["CONDA_ENV"]);
    const modelBackend = normalizeModelBackend(
      settings[MODEL_BACKEND_SETTING_KEY as keyof typeof settings]
    );
    return { location, modelBackend };
  } catch (error) {
    logMessage(
      `Unable to read installer preferences, using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warn"
    );
    return {
      location: getDefaultInstallLocation(),
      modelBackend: "ollama",
    };
  }
}

/**
 * Prompt for install location
 * @returns The path to the install location
 */
async function promptForInstallLocation(
  defaults?: InstallationPreferences
): Promise<InstallationSelection> {
  const defaultLocation = defaults?.location ?? getDefaultInstallLocation();
  // Use defaultBackend if you want to pass it to the renderer
  const defaultBackend = defaults?.modelBackend ?? "ollama";

  return new Promise<InstallationSelection>((resolve, reject) => {
    createIpcMainHandler(
      IpcChannels.INSTALL_TO_LOCATION,
      async (
        _event,
        {
          location,
          modelBackend,
          installLlamaCpp,
          startLlamaCppOnStartup,
        }: InstallToLocationData
      ) => {
        const preferences = persistInstallationPreferences(
          location,
          modelBackend,
          {
            startLlamaCppOnStartup,
          }
        );
        resolve({
          ...preferences,
          installLlamaCpp,
          startLlamaCppOnStartup:
            typeof startLlamaCppOnStartup === "boolean"
              ? startLlamaCppOnStartup
              : undefined,
        });
      }
    );

    // Send the prompt data to the renderer process
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

function getMicromambaRootPrefix(): string {
  return path.join(app.getPath("userData"), "micromamba");
}

function getMicromambaBinDir(): string {
  return path.join(getMicromambaRootPrefix(), MICROMAMBA_BIN_DIR_NAME);
}

function getMicromambaExecutablePath(): string {
  return path.join(getMicromambaBinDir(), MICROMAMBA_EXECUTABLE_NAME);
}

function getPotentialMicromambaRootPrefixes(): string[] {
  const prefixes = new Set<string>();
  prefixes.add(getMicromambaRootPrefix());

  const envPrefix = process.env.MAMBA_ROOT_PREFIX?.trim();
  if (envPrefix) {
    prefixes.add(envPrefix);
  }

  const homeDir = os.homedir();
  if (homeDir) {
    prefixes.add(path.join(homeDir, DEFAULT_MAMBA_HOME_DIR));
  }

  return Array.from(prefixes);
}

function getMicromambaLockPaths(): string[] {
  return getPotentialMicromambaRootPrefixes().map((prefix) =>
    path.join(prefix, "pkgs", "pkgs.lock")
  );
}

async function removeStaleMicromambaLock(
  lockPath: string,
  options?: { force?: boolean }
): Promise<void> {
  let stats: Stats | null = null;

  try {
    stats = await fs.stat(lockPath);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    logMessage(
      `Failed to inspect micromamba lock at ${lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warn"
    );
    if (!options?.force) {
      return;
    }
  }

  if (!options?.force && stats) {
    const lockAgeMs = Date.now() - stats.mtimeMs;
    if (lockAgeMs < MICROMAMBA_LOCK_STALE_THRESHOLD_MS) {
      return;
    }
  }

  try {
    await fs.rm(lockPath, { force: true });
    if (options?.force) {
      if (stats) {
        const ageSeconds = Math.round((Date.now() - stats.mtimeMs) / 1000);
        logMessage(
          `Force-removed micromamba lock (${ageSeconds}s old) at ${lockPath}`,
          "warn"
        );
      } else {
        logMessage(`Force-removed micromamba lock at ${lockPath}`, "warn");
      }
    } else if (stats) {
      const ageSeconds = Math.round((Date.now() - stats.mtimeMs) / 1000);
      logMessage(
        `Removed stale micromamba lock (${ageSeconds}s old) at ${lockPath}`
      );
    }
  } catch (error) {
    logMessage(
      `Failed to remove micromamba lock at ${lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warn"
    );
  }
}

async function cleanupMicromambaLocks(force = false): Promise<void> {
  const lockPaths = getMicromambaLockPaths();
  for (const lockPath of lockPaths) {
    await removeStaleMicromambaLock(lockPath, { force });
  }
}

function sanitizeProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function validateMicromambaExecutableCandidate(
  candidate: string | undefined | null
): string {
  if (!candidate) {
    return "";
  }

  try {
    const resolved = spawnSync(candidate, ["--version"], {
      stdio: "ignore",
    });

    if (resolved.status === 0) {
      return candidate;
    }
  } catch {
    // Ignore and continue searching
  }

  return "";
}

function resolveExplicitMicromambaExecutable(): string {
  const explicit = process.env[MICROMAMBA_ENV_VAR]?.trim();
  return validateMicromambaExecutableCandidate(explicit);
}

function detectMicromambaExecutable(): string {
  const candidates = ["micromamba"];

  for (const executable of candidates) {
    const resolved = validateMicromambaExecutableCandidate(executable);
    if (resolved) {
      return resolved;
    }
  }

  return "";
}

function getCandidateMicromambaResourceDirs(): string[] {
  const dirs = new Set<string>();

  if (app.isPackaged) {
    dirs.add(process.resourcesPath);
  } else {
    dirs.add(path.join(app.getAppPath(), "resources"));
    dirs.add(path.resolve(__dirname, "..", "resources"));
  }

  return Array.from(dirs);
}

async function findBundledMicromambaExecutable(): Promise<string | null> {
  const binaryName = MICROMAMBA_EXECUTABLE_NAME;
  const platform = process.platform;
  const arch = process.arch;
  
  // Map platform/arch to micromamba directory structure
  let platformDir: string;
  if (platform === "win32") {
    platformDir = "win-64";
  } else if (platform === "darwin") {
    platformDir = arch === "arm64" ? "osx-arm64" : "osx-64";
  } else if (platform === "linux") {
    platformDir = arch === "arm64" ? "linux-aarch64" : "linux-64";
  } else {
    return null;
  }

  for (const baseDir of getCandidateMicromambaResourceDirs()) {
    // Check platform-specific directory first
    const platformSpecificPath = path.join(
      baseDir,
      MICROMAMBA_BUNDLED_DIR_NAME,
      platformDir,
      platform === "win32" ? "Library/bin/micromamba.exe" : "bin/micromamba"
    );
    if (await fileExists(platformSpecificPath)) {
      return platformSpecificPath;
    }
    
    // Fallback to old structure (for backward compatibility)
    const legacyPath = path.join(
      baseDir,
      MICROMAMBA_BUNDLED_DIR_NAME,
      binaryName
    );
    if (await fileExists(legacyPath)) {
      return legacyPath;
    }
  }

  return null;
}

async function ensureMicromambaAvailable(): Promise<string> {
  const explicitExecutable = resolveExplicitMicromambaExecutable();
  if (explicitExecutable) {
    logMessage(`Using micromamba from ${explicitExecutable}`);
    return explicitExecutable;
  }

  const bundledExecutable = await findBundledMicromambaExecutable();
  if (bundledExecutable) {
    logMessage(`Using bundled micromamba at ${bundledExecutable}`);
    process.env[MICROMAMBA_ENV_VAR] = bundledExecutable;
    return bundledExecutable;
  }

  const detectedExecutable = detectMicromambaExecutable();
  if (detectedExecutable) {
    logMessage(`Using micromamba from system PATH: ${detectedExecutable}`);
    return detectedExecutable;
  }

  const localExecutable = getMicromambaExecutablePath();
  if (await fileExists(localExecutable)) {
    logMessage(`Using previously installed micromamba at ${localExecutable}`);
    process.env[MICROMAMBA_ENV_VAR] = localExecutable;
    return localExecutable;
  }

  // Download micromamba on demand
  logMessage("micromamba not found locally — downloading on demand...");
  emitBootMessage("Downloading micromamba...");
  const downloadedExecutable = await downloadMicromamba();
  process.env[MICROMAMBA_ENV_VAR] = downloadedExecutable;
  return downloadedExecutable;
}

const MICROMAMBA_VERSION = "2.3.3-0";
const MICROMAMBA_BASE_URL = `https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}`;

function resolveMicromambaDownloadUrl(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    return arch === "arm64"
      ? `${MICROMAMBA_BASE_URL}/micromamba-osx-arm64`
      : `${MICROMAMBA_BASE_URL}/micromamba-osx-64`;
  }
  if (platform === "linux") {
    return arch === "arm64"
      ? `${MICROMAMBA_BASE_URL}/micromamba-linux-aarch64`
      : `${MICROMAMBA_BASE_URL}/micromamba-linux-64`;
  }
  if (platform === "win32" && arch === "x64") {
    return `${MICROMAMBA_BASE_URL}/micromamba-win-64.exe`;
  }
  return null;
}

function downloadFileFromUrl(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const makeRequest = (requestUrl: string): void => {
      const protocol = requestUrl.startsWith("https") ? https : http;
      const req = protocol.get(requestUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.destroy();
          makeRequest(res.headers.location);
          return;
        }
        if (!res.statusCode || res.statusCode !== 200) {
          res.destroy();
          if (!resolved) { resolved = true; reject(new Error(`HTTP ${res.statusCode} downloading micromamba`)); }
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (resolved) return;
          try {
            const buf = Buffer.concat(chunks);
            writeFileSync(dest, buf);
            resolved = true;
            resolve();
          } catch (err) {
            resolved = true;
            reject(err);
          }
        });
        res.on("error", (err: Error) => { if (!resolved) { resolved = true; reject(err); } });
      });
      req.on("error", (err: Error) => { if (!resolved) { resolved = true; reject(err); } });
      req.setTimeout(60000, () => { req.destroy(); if (!resolved) { resolved = true; reject(new Error("Download timeout")); } });
    };

    makeRequest(url);
  });
}

async function downloadMicromamba(): Promise<string> {
  const url = resolveMicromambaDownloadUrl();
  if (!url) {
    throw new Error(`No micromamba download URL for platform ${process.platform}/${process.arch}`);
  }

  const dest = getMicromambaExecutablePath();
  await fs.mkdir(getMicromambaBinDir(), { recursive: true });

  logMessage(`Downloading micromamba from ${url} to ${dest}`);
  await downloadFileFromUrl(url, dest);

  if (process.platform !== "win32") {
    await fs.chmod(dest, 0o755);
  }

  logMessage(`micromamba downloaded to ${dest}`);
  emitBootMessage("micromamba ready");
  return dest;
}

async function runMicromambaCommand(
  micromambaExecutable: string,
  args: string[],
  progressAction: string
): Promise<void> {
  if (!micromambaExecutable) {
    throw new Error("micromamba executable path is empty");
  }

  await fs.mkdir(getMicromambaRootPrefix(), { recursive: true });

  const env = sanitizeProcessEnv();
  env.MAMBA_ROOT_PREFIX = getMicromambaRootPrefix();

  if (!env.HOME) {
    env.HOME = os.homedir();
  }

  if (process.platform === "win32") {
    const homeDir = env.HOME || os.homedir();
    if (homeDir) {
      env.USERPROFILE = env.USERPROFILE || homeDir;

      const parsedHome = path.win32.parse(homeDir);
      const drive = parsedHome.root?.replace(/\\$/, "");
      if (drive) {
        env.HOMEDRIVE = env.HOMEDRIVE || drive;
        const relativePath = homeDir.substring(parsedHome.root.length);
        if (relativePath) {
          env.HOMEPATH =
            env.HOMEPATH || `\\${relativePath.replace(/^\\+/, "")}`;
        }
      }
    }
  }

  const runOnce = async (): Promise<void> => {
    logMessage(
      `Running micromamba command: ${micromambaExecutable} ${args.join(" ")}`
    );

    emitBootMessage(`${progressAction}...`);
    emitUpdateProgress("Python environment", 10, progressAction, "Resolving");

    await cleanupMicromambaLocks(true);

    await executeMicromambaCommand(
      micromambaExecutable,
      args,
      env,
      progressAction
    );
  };

  try {
    await runOnce();
  } catch (error) {
    if ((error as MicromambaCommandError)?.lockErrorDetected) {
      logMessage(
        "micromamba reported a lock error, forcing lock cleanup and retrying",
        "warn"
      );
      await cleanupMicromambaLocks(true);
      await runOnce();
    } else {
      throw error;
    }
  }
}

interface MicromambaCommandError extends Error {
  lockErrorDetected?: boolean;
}

async function executeMicromambaCommand(
  micromambaExecutable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  progressAction: string
): Promise<void> {
  const micromambaProcess = spawn(micromambaExecutable, args, {
    env,
    stdio: "pipe",
    // Prevent a console window from flashing on Windows while micromamba runs.
    windowsHide: true,
  });

  let lockErrorDetected = false;

  return new Promise<void>((resolve, reject) => {
    micromambaProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const message = `micromamba stdout: ${line}`;
        logMessage(message);
        emitServerLog(message);
      }
    });

    micromambaProcess.stderr?.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const message = `micromamba stderr: ${line}`;
        logMessage(message, "error");
        emitServerLog(message);
        if (MICROMAMBA_LOCK_ERROR_PATTERN.test(line)) {
          lockErrorDetected = true;
        }
      }
    });

    micromambaProcess.on("exit", (code) => {
      if (code === 0) {
        emitUpdateProgress("Python environment", 100, progressAction, "Done");
        resolve();
      } else {
        const error: MicromambaCommandError = new Error(
          `micromamba exited with code ${code}`
        );
        if (lockErrorDetected) {
          error.lockErrorDetected = true;
        }
        reject(error);
      }
    });

    micromambaProcess.on("error", (err) => {
      reject(new Error(`Failed to run micromamba: ${err.message}`));
    });
  });
}

/**
 * Minimal bootstrap packages for creating an empty conda environment.
 * Individual runtimes are installed on-demand via installCondaPackageBySpec().
 */
const BOOTSTRAP_CONDA_PACKAGES = [
  "ca-certificates",
];

async function createEnvironmentWithMicromamba(
  micromambaExecutable: string,
  destinationPrefix: string,
  packages: string[],
): Promise<void> {
  if (!micromambaExecutable) {
    throw new Error("micromamba executable path is empty");
  }

  emitBootMessage("Creating conda environment with micromamba...");

  if (await fileExists(destinationPrefix)) {
    logMessage(`Removing existing environment at ${destinationPrefix}`);
    await fs.rm(destinationPrefix, { recursive: true, force: true });
  }

  await fs.mkdir(path.dirname(destinationPrefix), { recursive: true });

  const args = [
    "create",
    "--yes",
    "--prefix",
    destinationPrefix,
    ...packages,
    "--override-channels",
    "--strict-channel-priority",
  ];
  for (const channel of CONDA_CHANNELS) {
    args.push("--channel", channel);
  }

  await runMicromambaCommand(
    micromambaExecutable,
    args,
    "Creating Python environment"
  );
}

async function provisionCondaEnvironment(
  location: string,
  modelBackend: ModelBackend,
  options?: {
    bootMessage?: string;
    installLlamaCpp?: boolean;
  }
): Promise<void> {
  const bootMessage =
    options?.bootMessage ?? "Setting up conda environment...";

  emitBootMessage(bootMessage);
  logMessage(`Setting up conda environment at: ${location} (Backend: ${modelBackend})`);

  const micromambaExecutable = await ensureMicromambaAvailable();

  await createEnvironmentWithMicromamba(
    micromambaExecutable,
    location,
    BOOTSTRAP_CONDA_PACKAGES,
  );

  const condaEnvPath = location;
  await installCondaPackages(micromambaExecutable, condaEnvPath, modelBackend, {
    installLlamaCpp: options?.installLlamaCpp,
  });

  await installRequiredPythonPackages();

  const shouldInstallLlamaCpp =
    options?.installLlamaCpp ?? modelBackend === "llama_cpp";
  if (shouldInstallLlamaCpp) {
    await ensureLlamaCppInstalled(condaEnvPath);
  }

  logMessage("Conda environment installation completed successfully");
  emitBootMessage("Conda environment is ready");
}

/**
 * Conda Environment Installer Module
 *
 * This module handles the installation of the conda environment for Nodetool.
 * A minimal bootstrap env is created via `ensureCondaEnvironment()`, and
 * individual runtimes are installed on-demand via `installCondaPackageBySpec()`.
 *
 * Key Features:
 * - Creates a minimal conda environment with BOOTSTRAP_CONDA_PACKAGES
 * - Provides interactive installation location selection
 * - Streams micromamba output for visibility into long-running operations
 * - Handles environment initialization and required dependency installation
 *
 * Installation Process:
 * 1. `ensureCondaEnvironment()` creates a minimal env if none exists
 * 2. `installCondaPackageBySpec()` installs runtime-specific packages on demand
 * 3. `provisionCondaEnvironment()` (legacy) creates env with backend packages
 */

/**
 * Install the Python environment
 */
async function installCondaEnvironment(): Promise<void> {
  try {
    logMessage("Prompting for install location");
    const persistedPreferences = readInstallationPreferences();
    const { location, modelBackend, installLlamaCpp } =
      await promptForInstallLocation(persistedPreferences);
    await provisionCondaEnvironment(location, modelBackend, {
      installLlamaCpp,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logMessage(
      `Failed to install Python environment: ${errorMessage}`,
      "error"
    );
    // Provide a consolidated, user-friendly message when installation fails early
    if (errorMessage.includes("install-to-location")) {
      dialog.showErrorBox(
        "Installer Error",
        "The installer encountered an internal conflict while waiting for your selection. Please close any duplicate windows and try again."
      );
    } else if (errorMessage.toLowerCase().includes("micromamba")) {
      dialog.showErrorBox(
        "Micromamba Required",
        "Nodetool now provisions its runtime with micromamba. We attempted to download micromamba automatically but failed. Please install micromamba manually or set the MICROMAMBA_EXE environment variable, then retry the installation."
      );
    }
    throw error;
  }
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

async function installCondaPackages(
  micromambaExecutable: string,
  envPrefix: string,
  modelBackend: ModelBackend,
  options?: { installLlamaCpp?: boolean }
): Promise<void> {
  const prefersCuda =
    process.platform === "win32" || process.platform === "linux";

  const packageSpecs: string[] = [];

  const shouldInstallLlamaCpp =
    options?.installLlamaCpp ?? modelBackend === "llama_cpp";

  if (shouldInstallLlamaCpp) {
    packageSpecs.push(prefersCuda ? CUDA_LLAMA_SPEC : CPU_LLAMA_SPEC);
  } else {
    logMessage(
      "Skipping llama.cpp conda package installation (not selected or external llama.cpp selected)",
      "info"
    );
  }

  if (packageSpecs.length === 0) {
    logMessage(`No backend-specific packages to install for backend: ${modelBackend}`);
    return;
  }

  const args = [
    "install",
    "--yes",
    "--prefix",
    envPrefix,
    ...packageSpecs,
    "--override-channels",
    "--strict-channel-priority",
  ];
  for (const channel of CONDA_CHANNELS) {
    args.push("--channel", channel);
  }

  logMessage(
    `Ensuring micromamba packages (${packageSpecs.join(
      ", "
    )}) are installed into ${envPrefix}`
  );

  await runMicromambaCommand(
    micromambaExecutable,
    args,
    "Installing system dependencies"
  );
}

async function ensureLlamaCppInstalled(
  envPrefix: string
): Promise<void> {
  const executableName =
    os.platform() === "win32" ? "llama-server.exe" : "llama-server";
  const condaBinDir =
    os.platform() === "win32"
      ? path.join(envPrefix, "Library", "bin")
      : path.join(envPrefix, "bin");
  const llamaBinaryPath = path.join(condaBinDir, executableName);

  if (await fileExists(llamaBinaryPath)) {
    logMessage(`llama.cpp binary already present at ${llamaBinaryPath}`);
    return;
  }

  logMessage("llama.cpp binary missing, reinstalling package via micromamba");
  const micromambaExecutable = await ensureMicromambaAvailable();
  await installCondaPackages(micromambaExecutable, envPrefix, "llama_cpp", {
    installLlamaCpp: true,
  });

  if (!(await fileExists(llamaBinaryPath))) {
    throw new Error(
      "llama.cpp binary was not found after conda installation. Please verify your GPU drivers or try reinstalling manually."
    );
  }
}

/**
 * Install arbitrary conda packages into the existing conda environment.
 * Used by the package manager to install packages like ffmpeg on demand.
 */
async function installCondaPackageBySpec(
  envPrefix: string,
  packageSpecs: string[],
  progressLabel?: string,
): Promise<void> {
  if (packageSpecs.length === 0) {
    return;
  }

  const micromambaExecutable = await ensureMicromambaAvailable();

  const args = [
    "install",
    "--yes",
    "--prefix",
    envPrefix,
    ...packageSpecs,
    "--override-channels",
    "--strict-channel-priority",
  ];
  for (const channel of CONDA_CHANNELS) {
    args.push("--channel", channel);
  }

  logMessage(
    `Installing conda packages (${packageSpecs.join(", ")}) into ${envPrefix}`,
  );

  await runMicromambaCommand(
    micromambaExecutable,
    args,
    progressLabel ?? `Installing ${packageSpecs.join(", ")}`,
  );
}

/**
 * Remove conda packages from the existing conda environment.
 * Used by the package manager to uninstall runtimes like ffmpeg.
 */
async function removeCondaPackageBySpec(
  envPrefix: string,
  packageNames: string[],
  progressLabel?: string,
): Promise<void> {
  if (packageNames.length === 0) {
    return;
  }

  const micromambaExecutable = await ensureMicromambaAvailable();

  // Strip version constraints for removal (e.g. "ffmpeg>=6,<7" → "ffmpeg")
  const names = packageNames.map((s) => s.split(/[><=!]/)[0]);

  const args = [
    "remove",
    "--yes",
    "--prefix",
    envPrefix,
    ...names,
  ];

  logMessage(
    `Removing conda packages (${names.join(", ")}) from ${envPrefix}`,
  );

  await runMicromambaCommand(
    micromambaExecutable,
    args,
    progressLabel ?? `Removing ${names.join(", ")}`,
  );
}

/**
 * Set the conda environment install location in settings.
 */
function setCondaInstallLocation(location: string): void {
  updateSetting("CONDA_ENV", location);
  logMessage(`Conda environment location set to: ${location}`);
}

/**
 * Ensure a conda environment exists, creating a minimal one if needed.
 * If the env doesn't exist yet, the user is prompted for the install folder.
 * Returns the conda env path.
 */
async function promptForCondaInstallFolder(): Promise<string> {
  const defaultLocation = getDefaultInstallLocation();
  const { filePaths, canceled } = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Select where to install the conda environment",
    buttonLabel: "Select Folder",
    defaultPath: defaultLocation,
  });
  if (canceled || !filePaths?.[0]) {
    throw new Error("Installation cancelled — no folder selected.");
  }
  return path.join(filePaths[0], "nodetool-env");
}

async function ensureCondaEnvironment(
  installLocation?: string,
): Promise<string> {
  let condaEnvPath = installLocation || getCondaEnvPath();

  // Check if env already exists
  if (await fileExists(path.join(condaEnvPath, "conda-meta"))) {
    return condaEnvPath;
  }

  // Env doesn't exist — if no location was provided or stored in settings, ask the user
  if (!installLocation) {
    const storedLocation = readSettings()["CONDA_ENV"];
    if (!storedLocation) {
      condaEnvPath = await promptForCondaInstallFolder();
    }
  }

  logMessage(`Conda environment not found, creating at: ${condaEnvPath}`);
  emitBootMessage("Setting up conda environment...");

  setCondaInstallLocation(condaEnvPath);

  const micromambaExecutable = await ensureMicromambaAvailable();
  await createEnvironmentWithMicromamba(
    micromambaExecutable,
    condaEnvPath,
    BOOTSTRAP_CONDA_PACKAGES,
  );

  logMessage("Conda environment created successfully");
  emitBootMessage("Conda environment is ready");
  return condaEnvPath;
}

export {
  promptForInstallLocation,
  installCondaEnvironment,
  provisionCondaEnvironment,
  ensureCondaEnvironment,
  ensureLlamaCppInstalled,
  installCondaPackageBySpec,
  removeCondaPackageBySpec,
  setCondaInstallLocation,
};
