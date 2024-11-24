const { app } = require('electron');
const path = require('path');
const log = require('electron-log');
const { appendFile } = require('fs').promises;
const { emitServerLog } = require('./events');

const LOG_FILE = path.join(app.getPath("userData"), "nodetool.log");

/**
 * Enhanced logging function.
 * @param {string} message - The message to log.
 * @param {'info' | 'warn' | 'error'} [level='info'] - The log level.
 */
function logMessage(message, level = "info") {
  try {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}\n`;
    log[level](fullMessage);
    
    // Send raw message to renderer without timestamp/level prefix
    emitServerLog(message.trim());
    // Asynchronously write to log file
    appendFile(LOG_FILE, fullMessage).catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${error.message}`);
  }
}

module.exports = {
  LOG_FILE,
  logMessage
}; 