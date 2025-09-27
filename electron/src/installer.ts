import { promises as fs } from "fs";
import { app, dialog } from "electron";
import {
  getDefaultInstallLocation,
  updateCondaEnvironment,
  runCommand,
} from "./python";

import { logMessage } from "./logger";
import path from "path";
import { updateSettings } from "./settings";
import { emitBootMessage, emitUpdateProgress } from "./events";
import os from "os";
import { fileExists } from "./utils";
import { spawn, spawnSync } from "child_process";
import { BrowserWindow } from "electron";
import { getCondaLockFilePath, getPythonPath } from "./config";

import { InstallToLocationData, IpcChannels, PythonPackages } from "./types.d";
import { createIpcMainHandler } from "./ipc";

const CUDA_LLAMA_SPEC = "llama.cpp=*=cuda126*";
const CPU_LLAMA_SPEC = "llama.cpp";
const OLLAMA_SPEC = "ollama";
const CONDA_CHANNELS = ["conda-forge"];
const MICROMAMBA_ENV_VAR = "MICROMAMBA_EXE";

function getMicromambaRootPrefix(): string {
  return path.join(app.getPath("userData"), "micromamba");
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

function detectMicromambaExecutable(): string {
  const explicit = process.env[MICROMAMBA_ENV_VAR]?.trim();
  const candidates = [explicit, "micromamba"]
    .filter(Boolean)
    .map((candidate) => candidate as string);

  for (const executable of candidates) {
    try {
      const resolved = spawnSync(executable, ["--version"], {
        stdio: "ignore",
      });
      if (resolved.status === 0) {
        return executable;
      }
    } catch {
      // Continue searching
    }
  }

  throw new Error(
    "Unable to locate micromamba. Install micromamba and ensure it is available on PATH or set MICROMAMBA_EXE."
  );
}

async function runMicromambaCommand(
  micromambaExecutable: string,
  args: string[],
  progressAction: string
): Promise<void> {
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
    const { location, packages } = await promptForInstallLocation();
    emitBootMessage("Setting up Python environment...");
    logMessage(`Setting up Python environment at: ${location}`);

    const lockFilePath = getCondaLockFilePath();
    logMessage(`Using micromamba lock file at: ${lockFilePath}`);

    const micromambaExecutable = detectMicromambaExecutable();

    await createEnvironmentWithMicromamba(
      micromambaExecutable,
      lockFilePath,
      location
    );

    await updateCondaEnvironment(packages);

    const condaEnvPath = location;
    await installCondaPackages(micromambaExecutable, condaEnvPath);
    await ensureLlamaCppInstalled(condaEnvPath);

    // Install Playwright browsers in the freshly set up environment
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
        "Nodetool now provisions its runtime with micromamba. Please install micromamba and ensure it is on your PATH, or set the MICROMAMBA_EXE environment variable, then retry the installation."
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
async function promptForInstallLocation(): Promise<{
  location: string;
  packages: PythonPackages;
}> {
  const defaultLocation = getDefaultInstallLocation();

  return new Promise<{
    location: string;
    packages: PythonPackages;
  }>((resolve, reject) => {
    createIpcMainHandler(
      IpcChannels.INSTALL_TO_LOCATION,
      async (_event, { location, packages }: InstallToLocationData) => {
        logMessage(`Updating CONDA_ENV setting to: ${location}`);
        try {
          updateSettings({
            CONDA_ENV: location,
          });
        } catch (e) {
          logMessage(
            `Failed to persist CONDA_ENV setting: ${String(e)}`,
            "error"
          );
          // Continue; installation can still proceed and settings can be updated later
        }
        resolve({ location, packages });
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
    `Ensuring micromamba packages (${packageSpecs.join(", ")}) are installed into ${envPrefix}`
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
  const micromambaExecutable = detectMicromambaExecutable();
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
