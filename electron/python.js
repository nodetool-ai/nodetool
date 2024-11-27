const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const { spawn } = require("child_process");
const os = require("os");
const { app } = require("electron");
const https = require("https");
const StreamZip = require("node-stream-zip");
const { logMessage } = require("./logger");
const { checkPermissions, fileExists } = require("./utils");
const { getMainWindow } = require("./window");
const { LOG_FILE } = require("./logger");
const { dialog } = require("electron");
const { emitBootMessage, emitUpdateProgress } = require("./events");
const tar = require("tar-fs");
const gunzip = require("gunzip-maybe");
const { createReadStream } = require("fs");

// Path configurations
const resourcesPath = process.resourcesPath;
const srcPath = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "src");

const requirementsFilePath = app.isPackaged
  ? path.join(resourcesPath, "requirements.txt")
  : path.join(__dirname, "..", "requirements.txt");

const appDir =
  process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath("exe"));
const condaEnvPath = process.env.CONDA_PREFIX || path.join(appDir, "conda_env");

// Environment configuration
const processEnv = {
  ...process.env,
  PYTHONPATH: srcPath,
  PYTHONUNBUFFERED: "1",
  PYTHONNOUSERSITE: "1",
  PATH:
    process.platform === "win32"
      ? [
          path.join(condaEnvPath),
          path.join(condaEnvPath, "Library", "mingw-w64", "bin"),
          path.join(condaEnvPath, "Library", "usr", "bin"),
          path.join(condaEnvPath, "Library", "bin"),
          path.join(condaEnvPath, "Lib", "site-packages", "torch", "lib"),
          path.join(condaEnvPath, "Scripts"),
          process.env.PATH,
        ].join(path.delimiter)
      : [
          path.join(condaEnvPath, "bin"),
          path.join(condaEnvPath, "lib"),
          process.env.PATH,
        ].join(path.delimiter),
};

/**
 * Check if installed packages match requirements
 */
async function checkPythonPackages() {
  try {
    const pipExecutable =
      process.platform === "win32"
        ? path.join(condaEnvPath, "Scripts", "pip.exe")
        : path.join(condaEnvPath, "bin", "pip");

    const reportFile = os.tmpdir() + "/pip-report.json";

    emitBootMessage("Checking installed packages...");

    // Build command array with the same extra indexes as updateCondaEnvironment
    const checkCommand = [
      "install",
      "-r",
      requirementsFilePath,
      "--dry-run",
      "--report",
      reportFile,
    ];

    // Use pip install --dry-run --report to get JSON output
    const checkProcess = spawn(pipExecutable, checkCommand, {
      stdio: "pipe",
      env: processEnv,
    });

    await new Promise((resolve, reject) => {
      checkProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pip check failed with code ${code}`));
        }
      });
      checkProcess.on("error", reject);
    });

    try {
      const reportContent = await fsPromises.readFile(reportFile, "utf8");
      await fsPromises
        .unlink(reportFile)
        .catch((err) =>
          logMessage(
            `Warning: Could not delete temporary report file: ${err.message}`,
            "warn"
          )
        );
      return JSON.parse(reportContent).install;
    } catch (fileError) {
      logMessage(
        `Error handling pip report file: ${fileError.message}`,
        "error"
      );
      throw fileError;
    }
  } catch (error) {
    logMessage(`Error checking Python packages: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Verify write permissions for critical paths
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
 */
async function isCondaEnvironmentInstalled() {
  try {
    const pythonExecutablePath =
      process.platform === "win32"
        ? path.join(condaEnvPath, "python.exe")
        : path.join(condaEnvPath, "bin", "python");

    await fsPromises.access(pythonExecutablePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update the Python environment packages
 */
async function updateCondaEnvironment() {
  try {
    const packagesToInstall = await checkPythonPackages();

    if (packagesToInstall.length === 0) {
      emitBootMessage("No packages to update");
      return;
    }

    emitBootMessage(`Updating ${packagesToInstall.length} packages...`);

    const pipExecutable =
      process.platform === "win32"
        ? path.join(condaEnvPath, "Scripts", "pip.exe")
        : path.join(condaEnvPath, "bin", "pip");

    // Install all requirements at once
    const installCommand = [
      pipExecutable,
      "install",
      "-r",
      requirementsFilePath,
    ];

    // Add PyTorch CUDA index for non-Darwin platforms
    if (process.platform !== "darwin") {
      installCommand.push("--extra-index-url");
      installCommand.push("https://download.pytorch.org/whl/cu121");
    }

    await runPipCommand(installCommand);

    // Special handling for bitsandbytes on Windows
    if (process.platform === "win32") {
      // Uninstall existing bitsandbytes
      await runPipCommand([pipExecutable, "uninstall", "bitsandbytes", "-y"]);

      // Install from custom index
      await runPipCommand([
        pipExecutable,
        "install",
        "bitsandbytes",
        "--extra-index-url",
        "https://jllllll.github.io/bitsandbytes-windows-webui",
      ]);
    }

    logMessage("Python packages update completed successfully");
  } catch (error) {
    logMessage(`Failed to update Pip packages: ${error.message}`, "error");
    throw error;
  }
}

// Helper function to run pip commands
async function runPipCommand(command) {
  const updateProcess = spawn(command[0], command.slice(1), {
    stdio: "pipe",
    env: processEnv,
  });

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
      resolve(contentLength);
    });

    request.on("error", reject);
    request.end();
  });
}

/**
 * Download a file from a URL with validation.
 */
async function downloadFile(url, dest) {
  logMessage(`Downloading file from ${url} to ${dest}`);

  const destDir = path.dirname(dest);
  const { accessible, error } = await checkPermissions(
    destDir,
    fs.constants.W_OK
  );
  if (!accessible) {
    throw new Error(`Cannot write to download directory: ${error}`);
  }

  let expectedSize;
  try {
    expectedSize = await getFileSizeFromUrl(url);
    logMessage(`Expected file size: ${expectedSize} bytes`);
  } catch (error) {
    throw new Error(`Failed to get file size from URL: ${error.message}`);
  }

  let existingFileStats;
  try {
    existingFileStats = await fsPromises.stat(dest);
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
    const file = fs.createWriteStream(dest);
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
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        https
          .get(response.headers.location, handleResponse)
          .on("error", handleError);
        return;
      }

      const contentLength = parseInt(response.headers["content-length"], 10);
      if (contentLength !== expectedSize) {
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
          const stats = await fsPromises.stat(dest);
          if (stats.size !== expectedSize) {
            await fsPromises.unlink(dest);
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
      file.close();
      fsPromises.unlink(dest).then(() => {
        logMessage(`Error downloading file: ${err.message}`, "error");
        reject(new Error(`Error downloading file: ${err.message}`));
      });
    }
  });
}

/**
 * Install the Python environment
 */
async function installCondaEnvironment() {
  try {
    emitBootMessage("Setting up Python environment...");
    logMessage(`Setting up Python environment at: ${condaEnvPath}`);

    const platform = process.platform;
    const arch = process.arch;
    const VERSION = app.getVersion();

    let environmentUrl = "";
    let archivePath = "";

    if (platform === "win32") {
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-windows-x64-${VERSION}.zip`;
      archivePath = path.join(
        os.tmpdir(),
        `conda-env-windows-x64-${VERSION}.zip`
      );
    } else if (platform === "darwin") {
      const archSuffix = arch === "arm64" ? "arm64" : "x86_64";
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-darwin-${archSuffix}-${VERSION}.tar.gz`;
      archivePath = path.join(
        os.tmpdir(),
        `conda-env-darwin-${archSuffix}-${VERSION}.tar.gz`
      );
    } else if (platform === "linux") {
      environmentUrl = `https://nodetool-conda.s3.amazonaws.com/conda-env-linux-x64-${VERSION}.tar.gz`;
      archivePath = path.join(
        os.tmpdir(),
        `conda-env-linux-x64-${VERSION}.tar.gz`
      );
    } else {
      throw new Error(
        "Unsupported platform for Python environment installation."
      );
    }

    await fsPromises.mkdir(path.dirname(archivePath), { recursive: true });

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

    await fsPromises.mkdir(condaEnvPath, { recursive: true });
    emitBootMessage("Unpacking Python environment...");
    if (platform === "win32") {
      await unpackPythonEnvironment(archivePath, condaEnvPath);
    } else {
      await unpackTarGzEnvironment(archivePath, condaEnvPath);
    }

    await fsPromises.unlink(archivePath);

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
async function unpackPythonEnvironment(zipPath, destPath) {
  emitBootMessage("Unpacking the Python environment...");
  let zip = null;

  try {
    const { accessible: canReadZip, error: zipError } = await checkPermissions(
      zipPath,
      fs.constants.R_OK
    );
    if (!canReadZip) {
      throw new Error(`Cannot read zip file: ${zipError}`);
    }

    const { accessible: canWriteDest, error: destError } =
      await checkPermissions(path.dirname(destPath), fs.constants.W_OK);
    if (!canWriteDest) {
      throw new Error(`Cannot write to destination: ${destError}`);
    }

    if (!(await fileExists(zipPath))) {
      throw new Error(`Zip file not found at: ${zipPath}`);
    }

    const stats = await fsPromises.stat(zipPath);
    if (stats.size === 0) {
      throw new Error("Downloaded zip file is empty");
    }

    const totalSize = stats.size;
    let extractedSize = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;

    if (await fileExists(destPath)) {
      logMessage(`Removing existing environment at ${destPath}`);
      await fsPromises.rm(destPath, { recursive: true, force: true });
    }

    function calculateETA() {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const bytesPerSecond = extractedSize / elapsedSeconds;
      const remainingBytes = totalSize - extractedSize;
      const remainingSeconds = remainingBytes / bytesPerSecond;

      if (remainingSeconds < 60) {
        return `${Math.round(remainingSeconds)} seconds left`;
      } else if (remainingSeconds < 3600) {
        return `${Math.round(remainingSeconds / 60)} minutes left`;
      } else {
        return `${Math.round(remainingSeconds / 3600)} hours left`;
      }
    }

    try {
      zip = new StreamZip.async({ file: zipPath });
      const entries = await zip.entries();
      const totalEntries = Object.keys(entries).length;

      if (totalEntries === 0) {
        throw new Error("Zip file contains no entries");
      }

      let processedEntries = 0;
      const failedEntries = [];

      for (const [name, entry] of Object.entries(entries)) {
        try {
          const fullPath = path.join(destPath, name);
          const dirPath = path.dirname(fullPath);

          if (!fullPath.startsWith(destPath)) {
            throw new Error(`Invalid zip entry path: ${name}`);
          }

          await fsPromises.mkdir(dirPath, { recursive: true });

          if (!entry.isDirectory) {
            await zip.extract(name, fullPath);
            extractedSize += entry.size;
            processedEntries++;

            const fileStats = await fsPromises.stat(fullPath);
            if (fileStats.size !== entry.size) {
              throw new Error(`Size mismatch for ${name}`);
            }

            const progress = (processedEntries / totalEntries) * 100;
            const now = Date.now();

            if (now - lastUpdate >= 1000) {
              const eta = calculateETA();
              emitUpdateProgress(
                "Python environment",
                progress,
                "Extracting",
                eta
              );
              lastUpdate = now;
            }
          }
        } catch (entryError) {
          failedEntries.push({ name, error: entryError.message });
          logMessage(
            `Failed to extract entry ${name}: ${entryError.message}`,
            "error"
          );
        }
      }

      if (failedEntries.length > 0) {
        try {
          await fsPromises.rm(destPath, { recursive: true, force: true });
        } catch (cleanupError) {
          logMessage(
            `Warning: Failed to clean up after extraction error: ${cleanupError.message}`,
            "warn"
          );
        }
        throw new Error(`Failed to extract ${failedEntries.length} files`);
      }
    } finally {
      if (zip) {
        try {
          await zip.close();
        } catch (closeError) {
          logMessage(`Error closing zip file: ${closeError.message}`, "warn");
        }
      }
    }

    emitBootMessage("Running conda-unpack...");
    const unpackScript =
      process.platform === "win32"
        ? path.join(destPath, "Scripts", "conda-unpack.exe")
        : path.join(destPath, "bin", "conda-unpack");

    if (!(await fileExists(unpackScript))) {
      throw new Error(`conda-unpack script not found at: ${unpackScript}`);
    }

    const unpackProcess = spawn(unpackScript, [], {
      stdio: "pipe",
      env: processEnv,
      cwd: destPath,
    });

    const unpackTimeout = setTimeout(() => {
      unpackProcess.kill();
      throw new Error("conda-unpack process timed out after 30 minutes");
    }, 30 * 60 * 1000);

    unpackProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack: ${message}`);
      }
    });

    unpackProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack error: ${message}`, "error");
      }
    });

    await new Promise((resolve, reject) => {
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
  } catch (err) {
    const errorMsg = `Failed to unpack Python environment: ${err.message}`;
    logMessage(errorMsg, "error");
    logMessage(`Stack trace: ${err.stack}`, "error");

    try {
      if (await fileExists(destPath)) {
        await fsPromises.rm(destPath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      logMessage(`Error during cleanup: ${cleanupError.message}`, "error");
    }

    dialog.showErrorBox(
      "Installation Error",
      `Failed to install Python environment.\n\nError: ${err.message}\n\nPlease check the log file for more details.`
    );

    throw err;
  }
}

/**
 * Extract the Python environment from a tar.gz archive for Mac/Linux
 */
async function unpackTarGzEnvironment(tarPath, destPath) {
  emitBootMessage("Unpacking the Python environment...");

  try {
    const { accessible: canReadTar, error: tarError } = await checkPermissions(
      tarPath,
      fs.constants.R_OK
    );
    if (!canReadTar) {
      throw new Error(`Cannot read tar file: ${tarError}`);
    }

    const stats = await fsPromises.stat(tarPath);
    if (stats.size === 0) {
      throw new Error("Downloaded tar.gz file is empty");
    }

    if (await fileExists(destPath)) {
      logMessage(`Removing existing environment at ${destPath}`);
      await fsPromises.rm(destPath, { recursive: true, force: true });
    }

    await fsPromises.mkdir(destPath, { recursive: true });

    // Extract using tar-fs and gunzip-maybe
    await new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastUpdate = startTime;
      let processedBytes = 0;

      const extractStream = createReadStream(tarPath)
        .pipe(gunzip())
        .pipe(
          tar.extract(destPath, {
            map: (header) => {
              processedBytes += header.size;
              const progress = (processedBytes / stats.size) * 100;

              const now = Date.now();
              if (now - lastUpdate >= 1000) {
                const eta = calculateExtractETA(
                  startTime,
                  processedBytes,
                  stats.size
                );
                emitUpdateProgress(
                  "Python environment",
                  progress,
                  "Extracting",
                  eta
                );
                lastUpdate = now;
              }

              return header;
            },
          })
        );

      extractStream.on("finish", resolve);
      extractStream.on("error", reject);
    });

    // Run conda-unpack
    emitBootMessage("Running conda-unpack...");
    const unpackScript = path.join(destPath, "bin", "conda-unpack");

    if (!(await fileExists(unpackScript))) {
      throw new Error(`conda-unpack script not found at: ${unpackScript}`);
    }

    // Make the script executable
    await fsPromises.chmod(unpackScript, "755");

    const unpackProcess = spawn(unpackScript, [], {
      stdio: "pipe",
      env: processEnv,
      cwd: destPath,
    });

    const unpackTimeout = setTimeout(() => {
      unpackProcess.kill();
      throw new Error("conda-unpack process timed out after 30 minutes");
    }, 30 * 60 * 1000);

    unpackProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack: ${message}`);
      }
    });

    unpackProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        logMessage(`conda-unpack error: ${message}`, "error");
      }
    });

    await new Promise((resolve, reject) => {
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
  } catch (err) {
    const errorMsg = `Failed to unpack Python environment: ${err.message}`;
    logMessage(errorMsg, "error");
    logMessage(`Stack trace: ${err.stack}`, "error");

    try {
      if (await fileExists(destPath)) {
        await fsPromises.rm(destPath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      logMessage(`Error during cleanup: ${cleanupError.message}`, "error");
    }

    dialog.showErrorBox(
      "Installation Error",
      `Failed to install Python environment.\n\nError: ${err.message}\n\nPlease check the log file for more details.`
    );

    throw err;
  }
}

// Helper function to calculate ETA
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

module.exports = {
  processEnv,
  condaEnvPath,
  srcPath,
  requirementsFilePath,
  checkPythonPackages,
  verifyApplicationPaths,
  isCondaEnvironmentInstalled,
  updateCondaEnvironment,
  installCondaEnvironment,
};
