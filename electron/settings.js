const path = require("path");
const os = require("os");
const fs = require("fs");
const yaml = require("js-yaml");

// Add cache at the module level
let settingsCache = null;

/**
 * Gets the application's configuration directory path for storing data files
 * @param {string} filename - The name of the file
 * @returns {string} The complete file path
 * @throws {Error} If filename is not provided or invalid
 */
function getAppConfigPath(filename) {
  if (!filename || typeof filename !== "string") {
    throw new Error("Invalid filename provided");
  }

  const APP_FOLDER = "nodetool";
  const platform = process.platform;

  try {
    let basePath;

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
    throw new Error(`Failed to create system file path: ${error.message}`);
  }
}

/**
 * Reads settings from cache or YAML file
 * @returns {Object} Settings object
 * @throws {Error} If reading or parsing fails
 */
function readSettings() {
  try {
    // Return cached settings if available
    if (settingsCache !== null) {
      return settingsCache;
    }

    const settingsPath = getAppConfigPath("settings.yaml");

    if (!fs.existsSync(settingsPath)) {
      settingsCache = {};
      return settingsCache;
    }

    const fileContents = fs.readFileSync(settingsPath, "utf8");
    settingsCache = yaml.load(fileContents) || {};
    return settingsCache;
  } catch (error) {
    throw new Error(`Failed to read settings: ${error.message}`);
  }
}

/**
 * Writes settings to the YAML file and updates cache
 * @param {Object} settings - Settings object to write
 * @throws {Error} If writing fails
 */
function writeSettings(settings) {
  try {
    const settingsPath = getAppConfigPath("settings.yaml");
    const yamlString = yaml.dump(settings);
    fs.writeFileSync(settingsPath, yamlString, "utf8");
    // Update cache after successful write
    settingsCache = settings;
  } catch (error) {
    throw new Error(`Failed to write settings: ${error.message}`);
  }
}

/**
 * Updates a single setting field while preserving others
 * @param {string} key - The setting key to update
 * @param {any} value - The new value for the setting
 * @throws {Error} If updating fails or key is invalid
 */
function updateSetting(key, value) {
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
    throw new Error(`Failed to update setting: ${error.message}`);
  }
}

module.exports = {
  getAppConfigPath,
  readSettings,
  writeSettings,
  updateSetting,
};
