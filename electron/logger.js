const { app } = require("electron");
const path = require("path");
const log = require("electron-log");
const { appendFile } = require("fs").promises;
const { emitServerLog } = require("./events");

/** @type {string} */
const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

/**
 * Log levels supported by the logger
 * @typedef {'info' | 'warn' | 'error'} LogLevel
 */

/**
 * Removes ANSI escape codes and other terminal control characters from log messages
 * @param {string} message - The log message to clean
 * @returns {string} The cleaned log message
 */
function cleanLogMessage(message) {
  // Remove ANSI escape sequences
  const ansiRegex =
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  // Remove other common terminal control characters
  const controlRegex = /[\x00-\x1F\x7F-\x9F]/g;

  return message.replace(ansiRegex, "").replace(controlRegex, "");
}

/**
 * Enhanced logging function that writes to file and emits to renderer
 * @param {string} message - The message to log
 * @param {LogLevel} [level='info'] - The log level
 */
function logMessage(message, level = "info") {
  try {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}`;
    log[level](fullMessage);

    // Send raw message to renderer without timestamp/level prefix
    emitServerLog(message.trim());

    // Asynchronously write to log file
    appendFile(LOG_FILE, cleanLogMessage(fullMessage) + "\n").catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${error.message}`);
  }
}

module.exports = {
  LOG_FILE,
  logMessage,
};
