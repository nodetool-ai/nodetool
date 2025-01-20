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

import { contextBridge, ipcRenderer, shell, IpcRendererEvent } from "electron";

interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  logs: string[];
}

interface DownloadProgressData {
  componentName: string;
  progress: number;
}

interface SaveFileOptions {
  buffer: Buffer;
  defaultPath: string;
  filters: FileFilter[];
}

interface FileFilter {
  name: string;
  extensions: string[];
}

type CallbackFunction<T = any> = (data: T) => void;

/**
 * Expose protected methods that allow the renderer process to use
 * specific ipcRenderer methods without exposing the entire ipcRenderer object.
 */
contextBridge.exposeInMainWorld("api", {
  /**
   * Retrieves the current state of the NodeTool server.
   * @returns {Promise<ServerState>}
   *          A promise that resolves to an object containing:
   *          - isStarted: Whether the server has started
   *          - bootMsg: The current boot message
   *          - logs: An array of server log messages
   */
  getServerState: (): Promise<ServerState> =>
    ipcRenderer.invoke("get-server-state"),

  /**
   * Registers a callback to be invoked when the server has started.
   * @param {CallbackFunction} callback - The function to be called when the server starts
   */
  onServerStarted: (callback: CallbackFunction) =>
    ipcRenderer.on("server-started", (_event: IpcRendererEvent, info: any) =>
      callback(info)
    ),

  /**
   * Registers a callback to receive boot messages.
   * @param {CallbackFunction<string>} callback - The function to be called with each boot message
   */
  onBootMessage: (callback: CallbackFunction<string>) =>
    ipcRenderer.on(
      "boot-message",
      (_event: IpcRendererEvent, message: string) => callback(message)
    ),

  /**
   * Registers a callback to receive server log messages.
   * @param {CallbackFunction<string>} callback - The function to be called with each log message
   */
  onServerLog: (callback: CallbackFunction<string>) =>
    ipcRenderer.on("server-log", (_event: IpcRendererEvent, message: string) =>
      callback(message)
    ),

  /**
   * Registers a callback to receive download progress updates.
   * This is used during the component download process to show the progress
   * of each component being downloaded.
   * @param {CallbackFunction<DownloadProgressData>} callback - The function to be called with download progress data
   */
  onUpdateProgress: (callback: CallbackFunction<DownloadProgressData>) =>
    ipcRenderer.on(
      "update-progress",
      (_event: IpcRendererEvent, data: DownloadProgressData) => callback(data)
    ),

  /**
   * Gets the path to the application's log file.
   * @returns {Promise<string>} A promise that resolves to the full path of the log file
   */
  getLogFilePath: (): Promise<string> =>
    ipcRenderer.invoke("get-log-file-path"),

  /**
   * Opens the application's log file in the system's default text editor.
   * @returns {Promise<void>} A promise that resolves when the file is opened
   */
  openLogFile: (): Promise<void> => ipcRenderer.invoke("open-log-file"),

  /**
   * Saves a file to disk with the provided content and options.
   * @param {Buffer} buffer - The content to save to the file
   * @param {string} defaultPath - The default file path to suggest in the save dialog
   * @param {FileFilter[]} filters - File filters for the save dialog
   * @returns {Promise<string>} A promise that resolves to the path where the file was saved
   */
  saveFile: (
    buffer: Buffer,
    defaultPath: string,
    filters: FileFilter[]
  ): Promise<string> =>
    ipcRenderer.invoke("save-file", {
      buffer,
      defaultPath,
      filters,
    } as SaveFileOptions),

  /**
   * Runs a specific workflow in the application.
   * @param {string} workflowId - The ID of the workflow to run
   * @returns {Promise<void>} A promise that resolves when the workflow starts
   */
  runApp: (workflowId: string): Promise<void> =>
    ipcRenderer.invoke("run-app", workflowId),

  /**
   * Registers a callback to be invoked when an update is available.
   * @param {CallbackFunction} callback - The function to be called when an update is available
   */
  onUpdateAvailable: (callback: CallbackFunction) =>
    ipcRenderer.on("update-available", (_event: IpcRendererEvent, info: any) =>
      callback(info)
    ),

  /**
   * Initiates the installation of a pending update.
   * @returns {Promise<void>} A promise that resolves when the update installation begins
   */
  installUpdate: (): Promise<void> => ipcRenderer.invoke("install-update"),

  /**
   * Opens a URL in the user's default external browser.
   * @param {string} url - The URL to open
   * @returns {Promise<void>} A promise that resolves when the URL is opened
   */
  openExternal: (url: string): Promise<void> => shell.openExternal(url),
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
