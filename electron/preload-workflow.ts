const { contextBridge, ipcRenderer } = require("electron");

// Define types for the workflow callback
type WorkflowCallback = (workflow: unknown) => void;
type CleanupFunction = () => void;

// Expose protected methods that allow the renderer process to use
// specific electron APIs through a safe 'window.api' object
contextBridge.exposeInMainWorld("api", {
  onWorkflow: (callback: WorkflowCallback): CleanupFunction => {
    // Add listener and store cleanup function
    const listener = (_event: Electron.IpcRendererEvent, workflow: unknown) =>
      callback(workflow);
    ipcRenderer.on("workflow", listener);

    // Return cleanup function to remove listener
    return () => ipcRenderer.removeListener("workflow", listener);
  },
});

contextBridge.exposeInMainWorld("windowControls", {
  close: (): void => ipcRenderer.send("CLOSE-APP"),
  minimize: (): void => ipcRenderer.send("MINIMIZE-APP"),
  maximize: (): void => ipcRenderer.send("MAXIMIZE-APP"),
});
