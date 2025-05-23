import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("windowControls", {
  close: (): void => ipcRenderer.send("CLOSE-APP"),
  minimize: (): void => ipcRenderer.send("MINIMIZE-APP"),
  maximize: (): void => ipcRenderer.send("MAXIMIZE-APP"),
});
