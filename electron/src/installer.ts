import { promises as fs } from "fs";
import type { Stats } from "fs";
import { app, dialog } from "electron";
import {
  getDefaultInstallLocation,
  updateCondaEnvironment,
  runCommand,
} from "./python";

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
import { getCondaLockFilePath, getPythonPath } from "./config";
import { InstallToLocationData, IpcChannels, PythonPackages, ModelBackend } from "./types.d";
import { createIpcMainHandler } from "./ipc";
import { detectTorchPlatform, type TorchruntimeDetectionResult } from "./torchruntime";
import { saveTorchPlatform } from "./torchPlatformCache";

const CUDA_LLAMA_SPEC = "llama.cpp=*=cuda126*";
const CPU_LLAMA_SPEC = "llama.cpp";
const OLLAMA_SPEC = "ollama";
const CONDA_CHANNELS = ["conda-forge"];
const MICROMAMBA_ENV_VAR = "MICROMAMBA_EXE";
const MICROMAMBA_BIN_DIR_NAME = "bin";
const MICROMAMBA_EXECUTABLE_NAME =
  process.platform === "win32" ? "micromamba.exe" : "micromamba";
const MICROMAMBA_BUNDLED_DIR_NAME = "micromamba";
const PYTHON_PACKAGES_SETTING_KEY = "PYTHON_PACKAGES";
const MODEL_BACKEND_SETTING_KEY = "MODEL_BACKEND";
const MICROMAMBA_LOCK_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MICROMAMBA_LOCK_ERROR_PATTERN = /could not set lock|cannot lock/i;
const DEFAULT_MAMBA_HOME_DIR = ".mamba";

interface InstallationPreferences {
  location: string;
  packages: PythonPackages;
  modelBackend: ModelBackend;
}

interface InstallationSelection extends InstallationPreferences {
  installOllama?: boolean;
  installLlamaCpp?: boolean;
  startOllamaOnStartup?: boolean;
  startLlamaCppOnStartup?: boolean;
}

function sanitizePackageSelection(packages: unknown): PythonPackages {
  if (!Array.isArray(packages)) {
    return [];
  }

  const sanitized = packages
    .filter((pkg): pkg is string => typeof pkg === "string")
    .map((pkg) => pkg.trim())
    .filter((pkg) => pkg.length > 0);

  return Array.from(new Set(sanitized));
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
  packages: unknown,
  modelBackend: unknown,
  startupSettings?: {
    startOllamaOnStartup?: unknown;
    startLlamaCppOnStartup?: unknown;
  }
): InstallationPreferences {
  const normalizedLocation = normalizeInstallLocation(location);
  const sanitizedPackages = sanitizePackageSelection(packages);
  const normalizedBackend = normalizeModelBackend(modelBackend);
  const startupDefaults = getModelServiceStartupDefaults(normalizedBackend);
  const startOllamaOnStartup =
    typeof startupSettings?.startOllamaOnStartup === "boolean"
      ? startupSettings.startOllamaOnStartup
      : startupDefaults.startOllamaOnStartup;
  const startLlamaCppOnStartup =
    typeof startupSettings?.startLlamaCppOnStartup === "boolean"
      ? startupSettings.startLlamaCppOnStartup
      : startupDefaults.startLlamaCppOnStartup;

  try {
    updateSettings({
      CONDA_ENV: normalizedLocation,
      [PYTHON_PACKAGES_SETTING_KEY]: sanitizedPackages,
      [MODEL_BACKEND_SETTING_KEY]: normalizedBackend,
      START_OLLAMA_ON_STARTUP: startOllamaOnStartup,
      START_LLAMA_CPP_ON_STARTUP: startLlamaCppOnStartup,
    });
    logMessage(
      `Persisted installer preferences: location=${normalizedLocation}, backend=${normalizedBackend}, packages=${
        sanitizedPackages.join(", ") || "none"
      }`
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
    packages: sanitizedPackages,
    modelBackend: normalizedBackend,
  };
}

function readInstallationPreferences(): InstallationPreferences {
  try {
    const settings = readSettings();
    const location = normalizeInstallLocation(settings["CONDA_ENV"]);
    const packages = sanitizePackageSelection(
      settings[PYTHON_PACKAGES_SETTING_KEY as keyof typeof settings]
    );
    const modelBackend = normalizeModelBackend(
      settings[MODEL_BACKEND_SETTING_KEY as keyof typeof settings]
    );
    return { location, packages, modelBackend };
  } catch (error) {
    logMessage(
      `Unable to read installer preferences, using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warn"
    );
    return {
      location: getDefaultInstallLocation(),
      packages: [],
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
  const defaultPackages = defaults?.packages ?? [];
  // Use defaultBackend if you want to pass it to the renderer
  const defaultBackend = defaults?.modelBackend ?? "ollama";

  return new Promise<InstallationSelection>((resolve, reject) => {
    createIpcMainHandler(
      IpcChannels.INSTALL_TO_LOCATION,
      async (
        _event,
        {
          location,
          packages,
          modelBackend,
          installOllama,
          installLlamaCpp,
          startOllamaOnStartup,
          startLlamaCppOnStartup,
        }: InstallToLocationData
      ) => {
        const preferences = persistInstallationPreferences(
          location,
          packages,
          modelBackend,
          {
            startOllamaOnStartup,
            startLlamaCppOnStartup,
          }
        );
        resolve({
          ...preferences,
          installOllama,
          installLlamaCpp,
          startOllamaOnStartup:
            typeof startOllamaOnStartup === "boolean"
              ? startOllamaOnStartup
              : undefined,
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
      packages: defaultPackages,
      // Pass backend if/when frontend supports it
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
  } catch (error: any) {
    if (error?.code === "ENOENT") {
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

  // No download fallback - require bundled micromamba or explicit configuration
  throw new Error(
    "micromamba not found. Please ensure micromamba is bundled in resources/micromamba/ " +
    "or set the MICROMAMBA_EXE environment variable, or install micromamba system-wide."
  );
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

async function createEnvironmentWithMicromamba(
  micromambaExecutable: string,
  lockFilePath: string,
  destinationPrefix: string
): Promise<void> {
  if (!micromambaExecutable) {
    throw new Error("micromamba executable path is empty");
  }

  emitBootMessage("Creating Python environment with micromamba...");

  if (!(await fileExists(lockFilePath))) {
    throw new Error(`Environment lock file not found at: ${lockFilePath}`);
  }

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
    "--file",
    lockFilePath,
    "--strict-channel-priority",
  ];

  await runMicromambaCommand(
    micromambaExecutable,
    args,
    "Creating Python environment"
  );
}

async function provisionPythonEnvironment(
  location: string,
  packages: PythonPackages,
  modelBackend: ModelBackend,
  options?: {
    bootMessage?: string;
    installOllama?: boolean;
    installLlamaCpp?: boolean;
  }
): Promise<void> {
  const bootMessage =
    options?.bootMessage ?? "Setting up Python environment...";

  emitBootMessage(bootMessage);
  logMessage(`Setting up Python environment at: ${location} (Backend: ${modelBackend})`);

  const lockFilePath = getCondaLockFilePath();
  logMessage(`Using micromamba lock file at: ${lockFilePath}`);

  const micromambaExecutable = await ensureMicromambaAvailable();

  await createEnvironmentWithMicromamba(
    micromambaExecutable,
    lockFilePath,
    location
  );

  // Detect GPU platform with torchruntime (detection only, torch will be installed via uv pip)
  let torchPlatformResult: TorchruntimeDetectionResult;
  try {
    torchPlatformResult = await detectTorchPlatform();
    logMessage(`Torch platform detection result: ${JSON.stringify(torchPlatformResult)}`);
    
    // Save detected platform to settings for later use by uv pip install
    saveTorchPlatform(torchPlatformResult);
  } catch (error: any) {
    logMessage(`Failed to detect GPU platform: ${error.message}`, "error");
    // Fallback to CPU
    torchPlatformResult = {
      platform: "cpu",
      indexUrl: "https://download.pytorch.org/whl/cpu",
      error: error.message,
    };
    saveTorchPlatform(torchPlatformResult);
  }

  // PyTorch and other packages will be installed via uv pip with the correct index URL
  await updateCondaEnvironment(packages);

  const condaEnvPath = location;
  await installCondaPackages(micromambaExecutable, condaEnvPath, modelBackend, {
    installOllama: options?.installOllama,
    installLlamaCpp: options?.installLlamaCpp,
  });
  
  const shouldInstallLlamaCpp =
    options?.installLlamaCpp ?? modelBackend === "llama_cpp";
  if (shouldInstallLlamaCpp) {
    await ensureLlamaCppInstalled(condaEnvPath);
  }

  logMessage("Python environment installation completed successfully");
  emitBootMessage("Python environment is ready");
}

/**
 * Python Environment Installer Module
 *
 * This module handles the installation and updating of the Python environment for Nodetool.
 * It provisions a Conda environment using micromamba and a checked-in lock file to guarantee
 * reproducible dependency resolution across platforms.
 *
 * Key Features:
 * - Creates the Python environment directly from a micromamba lock manifest
 * - Provides interactive installation location selection
 * - Streams micromamba output for visibility into long-running operations
 * - Handles environment initialization and required dependency installation
 * - Manages Python package updates through pip
 *
 * Installation Process:
 * 1. `promptForInstallLocation()` prompts the user for an installation directory
 * 2. `createEnvironmentWithMicromamba()` builds the environment from `environment.lock.yml`
   * 3. `installCondaPackages()` and `ensureLlamaCppInstalled()` ensure native binaries are present
   * 4. `installTorchWithUvs()` installs PyTorch with automatic GPU detection
   * 5. `updateCondaEnvironment()` installs/upgrades required Python packages via uv pip
 *
 * Update Process:
 * - Checks for package updates using pip
 * - Updates packages while maintaining version compatibility
 * - Shows progress during package installation
 * - Handles update failures gracefully
 *
 * Configuration:
 * - Lock manifest path is resolved through getCondaLockFilePath()
 * - Default install location is determined by getDefaultInstallLocation()
 * - Package versions are managed through PYTHON_PACKAGES settings
 */

/**
 * Install the Python environment
 */
async function installCondaEnvironment(): Promise<void> {
  try {
    logMessage("Prompting for install location");
    const persistedPreferences = readInstallationPreferences();
    const { location, packages, modelBackend, installOllama, installLlamaCpp } =
      await promptForInstallLocation(persistedPreferences);
    await provisionPythonEnvironment(location, packages, modelBackend, {
      installOllama,
      installLlamaCpp,
    });
  } catch (error: any) {
    logMessage(
      `Failed to install Python environment: ${error.message}`,
      "error"
    );
    // Provide a consolidated, user-friendly message when installation fails early
    if (error?.message?.includes("install-to-location")) {
      dialog.showErrorBox(
        "Installer Error",
        "The installer encountered an internal conflict while waiting for your selection. Please close any duplicate windows and try again."
      );
    } else if (error?.message?.toLowerCase().includes("micromamba")) {
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
  options?: { installOllama?: boolean; installLlamaCpp?: boolean }
): Promise<void> {
  const prefersCuda =
    process.platform === "win32" || process.platform === "linux";
  
  const packageSpecs: string[] = [];

  const shouldInstallOllama = options?.installOllama ?? modelBackend === "ollama";
  const shouldInstallLlamaCpp =
    options?.installLlamaCpp ?? modelBackend === "llama_cpp";

  if (shouldInstallOllama) {
    packageSpecs.push(OLLAMA_SPEC);
  } else {
    logMessage(
      "Skipping Ollama conda package installation (not selected or external Ollama selected)",
      "info"
    );
  }

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
    installOllama: false,
    installLlamaCpp: true,
  });

  if (!(await fileExists(llamaBinaryPath))) {
    throw new Error(
      "llama.cpp binary was not found after conda installation. Please verify your GPU drivers or try reinstalling manually."
    );
  }
}

// async function ensureOllamaCondaInstalled(envPrefix: string): Promise<string> {
//   const condaBinDir =
//     os.platform() === "win32"
//       ? path.join(envPrefix, "Scripts")
//       : path.join(envPrefix, "bin");
//   const binaryName = os.platform() === "win32" ? "ollama.exe" : "ollama";
//   const binaryPath = path.join(condaBinDir, binaryName);

//   if (await fileExists(binaryPath)) {
//     logMessage(`Ollama binary already available at ${binaryPath}`);
//     return binaryPath;
//   }

//   logMessage(
//     "Ollama binary not found in conda environment, installing via conda..."
//   );
//   await installCondaPackages(envPrefix);

//   if (!(await fileExists(binaryPath))) {
//     throw new Error(
//       "Ollama binary is still missing after conda installation. Please reinstall or install Ollama manually."
//     );
//   }

//   logMessage(`Ollama installed at ${binaryPath}`);
//   return binaryPath;
// }

export { promptForInstallLocation, installCondaEnvironment };
