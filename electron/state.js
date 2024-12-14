/** @typedef {import('electron').BrowserWindow} BrowserWindow */

/**
 * @typedef {Object} ServerState
 * @property {boolean} isStarted - Whether the server has started
 * @property {string} bootMsg - Current boot message
 * @property {string} initialURL - URL for the Python server
 * @property {string[]} logs - Array of server log messages
 */

/** @type {BrowserWindow|null} */
let mainWindow = null;

/** @type {ServerState} */
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: "http://127.0.0.1:8000", // Default URL for the Python server
  logs: [],
};

/**
 * Get the main application window
 * @returns {BrowserWindow|null} The main window instance or null
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Set the main application window
 * @param {BrowserWindow|null} window - The window instance to set
 */
function setMainWindow(window) {
  mainWindow = window;
}

module.exports = {
  getMainWindow,
  setMainWindow,
  serverState,
};
