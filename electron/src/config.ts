import * as path from "path";
import { app } from "electron";
import { logMessage } from "./logger";
import * as fs from "fs";
import { readSettings, updateSetting } from "./settings";

// Base paths
const resourcesPath: string = process.resourcesPath;
const srcPath: string = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "..", "src");

const userDataPath: string = app.getPath("userData");
const legacyCondaPath: string = path.join(userDataPath, "conda_env");
const webPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "web", "dist");
const appsPath: string = app.isPackaged
  ? path.join(process.resourcesPath, "apps")
  : path.join(__dirname, "..", "..", "apps", "dist");

const PID_FILE_PATH: string = path.join(app.getPath("userData"), "server.pid");
const LAUNCHD_SERVICE_NAME: string = "ai.nodetool.server";
const PLIST_PATH: string = path.join(
  app.getPath("home"),
  `Library/LaunchAgents/${LAUNCHD_SERVICE_NAME}.plist`
);

const getCondaEnvPath = (): string => {
  const settings = readSettings();

  // Check if legacy path exists and settings doesn't have CONDA_ENV
  if (!settings.CONDA_ENV && fs.existsSync(legacyCondaPath)) {
    // Update settings with legacy path
    updateSetting("CONDA_ENV", legacyCondaPath);
    logMessage("Migrated legacy conda environment path to settings");
    return legacyCondaPath;
  }

  const condaPath: string = settings.CONDA_ENV || legacyCondaPath;

  return condaPath;
};

const getRequirementsPath = (): string => {
  const userRequirements: string = path.join(userDataPath, "requirements.txt");
  const defaultRequirements: string = path.join(
    resourcesPath,
    "requirements.txt"
  );

  try {
    // Synchronously check if user requirements exists
    fs.accessSync(userRequirements);
    return userRequirements;
  } catch {
    return defaultRequirements;
  }
};

const getPythonPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "python.exe")
    : path.join(getCondaEnvPath(), "bin", "python");

const getPipPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Scripts", "pip.exe")
    : path.join(getCondaEnvPath(), "bin", "pip");

const getCondaUnpackPath = (): string =>
  process.platform === "win32"
    ? path.join(getCondaEnvPath(), "Scripts", "conda-unpack.exe")
    : path.join(getCondaEnvPath(), "bin", "conda-unpack");

const saveUserRequirements = (requirements: string): boolean => {
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

interface ProcessEnv {
  [key: string]: string;
}

const getProcessEnv = (): ProcessEnv => {
  const condaPath: string = getCondaEnvPath();

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

export {
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
  appsPath,
};
