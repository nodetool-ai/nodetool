const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// specific electron APIs through a safe 'window.api' object
contextBridge.exposeInMainWorld("api", {
  onWorkflow: (callback) => {
    // Add listener and store cleanup function
    const listener = (event, workflow) => callback(workflow);
    ipcRenderer.on("workflow", listener);

    // Return cleanup function to remove listener
    return () => ipcRenderer.removeListener("workflow", listener);
  },

  // Add cleanup channel
  onCleanup: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on("cleanup", listener);
    return () => ipcRenderer.removeListener("cleanup", listener);
  },
});

contextBridge.exposeInMainWorld("windowControls", {
  close: () => ipcRenderer.send("CLOSE-APP"),
  minimize: () => ipcRenderer.send("MINIMIZE-APP"),
  maximize: () => ipcRenderer.send("MAXIMIZE-APP"),
});
