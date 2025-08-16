import path from "path";
import os from "os";
import fs from "fs";
import yaml from "js-yaml";
import { logMessage } from "./logger";

// Add cache at the module level
let settingsCache: Record<string, any> | null = null;

/**
 * Gets the application's configuration directory path for storing data files
 * @param {string} filename - The name of the file
 * @returns {string} The complete file path
 * @throws {Error} If filename is not provided or invalid
 */
function getAppConfigPath(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new Error("Invalid filename provided");
  }

  const APP_FOLDER = "nodetool";
  const platform = process.platform;

  try {
    let basePath: string;

    if (platform === "linux" || platform === "darwin") {
      basePath = path.join(os.homedir(), ".config", APP_FOLDER);
    } else if (platform === "win32") {
      const appData = process.env.APPDATA;
      basePath = appData
        ? path.join(appData, APP_FOLDER)
        : path.join(os.homedir(), APP_FOLDER);
    } else {
      basePath = path.join(process.cwd(), "data");
    }

    // Ensure directory exists
    fs.mkdirSync(basePath, { recursive: true });

    return path.join(basePath, filename);
  } catch (error) {
    throw new Error(
      `Failed to create system file path: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Reads settings from cache or YAML file
 * @returns {Object} Settings object
 * @throws {Error} If reading or parsing fails
 */
function readSettings(): Record<string, any> {
  try {
    logMessage("=== Reading Settings ===");

    // Return cached settings if available
    if (settingsCache !== null) {
      logMessage("Returning cached settings");
      return settingsCache;
    }

    const settingsPath = getAppConfigPath("settings.yaml");
    logMessage(`Settings path: ${settingsPath}`);

    if (!fs.existsSync(settingsPath)) {
      logMessage("Settings file does not exist, returning empty settings");
      settingsCache = {};
      return settingsCache;
    }

    logMessage("Reading settings from " + settingsPath);
    const fileContents = fs.readFileSync(settingsPath, "utf8");
    logMessage(`File contents: ${fileContents}`);

    settingsCache = (yaml.load(fileContents) as Record<string, any>) || {};
    logMessage(`Parsed settings: ${JSON.stringify(settingsCache, null, 2)}`);

    for (const key in settingsCache) {
      logMessage(`${key}: ${settingsCache[key]}`);
    }

    return settingsCache;
  } catch (error) {
    logMessage(`Error reading settings: ${error}`, "error");
    throw new Error(
      `Failed to read settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Writes settings to the YAML file and updates cache
 * @param {Object} settings - Settings object to write
 * @throws {Error} If writing fails
 */
function writeSettings(settings: Record<string, any>): void {
  try {
    const settingsPath = getAppConfigPath("settings.yaml");
    const yamlString = yaml.dump(settings);
    fs.writeFileSync(settingsPath, yamlString, "utf8");
    // Update cache after successful write
    settingsCache = settings;
  } catch (error) {
    throw new Error(
      `Failed to write settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Updates a single setting field while preserving others
 * @param {string} key - The setting key to update
 * @param {any} value - The new value for the setting
 * @throws {Error} If updating fails or key is invalid
 */
function updateSetting(key: string, value: any): Record<string, any> {
  try {
    if (!key || typeof key !== "string") {
      throw new Error("Invalid setting key provided");
    }

    const currentSettings = readSettings();
    const updatedSettings = {
      ...currentSettings,
      [key]: value,
    };

    writeSettings(updatedSettings);
    return updatedSettings;
  } catch (error) {
    throw new Error(
      `Failed to update setting: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Updates multiple settings fields while preserving others
 * @param {Object} settings - Settings object to update
 * @throws {Error} If updating fails or key is invalid
 */
function updateSettings(settings: Record<string, any>): void {
  try {
    const currentSettings = readSettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
    };

    writeSettings(updatedSettings);
  } catch (error) {
    throw new Error(`Failed to update settings: ${error}`);
  }
}

export { getAppConfigPath, readSettings, updateSetting, updateSettings };
