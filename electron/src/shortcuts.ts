import { globalShortcut, dialog } from "electron";
import { logMessage } from "./logger";
import { fetchWorkflows, runWorkflow } from "./api";
import { Workflow } from "./types";

const registerWorkflowShortcut = async (workflow: Workflow) => {
  if (workflow.shortcut) {
    console.log("Setting up shortcut for workflow", workflow);
    globalShortcut.unregister(workflow.shortcut);
    globalShortcut.register(workflow.shortcut, () => {
      runWorkflow(workflow);
    });
  }
};
// Add new function to set up workflow shortcuts
async function setupWorkflowShortcuts(): Promise<void> {
  logMessage("Setting up workflow shortcuts");
  try {
    const workflows = await fetchWorkflows();
    workflows.forEach((workflow: any) => {
      registerWorkflowShortcut(workflow);
    });
  } catch (error) {
    logMessage(`Error setting up workflow shortcuts: ${error}`, "error");
  }
}

export { setupWorkflowShortcuts, registerWorkflowShortcut };
