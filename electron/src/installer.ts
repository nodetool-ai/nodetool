import { promises as fs, constants, createReadStream } from "fs";
import StreamZip from "node-stream-zip";
import tar from "tar-fs";
import gunzip from "gunzip-maybe";
import { dialog } from "electron";
import {
  getCondaEnvUrl,
  getDefaultInstallLocation,
  updateCondaEnvironment,
  runCommand,
} from "./python";

import { logMessage } from "./logger";
import path from "path";
import { updateSettings } from "./settings";
import { emitBootMessage, emitUpdateProgress } from "./events";
import os from "os";
import { checkPermissions, fileExists } from "./utils";
import { getProcessEnv } from "./config";
import { getCondaUnpackPath } from "./config";
import { spawn, spawnSync } from "child_process";
import { downloadFile } from "./download";
import { BrowserWindow } from "electron";
import { getPythonPath } from "./config";

import { InstallToLocationData, IpcChannels, PythonPackages } from "./types.d";
import { createIpcMainHandler } from "./ipc";

const CUDA_LLAMA_SPEC = "llama.cpp=*=cuda126*";
const CPU_LLAMA_SPEC = "llama.cpp";
const OLLAMA_SPEC = "ollama";
const CONDA_CHANNELS = ["conda-forge"];
const FALLBACK_CONDA_EXECUTABLES = ["conda", "mamba", "micromamba"];

/**
 * Python Environment Installer Module
 *
 * This module handles the installation and updating of the Python environment for Nodetool.
 * It manages downloading, extracting, and configuring the Conda environment with required packages.
 *
 * Key Features:
 * - Downloads pre-built Conda environment from a configured URL
 * - Supports both .zip (Windows) and .tar.gz (Unix) formats
 * - Provides interactive installation location selection
 * - Shows real-time progress for downloads and extraction
 * - Handles environment unpacking and initialization
 * - Manages Python package updates through pip
 *
 * Installation Process:
 * 1. `promptForInstallLocation()` prompts the user for an installation directory
 * 2. `downloadFile()` retrieves the pre-built Conda environment archive
 * 3. `unpackPythonEnvironment()` / `unpackTarGzEnvironment()` extract the archive to the selected location
 * 4. `runCondaUnpack()` finalizes the environment post-extraction
 * 5. `installCondaPackages()` and `ensureLlamaCppInstalled()` update Python packages and required binaries
 *
 * Update Process:
 * - Checks for package updates using pip
 * - Updates packages while maintaining version compatibility
 * - Shows progress during package installation
 * - Handles update failures gracefully
 *
 * Configuration:
 * - Environment URL is configured through getCondaEnvUrl()
 * - Default install location is determined by getDefaultInstallLocation()
 * - Package versions are managed through PYTHON_PACKAGES settings
 */

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Calculate estimated time remaining for extraction
 */
function calculateExtractETA(
  startTime: number,
  processedBytes: number,
  totalBytes: number
): string {
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const bytesPerSecond = processedBytes / elapsedSeconds;
  const remainingBytes = totalBytes - processedBytes;
  const remainingSeconds = remainingBytes / bytesPerSecond;

  if (remainingSeconds < 60) {
    return `${Math.round(remainingSeconds)} seconds left`;
  } else if (remainingSeconds < 3600) {
    return `${Math.round(remainingSeconds / 60)} minutes left`;
  } else {
    return `${Math.round(remainingSeconds / 3600)} hours left`;
  }
}

/**
 * Run conda-unpack process
 * @param destPath - The path to extract the conda environment to
 */
async function runCondaUnpack(destPath: string): Promise<void> {
  emitBootMessage("Running conda-unpack...");
  const unpackScript = getCondaUnpackPath();

  logMessage(`Conda-unpack script: ${unpackScript}`);
  if (!(await fileExists(unpackScript))) {
    throw new Error(`conda-unpack script not found at: ${unpackScript}`);
  }

  // Make script executable on Unix systems
  if (process.platform !== "win32") {
    await fs.chmod(unpackScript, 0o755);
  }

  const unpackProcess = spawn(unpackScript, [], {
    stdio: "pipe",
    env: getProcessEnv(),
    cwd: destPath,
  });

  emitUpdateProgress("Python environment", 100, "Finalizing", "Almost done");

  return new Promise<void>((resolve, reject) => {
    const unpackTimeout = setTimeout(() => {
      unpackProcess.kill();
      reject(new Error("conda-unpack process timed out after 30 minutes"));
    }, 30 * 60 * 1000);

    unpackProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda-unpack: ${message}`);
    });

    unpackProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda-unpack error: ${message}`, "error");
    });

    unpackProcess.on("exit", (code: number | null) => {
      clearTimeout(unpackTimeout);
      if (code === 0) {
        logMessage("conda-unpack completed successfully");
        emitBootMessage("Python environment unpacked successfully");
        resolve();
      } else {
        reject(new Error(`conda-unpack failed with code ${code}`));
      }
    });

    unpackProcess.on("error", (err: Error) => {
      clearTimeout(unpackTimeout);
      reject(new Error(`Error running conda-unpack: ${err.message}`));
    });
  });
}

/**
 * Extract the Python environment from a zip archive
 * @param sourcePath - The path to the zip file
 * @param destPath - The path to extract the zip file to
 * @param extractFn - The function to use to extract the zip file
 */
async function unpackEnvironment(
  sourcePath: string,
  destPath: string,
  extractFn: (
    sourcePath: string,
    destPath: string,
    totalSize: number
  ) => Promise<void>
): Promise<void> {
  emitBootMessage("Unpacking the Python environment...");
  logMessage(`Unpacking Python environment from ${sourcePath} to ${destPath}`);

  try {
    // Check source file permissions and existence
    const { accessible: canRead, error: readError } = await checkPermissions(
      sourcePath,
      constants.R_OK
    );
    if (!canRead) {
      throw new Error(`Cannot read source file: ${readError}`);
    }

    const stats = await fs.stat(sourcePath);
    if (stats.size === 0) {
      throw new Error("Downloaded archive file is empty");
    }

    // Clean up existing environment
    if (await fileExists(destPath)) {
      logMessage(`Removing existing environment at ${destPath}`);
      await fs.rm(destPath, { recursive: true, force: true });
    }

    // Create destination directory
    await fs.mkdir(destPath, { recursive: true });

    // Extract files
    await extractFn(sourcePath, destPath, stats.size);

    // Run conda-unpack
    await runCondaUnpack(destPath);
  } catch (err: any) {
    const errorMsg = `Failed to unpack Python environment: ${err.message}`;
    logMessage(errorMsg, "error");
    logMessage(`Stack trace: ${err.stack}`, "error");

    // Clean up destination directory on error
    if (await fileExists(destPath)) {
      await fs.rm(destPath, { recursive: true, force: true });
    }

    dialog.showErrorBox(
      "Installation Error",
      `Failed to install Python environment.\n\nError: ${err.message}\n\nPlease check the log file for more details.`
    );

    throw err;
  }
}
/**
 * Extract zip archive
 * @param zipPath - The path to the zip file
 * @param destPath - The path to extract the zip file to
 * @param totalSize - The total size of the zip file
 */
async function extractZip(
  zipPath: string,
  destPath: string,
  totalSize: number
): Promise<void> {
  const zip = new StreamZip.async({ file: zipPath });
  try {
    const entries = await zip.entries();
    if (Object.keys(entries).length === 0) {
      throw new Error("Zip file contains no entries");
    }

    let extractedCompressedSize = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;

    for (const [name, entry] of Object.entries(entries)) {
      const fullPath = path.join(destPath, name);
      if (!fullPath.startsWith(destPath)) {
        throw new Error(`Invalid zip entry path: ${name}`);
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      if (!entry.isDirectory) {
        await zip.extract(name, fullPath);
        extractedCompressedSize += entry.compressedSize;

        const progress = (extractedCompressedSize / totalSize) * 100;
        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          const eta = calculateExtractETA(
            startTime,
            extractedCompressedSize,
            totalSize
          );
          emitUpdateProgress("Python environment", progress, "Extracting", eta);
          lastUpdate = now;
        }
      }
    }
  } finally {
    await zip.close();
  }
}

/**
 * Extract tar.gz archive
 * @param tarPath - The path to the tar.gz file
 * @param destPath - The path to extract the tar.gz file to
 * @param totalSize - The total size of the tar.gz file
 */
async function extractTarGz(
  tarPath: string,
  destPath: string,
  totalSize: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastUpdate = startTime;
    let processedBytes = 0;

    const extractStream = createReadStream(tarPath, {
      highWaterMark: 64 * 1024,
    })
      .on("data", (chunk: Buffer) => {
        processedBytes += chunk.length;
        const progress = (processedBytes / totalSize) * 100;

        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          const eta = calculateExtractETA(startTime, processedBytes, totalSize);
          emitUpdateProgress("Python environment", progress, "Extracting", eta);
          lastUpdate = now;
        }
      })
      .pipe(gunzip())
      .pipe(tar.extract(destPath));

    extractStream.on("finish", resolve);
    extractStream.on("error", reject);
  });
}

/**
 * Unpack Python environment from zip
 * @param zipPath - The path to the zip file
 * @param destPath - The path to extract the zip file to
 */
async function unpackPythonEnvironment(
  zipPath: string,
  destPath: string
): Promise<void> {
  await unpackEnvironment(zipPath, destPath, extractZip);
}

/**
 * Unpack Python environment from tar.gz
 * @param tarPath - The path to the tar.gz file
 * @param destPath - The path to extract the tar.gz file to
 */
async function unpackTarGzEnvironment(
  tarPath: string,
  destPath: string
): Promise<void> {
  await unpackEnvironment(tarPath, destPath, extractTarGz);
}

/**
 * Install the Python environment
 */
async function installCondaEnvironment(): Promise<void> {
  try {
    logMessage("Prompting for install location");
    const { location, packages } = await promptForInstallLocation();
    emitBootMessage("Setting up Python environment...");
    logMessage(`Setting up Python environment at: ${location}`);

    const environmentUrl = getCondaEnvUrl();
    const archivePath = path.join(os.tmpdir(), path.basename(environmentUrl));

    logMessage(`Creating download directory: ${path.dirname(archivePath)}`);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });

    logMessage(`Downloading Python environment from ${environmentUrl}`);
    emitBootMessage("Downloading Python environment...");
    let attempts = 3;
    while (attempts > 0) {
      try {
        await downloadFile(environmentUrl, archivePath);
        break;
      } catch (error) {
        attempts--;
        if (attempts === 0) {
          const prettyUrl = environmentUrl;
          const message =
            error instanceof Error ? error.message : String(error);
          const friendly =
            message.includes("File not found") || message.includes("404")
              ? `The installer could not find the Python environment archive at:\n\n${prettyUrl}\n\nThis likely means the release asset is missing for your platform or version.`
              : `We couldn't download the Python environment.\n\nError: ${message}`;
          dialog.showErrorBox(
            "Download Failed",
            `${friendly}\n\nTroubleshooting:\n- Check your internet connection.\n- If you're on a VPN/Proxy, try disabling it.\n- Verify that the file exists in the release assets.\n\nYou can also choose a different install location and try again.`
          );
          throw error;
        }
        logMessage(`Download failed, retrying... (${attempts} attempts left)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    await fs.mkdir(location, { recursive: true });
    logMessage(`Unpacking Python environment to ${location}`);
    emitBootMessage("Unpacking Python environment...");
    if (process.platform === "win32") {
      await unpackPythonEnvironment(archivePath, location);
    } else {
      await unpackTarGzEnvironment(archivePath, location);
    }

    logMessage(`Removing downloaded archive: ${archivePath}`);
    await fs.unlink(archivePath);

    await updateCondaEnvironment(packages);

    const condaEnvPath = location;
    await installCondaPackages(condaEnvPath);
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

function detectCondaExecutable(): string {
  const candidate = process.env.CONDA_EXE?.trim();
  if (candidate) {
    return candidate;
  }

  for (const executable of FALLBACK_CONDA_EXECUTABLES) {
    try {
      const resolved = spawnSync(executable, ["--version"], {
        stdio: "ignore",
      });
      if (resolved.status === 0) {
        return executable;
      }
    } catch {
      // continue searching
    }
  }

  throw new Error(
    "Unable to locate a conda-compatible executable. Please install conda/mamba/micromamba or set CONDA_EXE."
  );
}

async function installCondaPackages(envPrefix: string): Promise<void> {
  const condaExe = detectCondaExecutable();
  const prefersCuda =
    process.platform === "win32" || process.platform === "linux";
  const packageSpecs = [
    OLLAMA_SPEC,
    prefersCuda ? CUDA_LLAMA_SPEC : CPU_LLAMA_SPEC,
  ];

  const args = ["install", ...packageSpecs, "-p", envPrefix, "-y"];
  for (const channel of CONDA_CHANNELS) {
    args.push("-c", channel);
  }

  logMessage(
    `Installing conda packages (${packageSpecs.join(
      ", "
    )}) into ${envPrefix} using ${condaExe}`
  );
  const installProcess = spawn(condaExe, args, {
    env: getProcessEnv(),
    stdio: "pipe",
  });

  return new Promise((resolve, reject) => {
    installProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda install stdout: ${message}`);
    });

    installProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda install stderr: ${message}`, "error");
    });

    installProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Conda install exited with code ${code}`));
      }
    });

    installProcess.on("error", (err) => {
      reject(new Error(`Failed to run conda install: ${err.message}`));
    });
  });
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

  logMessage("llama.cpp binary missing, reinstalling package via conda");
  await installCondaPackages(envPrefix);

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
