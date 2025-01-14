const path = require("path");
const { app } = require("electron");
const { logMessage } = require("./logger");
const fs = require("fs");
const os = require("os");

// Base paths
const resourcesPath = process.resourcesPath;
const srcPath = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "src");

const userDataPath = app.getPath("userData");
const legacyCondaPath = path.join(userDataPath, "conda_env");
const webPath = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "../web/dist");

const PID_FILE_PATH = path.join(app.getPath("userData"), "server.pid");
const LAUNCHD_SERVICE_NAME = "ai.nodetool.server";
const PLIST_PATH = path.join(
  app.getPath("home"),
  `Library/LaunchAgents/${LAUNCHD_SERVICE_NAME}.plist`
);

const getCondaEnvPath = () => {
  const settings = require("./settings").readSettings();

  // Check if legacy path exists and settings doesn't have CONDA_ENV
  if (!settings.CONDA_ENV && fs.existsSync(legacyCondaPath)) {
    // Update settings with legacy path
    const settingsManager = require("./settings");
    settingsManager.updateSetting("CONDA_ENV", legacyCondaPath);
    logMessage("Migrated legacy conda environment path to settings");
    return legacyCondaPath;
  }

  const condaPath = settings.CONDA_ENV || legacyCondaPath;

  return condaPath;
};

const getRequirementsPath = () => {
  const userRequirements = path.join(userDataPath, "requirements.txt");
  const defaultRequirements = app.isPackaged
    ? path.join(resourcesPath, "requirements.txt")
    : path.join(__dirname, "..", "requirements.txt");

  try {
    // Synchronously check if user requirements exists
    fs.accessSync(userRequirements);
    return userRequirements;
  } catch {
    return defaultRequirements;
  }
};

const getPythonPath = () =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "python.exe")
    : path.join(getCondaEnvPath(), "bin", "python");

const getPipPath = () =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Scripts", "pip.exe")
    : path.join(getCondaEnvPath(), "bin", "pip");

const getCondaUnpackPath = () =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Scripts", "conda-unpack.exe")
    : path.join(getCondaEnvPath(), "bin", "conda-unpack");

const saveUserRequirements = (requirements) => {
  logMessage(
    `Saving user requirements to ${path.join(userDataPath, "requirements.txt")}`
  );
  try {
    fs.writeFileSync(path.join(userDataPath, "requirements.txt"), requirements);
    return true;
  } catch (error) {
    logMessage(`Failed to save user requirements: ${error}`);
    return false;
  }
};

const getProcessEnv = () => {
  const condaPath = getCondaEnvPath();

  return {
    ...process.env,
    PYTHONPATH: srcPath,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    PATH:
      process.platform === "win32"
        ? [
            path.join(condaPath),
            path.join(condaPath, "Library", "mingw-w64", "bin"),
            path.join(condaPath, "Library", "usr", "bin"),
            path.join(condaPath, "Library", "bin"),
            path.join(condaPath, "Lib", "site-packages", "torch", "lib"),
            path.join(condaPath, "Scripts"),
            process.env.PATH,
          ].join(path.delimiter)
        : [
            path.join(condaPath, "bin"),
            path.join(condaPath, "lib"),
            process.env.PATH,
          ].join(path.delimiter),
  };
};

module.exports = {
  getCondaEnvPath,
  getRequirementsPath,
  getPythonPath,
  getPipPath,
  getCondaUnpackPath,
  saveUserRequirements,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  LAUNCHD_SERVICE_NAME,
  PLIST_PATH,
  webPath,
};
