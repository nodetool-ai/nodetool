import { globalShortcut, dialog } from "electron";
import { logMessage } from "./logger";
import { fetchWorkflows } from "./api";
import { Workflow } from "./types";
import { runWorkflow } from "./workflowExecution";

const registerWorkflowShortcut = async (workflow: Workflow) => {
  const shortcut = workflow.settings?.shortcut;
  if (shortcut) {
    try {
      logMessage(
        `Registering shortcut ${shortcut} for workflow ${workflow.name}`
      );

      // Unregister existing shortcut first
      globalShortcut.unregister(shortcut);

      // Attempt to register the new shortcut
      const success = globalShortcut.register(shortcut, () => {
        logMessage(
          `Executing workflow ${workflow.name} via shortcut ${shortcut}`
        );
        runWorkflow(workflow);
      });

      if (!success) {
        logMessage(
          `Failed to register shortcut ${shortcut} for workflow ${workflow.name}`,
          "error"
        );
      }
    } catch (error) {
      logMessage(
        `Error registering shortcut for workflow ${workflow.name}: ${error}`,
        "error"
      );
    }
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
