const {
  getPythonPath,
  getPipPath,
  getCondaUnpackPath,
  saveUserRequirements,
  getRequirementsPath,
  getProcessEnv,
} = require("./config");
const fs = require("fs").promises;

const { spawn } = require("child_process");
const os = require("os");
const { app, dialog } = require("electron");
const https = require("https");
const StreamZip = require("node-stream-zip");
const { logMessage } = require("./logger");
const { checkPermissions, fileExists } = require("./utils");
const { LOG_FILE } = require("./logger");
const { emitBootMessage, emitUpdateProgress } = require("./events");
const tar = require("tar-fs");
const gunzip = require("gunzip-maybe");
const { createReadStream, createWriteStream } = require("fs");
const path = require("path");
const { readSettings, updateSetting } = require("./settings");

/**
 * Check if installed packages match requirements
 * @returns {Promise<boolean>} True if updates are needed, false otherwise
 * @throws {Error} If package check fails
 */
async function checkPythonPackages() {
  try {
    const VERSION = app.getVersion();
    const requirementsURL = app.isPackaged
      ? `https://packages.nodetool.ai/requirements-${VERSION}.txt`
      : `file://${path.join(__dirname, "..", "requirements.txt")}`;

    emitBootMessage(`Downloading requirements...`);
    logMessage(`Downloading requirements from ${requirementsURL}`);

    const remoteRequirements = await downloadToString(requirementsURL);
    const localRequirements = await fs.readFile(getRequirementsPath(), "utf8");

    if (localRequirements === remoteRequirements) {
      emitBootMessage("No updates needed");
      logMessage("Requirements are up to date");
      return false;
    }

    saveUserRequirements(remoteRequirements);

    return true;
  } catch (error) {
    logMessage(`Failed to check Python packages: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Verify write permissions for critical paths
 * @returns {Promise<{valid: boolean, errors: string[]}>} Validation result and any errors
 */
async function verifyApplicationPaths() {
  const pathsToCheck = [
    {
      path: app.getPath("userData"),
      mode: fs.constants.W_OK,
      desc: "User data directory",
    },
    {
      path: path.dirname(LOG_FILE),
      mode: fs.constants.W_OK,
      desc: "Log file directory",
    },
  ];

  const errors = [];

  for (const { path, mode, desc } of pathsToCheck) {
    const { accessible, error } = await checkPermissions(path, mode);
    logMessage(`Checking ${desc} permissions: ${accessible ? "OK" : "FAILED"}`);
    if (!accessible) {
      errors.push(`${desc}: ${error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if the Python environment is installed
 * @returns {Promise<boolean>} True if environment is installed, false otherwise
 */
async function isCondaEnvironmentInstalled() {
  try {
    const settings = require("./settings").readSettings();
    logMessage(`CONDA_ENV: ${settings.CONDA_ENV}`);
    const pythonExecutablePath = getPythonPath();

    await fs.access(pythonExecutablePath);

    logMessage(`Python executable found at ${pythonExecutablePath}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update the Python environment packages
 * @returns {Promise<void>}
 * @throws {Error} If update fails
 */
async function updateCondaEnvironment() {
  try {
    const installNeeded = await checkPythonPackages();

    if (!installNeeded) {
      logMessage("No packages to update");
      emitBootMessage("No packages to update");
      return;
    }

    // Add confirmation dialog
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Update", "Cancel"],
      defaultId: 0,
      title: "Python Package Updates",
      message: "Python package updates are available",
      detail: "Would you like to update the Python packages now?",
    });

    if (response === 1) {
      logMessage("Package update cancelled by user");
      emitBootMessage("Update cancelled");
      return;
    }

    emitBootMessage(`Updating packages...`);
    logMessage("Updating packages...");

    const pipExecutable = getPipPath();

    // Install all requirements at once
    const installCommand = [
      pipExecutable,
      "install",
      "-r",
      getRequirementsPath(),
    ];

    // Add PyTorch CUDA index for non-Darwin platforms
    if (process.platform !== "darwin") {
      installCommand.push("--extra-index-url");
      installCommand.push("https://download.pytorch.org/whl/cu121");
    }

    logMessage(`Running pip command: ${installCommand.join(" ")}`);
    await runPipCommand(installCommand);

    logMessage("Python packages update completed successfully");
  } catch (error) {
    logMessage(`Failed to update Pip packages: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Helper function to run pip commands
 * @param {string[]} command - The pip command array
 * @returns {Promise<void>}
 * @throws {Error} If pip command fails
 */
async function runPipCommand(command) {
  const updateProcess = spawn(command[0], command.slice(1), {
    stdio: "pipe",
    env: getProcessEnv(),
  });

  logMessage(`Running pip command: ${command.join(" ")}`);

  updateProcess.stdout.on("data", (data) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(`Pip update: ${message}`);
    }
  });

  updateProcess.stderr.on("data", (data) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(`Pip update error: ${message}`, "error");
    }
  });

  return new Promise((resolve, reject) => {
    updateProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pip command failed with code ${code}`));
      }
    });

    updateProcess.on("error", reject);
  });
}

/**
 * Get file size from URL using HEAD request
 * @param {string} url - The URL to check
 * @returns {Promise<number>} File size in bytes
 * @throws {Error} If size cannot be determined
 */
async function getFileSizeFromUrl(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "HEAD" }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        getFileSizeFromUrl(response.headers.location)
          .then(resolve)
          .catch(reject);
        return;
      }

      const contentLength = parseInt(response.headers["content-length"], 10);
      if (!contentLength) {
        reject(new Error("Could not determine file size"));
        return;
      }

      logMessage(`File size: ${contentLength} bytes for ${url}`);
      resolve(contentLength);
    });

    request.on("error", reject);
    request.end();
  });
}

/**
 * Download a file from a URL with validation
 * @param {string} url - Source URL
 * @param {string} dest - Destination file path
 * @returns {Promise<void>}
 * @throws {Error} If download fails
 */
async function downloadFile(url, dest) {
  logMessage(`Downloading file from ${url} to ${dest}`);

  const destDir = path.dirname(dest);
  const { accessible, error } = await checkPermissions(
    destDir,
    fs.constants.W_OK
  );
  if (!accessible) {
    logMessage(`Cannot write to download directory: ${error}`, "error");
    throw new Error(`Cannot write to download directory: ${error}`);
  }

  let expectedSize;
  try {
    expectedSize = await getFileSizeFromUrl(url);
    logMessage(`Expected file size: ${expectedSize} bytes`);
  } catch (error) {
    logMessage(`Failed to get file size from URL: ${error.message}`, "error");
    throw new Error(`Failed to get file size from URL: ${error.message}`);
  }

  let existingFileStats;
  try {
    existingFileStats = await fs.stat(dest);
    if (existingFileStats.size === expectedSize) {
      logMessage("Existing file matches expected size, skipping download");
      return;
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      logMessage(`Error checking existing file: ${err.message}`, "warn");
    }
  }

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let downloadedBytes = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;

    function calculateETA() {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const bytesPerSecond = downloadedBytes / elapsedSeconds;
      const remainingBytes = expectedSize - downloadedBytes;
      const remainingSeconds = remainingBytes / bytesPerSecond;

      if (remainingSeconds < 60) {
        return `${Math.round(remainingSeconds)} seconds left`;
      } else if (remainingSeconds < 3600) {
        return `${Math.round(remainingSeconds / 60)} minutes left`;
      } else {
        return `${Math.round(remainingSeconds / 3600)} hours left`;
      }
    }

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function handleResponse(response) {
      if (response.statusCode === 404) {
        logMessage(`File not found at ${url}`, "error");
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        logMessage(`Redirected to ${response.headers.location}`);
        https
          .get(response.headers.location, handleResponse)
          .on("error", handleError);
        return;
      }

      const contentLength = parseInt(response.headers["content-length"], 10);
      if (contentLength !== expectedSize) {
        logMessage(
          `Server file size mismatch. Expected: ${expectedSize}, Got: ${contentLength}`,
          "error"
        );
        reject(
          new Error(
            `Server file size mismatch. Expected: ${expectedSize}, Got: ${contentLength}`
          )
        );
        return;
      }

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / expectedSize) * 100;
        const fileName = path.basename(dest).split(".")[0];

        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          const eta = calculateETA();
          emitUpdateProgress(fileName, progress, "Downloading", eta);
          lastUpdate = now;
        }
      });

      response.pipe(file);

      file.on("finish", async () => {
        try {
          const stats = await fs.stat(dest);
          if (stats.size !== expectedSize) {
            await fs.unlink(dest);
            reject(
              new Error(
                `Downloaded file size mismatch. Expected: ${expectedSize}, Got: ${stats.size}`
              )
            );
            return;
          }
          logMessage(`Download completed and verified: ${dest}`);
          resolve();
        } catch (err) {
          reject(new Error(`Failed to verify downloaded file: ${err.message}`));
        }
      });
    }

    function handleError(err) {
      logMessage(`Error downloading file: ${err.message}`, "error");
      file.close();
      fs.unlink(dest).then(() => {
        reject(new Error(`Error downloading file: ${err.message}`));
      });
    }
  });
}

/**
 * Get environment size based on platform
 * @returns {string} Human readable size (e.g., "2.5 GB")
 */
function getEnvironmentSize() {
  switch (process.platform) {
    case "darwin":
      return "2.5 GB";
    case "linux":
      return "8 GB";
    case "win32":
      return "8 GB";
    default:
      return "unknown";
  }
}

/**
 * Get the default installation location based on platform
 * @returns {string} Path to default installation directory
 */
function getDefaultInstallLocation() {
  switch (process.platform) {
    case "win32":
      // Use ProgramData on Windows for all users, or AppData for current user
      return process.env.ALLUSERSPROFILE
        ? path.join(process.env.ALLUSERSPROFILE, "nodetool", "conda_env")
        : path.join(process.env.APPDATA, "nodetool", "conda_env");
    case "darwin":
      // Use /Library/Application Support for all users, or ~/Library/Application Support for current user
      return process.env.SUDO_USER
        ? path.join("/Library/Application Support/nodetool/conda_env")
        : path.join(
            os.homedir(),
            "Library/Application Support/nodetool/conda_env"
          );
    case "linux":
      // Use /opt for all users, or ~/.local/share for current user
      return process.env.SUDO_USER
        ? "/opt/nodetool/conda_env"
        : path.join(os.homedir(), ".local/share/nodetool/conda_env");
    default:
      return path.join(os.homedir(), ".nodetool/conda_env");
  }
}

/**
 * Format bytes to human readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "1.5 GB")
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Prompt user for installation location
 * @returns {Promise<string>} Selected installation path
 * @throws {Error} If user cancels or no location selected
 */
async function promptForInstallLocation() {
  let downloadSize;
  let installedSize = getEnvironmentSize();
  try {
    const sizeInBytes = await getCondaEnvSize();
    downloadSize = formatBytes(sizeInBytes);
  } catch (error) {
    logMessage(`Failed to get download size: ${error.message}`, "warn");
    downloadSize = getEnvironmentSize();
  }

  const defaultLocation = getDefaultInstallLocation();

  const result = await dialog.showMessageBox({
    type: "info",
    buttons: ["Use Default Location", "Choose Custom Location", "Cancel"],
    defaultId: 0,
    title: "Python Environment Setup",
    message: "Installing Machine Learning Environment",
    detail:
      `Nodetool comes with a complete machine learning environment that includes:\n\n` +
      `• PyTorch for ML inference\n` +
      `• CUDA support for GPU acceleration (Windows/Linux)\n` +
      `• Scientific computing libraries (NumPy, SciPy, etc.)\n` +
      `• Image processing libraries\n` +
      `• All required dependencies\n\n` +
      `This "batteries included" approach ensures everything works correctly without manual setup.\n\n` +
      `Download size: ${downloadSize}\n` +
      `Size on disk after installation: ${installedSize}\n\n` +
      `Recommended location:\n${defaultLocation}`,
  });

  if (result.response === 2) {
    throw new Error("Installation cancelled by user");
  }

  let selectedPath;
  if (result.response === 0) {
    selectedPath = defaultLocation;
  } else {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select Python Environment Location",
      buttonLabel: "Select Folder",
      defaultPath: defaultLocation,
    });

    if (canceled || !filePaths?.[0]) {
      throw new Error("No installation location selected");
    }
    selectedPath = path.join(filePaths[0], "nodetool-python");
  }

  await updateSetting("CONDA_ENV", selectedPath);
  return selectedPath;
}

/**
 * Get the conda environment URL for the current platform
 * @returns {string} Download URL for conda environment
 * @throws {Error} If platform is not supported
 */
function getCondaEnvUrl() {
  const VERSION = app.getVersion();
  const platform = process.platform;
  const arch = process.arch;
  let fileName;

  if (platform === "win32") {
    fileName = `conda-env-windows-x64-${VERSION}.zip`;
  } else if (platform === "darwin") {
    const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
    fileName = `conda-env-darwin-${archSuffix}-${VERSION}.tar.gz`;
  } else if (platform === "linux") {
    fileName = `conda-env-linux-x64-${VERSION}.tar.gz`;
  } else {
    throw new Error("Unsupported platform");
  }

  return `https://packages.nodetool.ai/${fileName}`;
}

/**
 * Install the Python environment
 */
async function installCondaEnvironment() {
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

    logMessage("Python environment installation completed successfully");
    emitBootMessage("Python environment is ready");
  } catch (error) {
    logMessage(
      `Failed to install Python environment: ${error.message}`,
      "error"
    );
    throw error;
  }
}

/**
 * Extract the Python environment from a zip archive
 */
async function unpackEnvironment(sourcePath, destPath, extractFn) {
  emitBootMessage("Unpacking the Python environment...");
  logMessage(`Unpacking Python environment from ${sourcePath} to ${destPath}`);

  try {
    // Check source file permissions and existence
    const { accessible: canRead, error: readError } = await checkPermissions(
      sourcePath,
      fs.constants.R_OK
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
  } catch (err) {
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
 * Run conda-unpack process
 * @param {string} destPath - Destination path where environment is installed
 * @returns {Promise<void>}
 * @throws {Error} If conda-unpack fails
 */
async function runCondaUnpack(destPath) {
  emitBootMessage("Running conda-unpack (may take a few minutes)...");
  const unpackScript = getCondaUnpackPath();

  logMessage(`Conda-unpack script: ${unpackScript}`);
  if (!(await fileExists(unpackScript))) {
    throw new Error(`conda-unpack script not found at: ${unpackScript}`);
  }

  // Make script executable on Unix systems
  if (process.platform !== "win32") {
    await fs.chmod(unpackScript, "755");
  }

  const unpackProcess = spawn(unpackScript, [], {
    stdio: "pipe",
    env: getProcessEnv(),
    cwd: destPath,
  });

  emitUpdateProgress("Python environment", 100, "Finalizing", "Almost done");

  return new Promise((resolve, reject) => {
    const unpackTimeout = setTimeout(() => {
      unpackProcess.kill();
      reject(new Error("conda-unpack process timed out after 30 minutes"));
    }, 30 * 60 * 1000);

    unpackProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda-unpack: ${message}`);
    });

    unpackProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) logMessage(`conda-unpack error: ${message}`, "error");
    });

    unpackProcess.on("exit", (code) => {
      clearTimeout(unpackTimeout);
      if (code === 0) {
        logMessage("conda-unpack completed successfully");
        emitBootMessage("Python environment unpacked successfully");
        resolve();
      } else {
        reject(new Error(`conda-unpack failed with code ${code}`));
      }
    });

    unpackProcess.on("error", (err) => {
      clearTimeout(unpackTimeout);
      reject(new Error(`Error running conda-unpack: ${err.message}`));
    });
  });
}

/**
 * Extract zip archive
 * @param {string} zipPath - Path to zip file
 * @param {string} destPath - Destination directory
 * @param {number} totalSize - Total size of archive in bytes
 * @returns {Promise<void>}
 * @throws {Error} If extraction fails
 */
async function extractZip(zipPath, destPath, totalSize) {
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
 * @param {string} tarPath - Path to tar.gz file
 * @param {string} destPath - Destination directory
 * @param {number} totalSize - Total size of archive in bytes
 * @returns {Promise<void>}
 * @throws {Error} If extraction fails
 */
async function extractTarGz(tarPath, destPath, totalSize) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastUpdate = startTime;
    let processedBytes = 0;

    const extractStream = createReadStream(tarPath, {
      highWaterMark: 64 * 1024,
    })
      .on("data", (chunk) => {
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

// Replace existing unpack functions with calls to the new unified function
async function unpackPythonEnvironment(zipPath, destPath) {
  await unpackEnvironment(zipPath, destPath, extractZip);
}

async function unpackTarGzEnvironment(tarPath, destPath) {
  await unpackEnvironment(tarPath, destPath, extractTarGz);
}

/**
 * Calculate estimated time remaining for extraction
 * @param {number} startTime - Start time in milliseconds
 * @param {number} processedBytes - Number of bytes processed
 * @param {number} totalBytes - Total number of bytes
 * @returns {string} Formatted time remaining string
 */
function calculateExtractETA(startTime, processedBytes, totalBytes) {
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
 * Download a file's contents directly to a string
 * @param {string} filePath - The path to the file to download
 * @returns {Promise<string>} The file contents as a string
 * @throws {Error} If download fails
 */
async function downloadFromFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data;
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

/**
 * Download a file's contents directly to a string
 * @param {string} url - The URL to download from
 * @returns {Promise<string>} The file contents as a string
 * @throws {Error} If download fails
 */
async function downloadToString(url) {
  if (url.startsWith("file://")) {
    return downloadFromFile(url.replace("file://", ""));
  }

  return new Promise((resolve, reject) => {
    let data = "";

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function handleResponse(response) {
      if (response.statusCode === 404) {
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        https
          .get(response.headers.location, handleResponse)
          .on("error", handleError);
        return;
      }

      response.setEncoding("utf8");
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => resolve(data));
      response.on("error", handleError);
    }

    function handleError(err) {
      reject(new Error(`Error downloading file: ${err.message}`));
    }
  });
}

/**
 * Get the conda environment size from remote URL
 * @returns {Promise<number>} Size in bytes
 * @throws {Error} If size cannot be determined
 */
async function getCondaEnvSize() {
  try {
    const url = getCondaEnvUrl();
    const size = await getFileSizeFromUrl(url);
    return size;
  } catch (error) {
    logMessage(`Failed to get conda env size: ${error.message}`, "error");
    throw error;
  }
}

module.exports = {
  checkPythonPackages,
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
  installCondaEnvironment,
  downloadToString,
  getCondaEnvUrl,
  getCondaEnvSize,
};
