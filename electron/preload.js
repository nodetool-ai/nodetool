const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getServerState: () => ipcRenderer.invoke("get-server-state"),
  onServerStarted: (callback) => ipcRenderer.on("server-started", callback),
  onBootMessage: (callback) =>
    ipcRenderer.on("boot-message", (event, message) => callback(message)),
  onServerLog: (callback) =>
    ipcRenderer.on("server-log", (event, message) => callback(message)),
});
