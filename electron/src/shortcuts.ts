import { globalShortcut, dialog } from "electron";
import { logMessage } from "./logger";
import { fetchWorkflows } from "./api";
import { Workflow } from "./types";
import { runWorkflow } from "./workflowExecution";

const registerWorkflowShortcut = async (workflow: Workflow): Promise<boolean> => {
  const shortcut = workflow.settings?.shortcut;
  if (!shortcut) {
    logMessage(
      `Workflow "${workflow.name}" (${workflow.id}) has no shortcut configured`,
      "info"
    );
    return false;
  }

  try {
    logMessage(
      `Registering shortcut "${shortcut}" for workflow "${workflow.name}" (${workflow.id})`
    );

    // Unregister existing shortcut first
    const wasRegistered = globalShortcut.isRegistered(shortcut);
    if (wasRegistered) {
      logMessage(`Unregistering existing shortcut "${shortcut}" before re-registering`);
      globalShortcut.unregister(shortcut);
    }

    // Attempt to register the new shortcut
    const success = globalShortcut.register(shortcut, () => {
      logMessage(
        `Shortcut "${shortcut}" triggered - executing workflow "${workflow.name}" (${workflow.id})`
      );
      runWorkflow(workflow);
    });

    if (success) {
      logMessage(
        `Successfully registered shortcut "${shortcut}" for workflow "${workflow.name}"`,
        "info"
      );
      return true;
    } else {
      logMessage(
        `Failed to register shortcut "${shortcut}" for workflow "${workflow.name}" - shortcut may be in use by another application`,
        "error"
      );
      return false;
    }
  } catch (error) {
    logMessage(
      `Error registering shortcut "${shortcut}" for workflow "${workflow.name}": ${error}`,
      "error"
    );
    return false;
  }
};

// Add new function to set up workflow shortcuts
async function setupWorkflowShortcuts(): Promise<void> {
  logMessage("Setting up workflow shortcuts...");
  try {
    const workflows = await fetchWorkflows();
    logMessage(`Found ${workflows.length} workflows to check for shortcuts`);

    let registeredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const workflow of workflows) {
      const shortcut = workflow.settings?.shortcut;
      if (shortcut) {
        const success = await registerWorkflowShortcut(workflow);
        if (success) {
          registeredCount++;
        } else {
          failedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    logMessage(
      `Shortcut setup complete: ${registeredCount} registered, ${skippedCount} workflows without shortcuts, ${failedCount} failed`,
      "info"
    );
  } catch (error) {
    logMessage(`Error setting up workflow shortcuts: ${error}`, "error");
  }
}

export { setupWorkflowShortcuts, registerWorkflowShortcut };
