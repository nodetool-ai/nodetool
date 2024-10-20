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

const { contextBridge, ipcRenderer } = require("electron");

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
  onServerStarted: (callback) => ipcRenderer.on("server-started", callback),

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
