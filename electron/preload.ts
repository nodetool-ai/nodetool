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

import { contextBridge, ipcRenderer, shell } from "electron";

import {
  InstallLocationData,
  IpcChannels,
  IpcEvents,
  IpcRequest,
  IpcResponse,
  ServerState,
  UpdateProgressData,
} from "./src/types.d";
import { UpdateInfo } from "electron-updater";

type IpcHandler<T extends keyof IpcRequest> = (
  data: IpcRequest[T]
) => Promise<IpcResponse[T]>;

type IpcEventHandler<T extends keyof IpcEvents> = (
  callback: (data: IpcEvents[T]) => void
) => void;

interface InstallLocationPrompt {
  defaultPath: string;
  downloadSize: string;
  installedSize: string;
}

/**
 * Type-safe wrapper for IPC invoke calls
 */
function createInvokeHandler<T extends keyof IpcRequest>(
  channel: T
): IpcHandler<T> {
  return (data: IpcRequest[T]) => ipcRenderer.invoke(channel, data);
}

/**
 * Type-safe wrapper for IPC event listeners
 */
function createEventHandler<T extends keyof IpcEvents>(
  channel: T
): IpcEventHandler<T> {
  return (callback: (data: IpcEvents[T]) => void) => {
    ipcRenderer.on(channel as string, (_event, data: IpcEvents[T]) =>
      callback(data)
    );
  };
}

interface UpdateProgress {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

// Consolidate IPC types into a single interface
interface IpcApi {
  // Invoke methods (return promises)
  getServerState(): Promise<ServerState>;
  openLogFile(): Promise<void>;
  selectInstallLocation(): Promise<string>;
  selectCustomInstallLocation(): Promise<string>;
  runApp(): Promise<void>;

  // Event listeners
  onServerStarted(callback: () => void): void;
  onBootMessage(callback: (data: string) => void): void;
  onServerLog(callback: (data: string) => void): void;
  onUpdateProgress(callback: (data: UpdateProgress) => void): void;
  onUpdateAvailable(callback: (data: UpdateInfo) => void): void;
  onInstallLocationPrompt(
    callback: (data: InstallLocationPrompt) => void
  ): void;

  // Window controls
  windowControls: {
    close(): void;
    minimize(): void;
    maximize(): void;
  };
}

contextBridge.exposeInMainWorld("api", {
  getServerState: () => ipcRenderer.invoke(IpcChannels.GET_SERVER_STATE),
  openLogFile: () => ipcRenderer.invoke(IpcChannels.OPEN_LOG_FILE),
  selectDefaultInstallLocation: () =>
    ipcRenderer.invoke(IpcChannels.SELECT_DEFAULT_LOCATION),
  selectCustomInstallLocation: () =>
    ipcRenderer.invoke(IpcChannels.SELECT_CUSTOM_LOCATION),
  runApp: (workflowId: string) =>
    ipcRenderer.invoke(IpcChannels.RUN_APP, workflowId),

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

  windowControls: {
    close: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
    minimize: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
  },
});
