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
  MenuEventData,
  PythonPackages,
  UpdateProgressData,
  UpdateInfo,
  Workflow,
} from "./types.d";

/**
 * IpcEventHandler: Handles event pattern
 * - T: The specific event channel
 * - Takes callback function that handles event data
 * - No return value (void)
 */
type IpcEventHandler<T extends keyof IpcEvents> = (
  callback: (data: IpcEvents[T]) => void
) => void;

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
  installToLocation: (location: string, packages: PythonPackages) =>
    ipcRenderer.invoke(IpcChannels.INSTALL_TO_LOCATION, { location, packages }),
  selectCustomInstallLocation: () =>
    ipcRenderer.invoke(IpcChannels.SELECT_CUSTOM_LOCATION),
  continueToApp: () =>
    ipcRenderer.invoke(IpcChannels.START_SERVER),
  startServer: () =>
    ipcRenderer.invoke(IpcChannels.START_SERVER),
  restartServer: () =>
    ipcRenderer.invoke(IpcChannels.RESTART_SERVER),
  runApp: (workflowId: string) =>
    ipcRenderer.invoke(IpcChannels.RUN_APP, workflowId),
  onCreateWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_CREATE_WORKFLOW, workflow),
  onUpdateWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_UPDATE_WORKFLOW, workflow),
  onDeleteWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_DELETE_WORKFLOW, workflow),

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
  onShowPackageManager: (callback: () => void) =>
    createEventHandler(IpcChannels.SHOW_PACKAGE_MANAGER)(callback),
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
  platform: process.platform,
});
// Package manager API
contextBridge.exposeInMainWorld("electronAPI", {
  packages: {
    listAvailable: () => ipcRenderer.invoke(IpcChannels.PACKAGE_LIST_AVAILABLE),
    listInstalled: () => ipcRenderer.invoke(IpcChannels.PACKAGE_LIST_INSTALLED),
    install: (repo_id: string) => 
      ipcRenderer.invoke(IpcChannels.PACKAGE_INSTALL, { repo_id }),
    uninstall: (repo_id: string) => 
      ipcRenderer.invoke(IpcChannels.PACKAGE_UNINSTALL, { repo_id }),
    update: (repo_id: string) => 
      ipcRenderer.invoke(IpcChannels.PACKAGE_UPDATE, repo_id),
  },
  openExternal: (url: string) => {
    ipcRenderer.invoke(IpcChannels.PACKAGE_OPEN_EXTERNAL, url);
  },
});