import { BrowserWindow, app } from "electron";
import path from "path";
import { Workflow } from "./types.d";

// Map to store workflow windows
const workflowWindows = new Map<number, BrowserWindow>();

/**
 * Creates a new frameless workflow window
 * @param workflow - The workflow to create a window for
 * @returns The created window
 */
function createWorkflowWindow(workflow: Workflow): BrowserWindow {
  const workflowWindow = new BrowserWindow({
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload-workflow.js"),
    },
  });

  workflowWindow.setBackgroundColor("#111111");

  const windowId = workflowWindow.id;
  workflowWindows.set(windowId, workflowWindow);

  workflowWindow.on("closed", () => {
    workflowWindows.delete(windowId);
  });

  workflowWindow.loadFile(
    path.join(__dirname, "..", "apps", "build", "index.html")
  );

  workflowWindow.webContents.on("did-finish-load", () => {
    workflowWindow.webContents.send("workflow", workflow);
  });
  return workflowWindow;
}

/**
 * Checks if a window is a workflow window
 * @param window - The window to check
 * @returns True if the window is a workflow window
 */
function isWorkflowWindow(window: BrowserWindow): boolean {
  return workflowWindows.has(window.id);
}

/**
 * Fetches a workflow from the local API
 * @param workflowId - The workflow ID to fetch
 * @returns The fetched workflow
 * @throws {Error} When the API request fails
 */
async function fetchWorkflow(workflowId: string): Promise<Workflow> {
  try {
    const response = await fetch(
      `http://127.0.0.1:8000/api/workflows/${workflowId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch workflows: ${(error as Error).message}`);
  }
}

/**
 * Runs a workflow by fetching it and creating a new window for it
 * @param workflowId - The workflow ID to run
 */
async function runWorkflow(workflowId: string): Promise<void> {
  const workflow = await fetchWorkflow(workflowId);
  createWorkflowWindow(workflow);
}

export { createWorkflowWindow, isWorkflowWindow, runWorkflow };
