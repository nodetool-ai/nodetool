/**
 * Preload Script for NodeTool Electron Application
 *
 * This script serves as a secure bridge between the renderer process (web content)
 * and the main process of the Electron application. It exposes a limited set of
 * APIs to the renderer process, ensuring that only necessary and safe operations
 * are available to the web content.
 *
 * The exposed APIs allow the renderer to:
 * - Retrieve the current server state
 * - Listen for various events related to server status, boot messages, logs,
 *   update steps, and download progress
 */

const { contextBridge, ipcRenderer, shell } = require("electron");

/**
 * Expose protected methods that allow the renderer process to use
 * specific ipcRenderer methods without exposing the entire ipcRenderer object.
 */
contextBridge.exposeInMainWorld("api", {
  /**
   * Retrieves the current state of the NodeTool server.
   * @returns {Promise<{isStarted: boolean, bootMsg: string, logs: string[]}>}
   *          A promise that resolves to an object containing:
   *          - isStarted: Whether the server has started
   *          - bootMsg: The current boot message
   *          - logs: An array of server log messages
   */
  getServerState: () => ipcRenderer.invoke("get-server-state"),

  /**
   * Registers a callback to be invoked when the server has started.
   * @param {Function} callback - The function to be called when the server starts
   */
  onServerStarted: (callback) =>
    ipcRenderer.on("server-started", (event, info) => callback(info)),

  /**
   * Registers a callback to receive boot messages.
   * @param {Function} callback - The function to be called with each boot message
   *                              Signature: (message: string) => void
   */
  onBootMessage: (callback) =>
    ipcRenderer.on("boot-message", (event, message) => callback(message)),

  /**
   * Registers a callback to receive server log messages.
   * @param {Function} callback - The function to be called with each log message
   *                              Signature: (message: string) => void
   */
  onServerLog: (callback) =>
    ipcRenderer.on("server-log", (event, message) => callback(message)),

  /**
   * Registers a callback to receive download progress updates.
   * This is used during the component download process to show the progress
   * of each component being downloaded.
   * @param {Function} callback - The function to be called with download progress data
   *                              Signature: (data: {componentName: string, progress: number}) => void
   */
  onUpdateProgress: (callback) =>
    ipcRenderer.on("update-progress", (event, data) => callback(data)),

  /**
   * Gets the path to the application's log file.
   * @returns {Promise<string>} A promise that resolves to the full path of the log file
   */
  getLogFilePath: () => ipcRenderer.invoke("get-log-file-path"),

  /**
   * Opens the application's log file in the system's default text editor.
   * @returns {Promise<void>} A promise that resolves when the file is opened
   */
  openLogFile: () => ipcRenderer.invoke("open-log-file"),

  /**
   * Saves a file to disk with the provided content and options.
   * @param {Buffer} buffer - The content to save to the file
   * @param {string} defaultPath - The default file path to suggest in the save dialog
   * @param {Object[]} filters - File filters for the save dialog
   * @returns {Promise<string>} A promise that resolves to the path where the file was saved
   */
  saveFile: (buffer, defaultPath, filters) =>
    ipcRenderer.invoke("save-file", { buffer, defaultPath, filters }),

  /**
   * Runs a specific workflow in the application.
   * @param {string} workflowId - The ID of the workflow to run
   * @returns {Promise<void>} A promise that resolves when the workflow starts
   */
  runApp: (workflowId) => ipcRenderer.invoke("run-app", workflowId),

  /**
   * Registers a callback to be invoked when an update is available.
   * @param {Function} callback - The function to be called when an update is available
   *                             Signature: (info: Object) => void
   */
  onUpdateAvailable: (callback) =>
    ipcRenderer.on("update-available", (event, info) => callback(info)),

  /**
   * Initiates the installation of a pending update.
   * @returns {Promise<void>} A promise that resolves when the update installation begins
   */
  installUpdate: () => ipcRenderer.invoke("install-update"),

  /**
   * Opens a URL in the user's default external browser.
   * @param {string} url - The URL to open
   * @returns {Promise<void>} A promise that resolves when the URL is opened
   */
  openExternal: (url) => shell.openExternal(url),
});

/**
 * Note on IPC (Inter-Process Communication):
 *
 * The exposed methods use IPC to communicate between the main process and
 * the renderer process. Here's a brief explanation of the IPC methods used:
 *
 * - ipcRenderer.invoke: Used for request-response style IPC. It sends a
 *   message to the main process and waits for a response.
 *
 * - ipcRenderer.on: Used to listen for events sent from the main process.
 *   It registers a callback that will be called whenever the specified
 *   event is emitted by the main process.
 */
