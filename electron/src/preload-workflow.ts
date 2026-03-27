import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "./types.d";

contextBridge.exposeInMainWorld("windowControls", {
  close: (): void => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
  minimize: (): void => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
  maximize: (): void => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
});
