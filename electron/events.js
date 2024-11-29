/** @typedef {import('./state').ServerState} ServerState */
const { getMainWindow, serverState } = require("./state");

/**
 * Emit a boot message to the renderer process
 * @param {string} message - The boot message to emit
 */
function emitBootMessage(message) {
  serverState.bootMsg = message;
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("boot-message", message);
  }
}

/**
 * Emit server started event to the renderer process
 */
function emitServerStarted() {
  serverState.isStarted = true;
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("server-started");
  }
}

/**
 * Emit a server log message to the renderer process
 * @param {string} message - The log message to emit
 */
function emitServerLog(message) {
  serverState.logs.push(message);
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("server-log", message);
  }
}

/**
 * Emit update progress to the renderer process
 * @param {string} componentName - Name of the component being updated
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} action - Current action being performed
 * @param {string} [eta] - Estimated time remaining
 */
function emitUpdateProgress(componentName, progress, action, eta) {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("update-progress", {
      componentName,
      progress,
      action,
      eta,
    });
  }
}

module.exports = {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitUpdateProgress,
};
