import {
  promises as fs,
  constants,
  createWriteStream,
  createReadStream,
} from "fs";
import StreamZip from "node-stream-zip";
// @ts-expect-error types not available
import tar from "tar-fs";
// @ts-expect-error types not available
import gunzip from "gunzip-maybe";
import { dialog } from "electron";
import {
  getCondaEnvUrl,
  getDefaultInstallLocation,
  updateCondaEnvironment,
} from "./python";

import { getEnvironmentSize, getDownloadSize } from "./python";
import { logMessage } from "./logger";
import path from "path";
import { updateSetting } from "./settings";
import { emitBootMessage, emitUpdateProgress } from "./events";
import os from "os";
import { checkPermissions, fileExists } from "./utils";
import { getProcessEnv } from "./config";
import { getCondaUnpackPath } from "./config";
import { spawn } from "child_process";
import { downloadFile } from "./download";
import { BrowserWindow } from "electron";

import { IpcChannels } from "./types.d";
import { createIpcMainHandler } from "./ipc";
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
 */
async function runCondaUnpack(destPath: string): Promise<void> {
  emitBootMessage("Running conda-unpack (may take a few minutes)...");
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
 */
async function unpackPythonEnvironment(
  zipPath: string,
  destPath: string
): Promise<void> {
  await unpackEnvironment(zipPath, destPath, extractZip);
}

/**
 * Unpack Python environment from tar.gz
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
    const customEnvPath = await promptForInstallLocation();
    emitBootMessage("Setting up Python environment...");
    logMessage(`Setting up Python environment at: ${customEnvPath}`);

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
        if (attempts === 0) throw error;
        logMessage(`Download failed, retrying... (${attempts} attempts left)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    await fs.mkdir(customEnvPath, { recursive: true });
    logMessage(`Unpacking Python environment to ${customEnvPath}`);
    emitBootMessage("Unpacking Python environment...");
    if (process.platform === "win32") {
      await unpackPythonEnvironment(archivePath, customEnvPath);
    } else {
      await unpackTarGzEnvironment(archivePath, customEnvPath);
    }

    logMessage(`Removing downloaded archive: ${archivePath}`);
    await fs.unlink(archivePath);

    await updateCondaEnvironment();

    logMessage("Python environment installation completed successfully");
    emitBootMessage("Python environment is ready");
  } catch (error: any) {
    logMessage(
      `Failed to install Python environment: ${error.message}`,
      "error"
    );
    throw error;
  }
}

async function promptForInstallLocation(): Promise<string> {
  const downloadSize = getDownloadSize();
  const installedSize = getEnvironmentSize();
  const defaultLocation = getDefaultInstallLocation();

  // Create a promise that will be resolved when the user makes a selection
  return new Promise<string>((resolve, reject) => {
    // Use createIpcMainHandler instead of createIpcOnceHandler for these events
    createIpcMainHandler(
      IpcChannels.SELECT_DEFAULT_LOCATION,
      async (_event) => {
        try {
          await updateSetting("CONDA_ENV", defaultLocation);
          resolve(defaultLocation);
        } catch (error) {
          reject(error);
        }
      }
    );

    createIpcMainHandler(IpcChannels.SELECT_CUSTOM_LOCATION, async () => {
      try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
          title: "Select Python Environment Location",
          buttonLabel: "Select Folder",
          defaultPath: defaultLocation,
        });

        if (canceled || !filePaths?.[0]) {
          reject(new Error("No installation location selected"));
        }

        const selectedPath = path.join(filePaths[0], "nodetool-python");
        await updateSetting("CONDA_ENV", selectedPath);
        resolve(selectedPath);
      } catch (error) {
        reject(error);
      }
    });

    // Send the prompt data to the renderer process
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      reject(new Error("No active window found"));
      return;
    }

    mainWindow.webContents.send("install-location-prompt", {
      defaultPath: defaultLocation,
      downloadSize,
      installedSize,
    });
  });
}

export { promptForInstallLocation, installCondaEnvironment };
