/**
 * Preload Script for NodeTool Electron Application
 *
 * This script serves as a secure bridge between the renderer process (web content)
 * and the main process of the Electron application. It implements three core IPC
 * (Inter-Process Communication) patterns:
 *
 * 1. Request-Response Pattern (invoke/handle):
 *    - Renderer calls api.method() -> returns Promise
 *    - Main process handles request and sends response
 *    Example: getServerState()
 *
 * 2. Event Pattern (on/emit):
 *    - Main process emits events
 *    - Renderer listens via api.onEvent(callback)
 *    Example: onServerStarted()
 *
 * 3. Direct Message Pattern (send):
 *    - Renderer sends one-way messages to main
 *    - No response expected
 *    Example: windowControls.close()
 */

import { contextBridge, ipcRenderer, shell } from "electron";

import {
  InstallLocationData,
  IpcChannels,
  IpcEvents,
  IpcRequest,
  IpcResponse,
  MenuEventData,
  PythonPackages,
  ServerState,
  UpdateProgressData,
} from "./types.d";
import { UpdateInfo } from "electron-updater";

/**
 * Type definitions for IPC handlers
 *
 * IpcHandler: Handles request-response pattern
 * - T: The specific channel/method being called
 * - Takes request data of type IpcRequest[T]
 * - Returns promise of type IpcResponse[T]
 */
type IpcHandler<T extends keyof IpcRequest> = (
  data: IpcRequest[T]
) => Promise<IpcResponse[T]>;

/**
 * IpcEventHandler: Handles event pattern
 * - T: The specific event channel
 * - Takes callback function that handles event data
 * - No return value (void)
 */
type IpcEventHandler<T extends keyof IpcEvents> = (
  callback: (data: IpcEvents[T]) => void
) => void;

interface InstallLocationPrompt {
  defaultPath: string;
}

/**
 * Creates type-safe wrapper for request-response pattern
 *
 * Usage in main process:
 * ipcMain.handle(channel, async (event, data) => {
 *   // Handle request and return response
 * });
 *
 * Usage in renderer:
 * const response = await window.api.method(data);
 */
function createInvokeHandler<T extends keyof IpcRequest>(
  channel: T
): IpcHandler<T> {
  return (data: IpcRequest[T]) => ipcRenderer.invoke(channel, data);
}

/**
 * Creates type-safe wrapper for event pattern
 *
 * Usage in main process:
 * mainWindow.webContents.send(channel, data);
 *
 * Usage in renderer:
 * window.api.onEvent(data => {
 *   // Handle event data
 * });
 */
function createEventHandler<T extends keyof IpcEvents>(
  channel: T
): IpcEventHandler<T> {
  console.log("createEventHandler", channel);
  return (callback: (data: IpcEvents[T]) => void) => {
    ipcRenderer.on(channel as string, (_event, data: IpcEvents[T]) =>
      callback(data)
    );
  };
}

function unregisterEventHandler<T extends keyof IpcEvents>(
  channel: T,
  callback: (data: any) => void
): () => void {
  return () => {
    ipcRenderer.removeListener(channel as string, callback);
  };
}

/**
 * Expose the API to renderer process through contextBridge
 * This creates the window.api object in the renderer
 *
 * Security:
 * - Renderer can only access these specific methods
 * - No direct access to Node.js or Electron APIs
 * - All communication is type-safe and controlled
 */
contextBridge.exposeInMainWorld("api", {
  // Request-response methods
  getServerState: () => ipcRenderer.invoke(IpcChannels.GET_SERVER_STATE),
  clipboardWriteText: (text: string) =>
    ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_TEXT, text),
  clipboardReadText: () => ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_TEXT),
  openLogFile: () => ipcRenderer.invoke(IpcChannels.OPEN_LOG_FILE),
  selectDefaultInstallLocation: (packages: PythonPackages) =>
    ipcRenderer.invoke(IpcChannels.SELECT_DEFAULT_LOCATION, packages),
  selectCustomInstallLocation: (packages: PythonPackages) =>
    ipcRenderer.invoke(IpcChannels.SELECT_CUSTOM_LOCATION, packages),
  runApp: (workflowId: string) =>
    ipcRenderer.invoke(IpcChannels.RUN_APP, workflowId),

  // Event listeners
  onServerStarted: (callback: () => void) =>
    createEventHandler(IpcChannels.SERVER_STARTED)(callback),
  onBootMessage: (callback: (data: string) => void) =>
    createEventHandler(IpcChannels.BOOT_MESSAGE)(callback),
  onServerLog: (callback: (data: string) => void) =>
    createEventHandler(IpcChannels.SERVER_LOG)(callback),
  onUpdateProgress: (callback: (data: UpdateProgressData) => void) =>
    createEventHandler(IpcChannels.UPDATE_PROGRESS)(callback),
  onUpdateAvailable: (callback: (data: UpdateInfo) => void) =>
    createEventHandler(IpcChannels.UPDATE_AVAILABLE)(callback),
  onInstallLocationPrompt: (callback: (data: InstallLocationData) => void) =>
    createEventHandler(IpcChannels.INSTALL_LOCATION_PROMPT)(callback),
  onMenuEvent: (callback: (data: MenuEventData) => void) =>
    createEventHandler(IpcChannels.MENU_EVENT)(callback),
  unregisterMenuEvent: (callback: (data: any) => void) =>
    unregisterEventHandler(IpcChannels.MENU_EVENT, callback),

  // Direct message methods
  windowControls: {
    close: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
    minimize: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
  },
});
