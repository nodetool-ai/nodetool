import { createWriteStream, promises as fs } from "fs";
import { app, dialog } from "electron";
import {
  getDefaultInstallLocation,
  updateCondaEnvironment,
  runCommand,
} from "./python";

import { logMessage } from "./logger";
import path from "path";
import { readSettings, updateSettings } from "./settings";
import { emitBootMessage, emitUpdateProgress } from "./events";
import os from "os";
import { fileExists } from "./utils";
import { spawn, spawnSync } from "child_process";
import { BrowserWindow } from "electron";
import { getCondaLockFilePath, getPythonPath } from "./config";
import https from "https";
import { pipeline } from "stream/promises";

import { InstallToLocationData, IpcChannels, PythonPackages } from "./types.d";
import { createIpcMainHandler } from "./ipc";

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

interface InstallationPreferences {
  location: string;
  packages: PythonPackages;
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

function normalizeInstallLocation(location: unknown): string {
  if (typeof location === "string") {
    const trimmed = location.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return getDefaultInstallLocation();
}

function persistInstallationPreferences(
  location: unknown,
  packages: unknown
): InstallationPreferences {
  const normalizedLocation = normalizeInstallLocation(location);
  const sanitizedPackages = sanitizePackageSelection(packages);

  try {
    updateSettings({
      CONDA_ENV: normalizedLocation,
      [PYTHON_PACKAGES_SETTING_KEY]: sanitizedPackages,
    });
    logMessage(
      `Persisted installer preferences: location=${normalizedLocation}, packages=${
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
  };
}

function readInstallationPreferences(): InstallationPreferences {
  try {
    const settings = readSettings();
    const location = normalizeInstallLocation(settings["CONDA_ENV"]);
    const packages = sanitizePackageSelection(
      settings[PYTHON_PACKAGES_SETTING_KEY as keyof typeof settings]
    );
    return { location, packages };
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
    };
  }
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

  for (const baseDir of getCandidateMicromambaResourceDirs()) {
    const candidate = path.join(baseDir, MICROMAMBA_BUNDLED_DIR_NAME, binaryName);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getMicromambaDownloadUrl(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    if (arch === "arm64") {
      return "https://micro.mamba.pm/api/micromamba/osx-arm64/latest";
    }
    if (arch === "x64") {
      return "https://micro.mamba.pm/api/micromamba/osx-64/latest";
    }
    return null;
  }

  if (platform === "linux") {
    if (arch === "x64") {
      return "https://micro.mamba.pm/api/micromamba/linux-64/latest";
    }
    if (arch === "arm64") {
      return "https://micro.mamba.pm/api/micromamba/linux-aarch64/latest";
    }
    if (arch === "ppc64") {
      return "https://micro.mamba.pm/api/micromamba/linux-ppc64le/latest";
    }
    return null;
  }

  if (platform === "win32") {
    if (arch === "x64") {
      return "https://micro.mamba.pm/api/micromamba/win-64/latest";
    }
    return null;
  }

  return null;
}

async function downloadFile(
  url: string,
  destinationPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const redirectUrl = new URL(response.headers.location, url).toString();
        response.destroy();
        downloadFile(redirectUrl, destinationPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Failed to download micromamba (status ${response.statusCode})`
          )
        );
        response.resume();
        return;
      }

      const fileStream = createWriteStream(destinationPath);
      pipeline(response, fileStream)
        .then(resolve)
        .catch((error) => reject(error));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function extractMicromambaArchive(
  archivePath: string,
  destinationDir: string
): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });

  // Extract from tar.bz2 archive - Windows uses Library/bin/micromamba.exe, Unix uses bin/micromamba
  const extractPath =
    process.platform === "win32"
      ? "Library/bin/micromamba.exe"
      : "bin/micromamba";

  await new Promise<void>((resolve, reject) => {
    const tarProcess = spawn(
      "tar",
      ["-xvjf", archivePath, "-C", destinationDir, extractPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    tarProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`tar stdout: ${message}`);
      }
    });

    tarProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`tar stderr: ${message}`, "error");
      }
    });

    tarProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });

    tarProcess.on("error", (error) => {
      reject(error);
    });
  });
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

  const downloadUrl = getMicromambaDownloadUrl();
  if (!downloadUrl) {
    throw new Error(
      "Unable to locate micromamba and automatic download is not supported on this platform."
    );
  }

  emitBootMessage("Downloading micromamba...");
  logMessage(`Downloading micromamba from ${downloadUrl}`);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "micromamba-"));
  const archivePath = path.join(tempDir, "micromamba.tar.bz2");
  let installedExecutable: string | null = null;

  try {
    await downloadFile(downloadUrl, archivePath);
    emitBootMessage("Installing micromamba...");
    await extractMicromambaArchive(archivePath, tempDir);

    const extractedBinary =
      process.platform === "win32"
        ? path.join(tempDir, "Library", "bin", MICROMAMBA_EXECUTABLE_NAME)
        : path.join(tempDir, "bin", "micromamba");

    if (!(await fileExists(extractedBinary))) {
      throw new Error("micromamba binary not found after extraction");
    }

    await fs.mkdir(getMicromambaBinDir(), { recursive: true });
    await fs.copyFile(extractedBinary, localExecutable);

    // Only chmod on Unix-like systems
    if (process.platform !== "win32") {
      await fs.chmod(localExecutable, 0o755);
    }

    process.env[MICROMAMBA_ENV_VAR] = localExecutable;
    installedExecutable = localExecutable;
    logMessage(`micromamba installed at ${localExecutable}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (!installedExecutable) {
    throw new Error("Failed to install micromamba");
  }

  return installedExecutable;
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

  logMessage(
    `Running micromamba command: ${micromambaExecutable} ${args.join(" ")}`
  );

  emitBootMessage(`${progressAction}...`);
  emitUpdateProgress("Python environment", 10, progressAction, "Resolving");

  const micromambaProcess = spawn(micromambaExecutable, args, {
    env,
    stdio: "pipe",
  });

  return new Promise<void>((resolve, reject) => {
    micromambaProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`micromamba stdout: ${message}`);
      }
    });

    micromambaProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`micromamba stderr: ${message}`, "error");
      }
    });

    micromambaProcess.on("exit", (code) => {
      if (code === 0) {
        emitUpdateProgress("Python environment", 100, progressAction, "Done");
        resolve();
      } else {
        reject(new Error(`micromamba exited with code ${code}`));
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
  options?: { bootMessage?: string }
): Promise<void> {
  const bootMessage =
    options?.bootMessage ?? "Setting up Python environment...";

  emitBootMessage(bootMessage);
  logMessage(`Setting up Python environment at: ${location}`);

  const lockFilePath = getCondaLockFilePath();
  logMessage(`Using micromamba lock file at: ${lockFilePath}`);

  const micromambaExecutable = await ensureMicromambaAvailable();

  await createEnvironmentWithMicromamba(
    micromambaExecutable,
    lockFilePath,
    location
  );

  await updateCondaEnvironment(packages);

  const condaEnvPath = location;
  await installCondaPackages(micromambaExecutable, condaEnvPath);
  await ensureLlamaCppInstalled(condaEnvPath);

  try {
    emitBootMessage("Installing Playwright browsers...");
    logMessage("Running Playwright install in Python environment");
    const pythonPath = getPythonPath();
    await runCommand([pythonPath, "-m", "playwright", "install"]);
    logMessage("Playwright installation completed successfully");
  } catch (err: any) {
    logMessage(`Failed to install Playwright: ${err.message}`, "error");
    throw err;
  }

  logMessage("Python environment installation completed successfully");
  emitBootMessage("Python environment is ready");
}

async function repairCondaEnvironment(): Promise<void> {
  const { location, packages } = readInstallationPreferences();
  await provisionPythonEnvironment(location, packages, {
    bootMessage: "Repairing Python environment...",
  });
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
 * 4. `updateCondaEnvironment()` installs/upgrades required Python packages via uv pip
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
    const { location, packages } = await promptForInstallLocation(
      persistedPreferences
    );
    await provisionPythonEnvironment(location, packages);
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

/**
 * Prompt for install location
 * @returns The path to the install location
 */
async function promptForInstallLocation(
  defaults?: InstallationPreferences
): Promise<InstallationPreferences> {
  const defaultLocation = defaults?.location ?? getDefaultInstallLocation();
  const defaultPackages = defaults?.packages ?? [];

  return new Promise<{
    location: string;
    packages: PythonPackages;
  }>((resolve, reject) => {
    createIpcMainHandler(
      IpcChannels.INSTALL_TO_LOCATION,
      async (_event, { location, packages }: InstallToLocationData) => {
        const preferences = persistInstallationPreferences(location, packages);
        resolve(preferences);
      }
    );

    // Send the prompt data to the renderer process
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      reject(new Error("No active window found"));
      return;
    }

    mainWindow.webContents.send(IpcChannels.INSTALL_LOCATION_PROMPT, {
      defaultPath: defaultLocation,
      packages: defaultPackages,
    });
  });
}

async function installCondaPackages(
  micromambaExecutable: string,
  envPrefix: string
): Promise<void> {
  const prefersCuda =
    process.platform === "win32" || process.platform === "linux";
  const packageSpecs = [
    OLLAMA_SPEC,
    prefersCuda ? CUDA_LLAMA_SPEC : CPU_LLAMA_SPEC,
  ];

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

async function ensureLlamaCppInstalled(envPrefix: string): Promise<void> {
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
  await installCondaPackages(micromambaExecutable, envPrefix);

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
export { repairCondaEnvironment };
