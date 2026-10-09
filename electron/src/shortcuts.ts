import { globalShortcut } from "electron";
import { logMessage } from "./logger";
import { fetchWorkflows } from "./api";
import { workflowShortcut } from "./workflowSettings";
import { Workflow } from "./types";
import { runWorkflow } from "./workflowExecution";

// Accelerator registered for each workflow id. A changed or cleared shortcut,
// a deleted workflow and a vault switch must release the old accelerator, or
// it keeps running a workflow that no longer has it (or no longer exists).
const registeredShortcuts = new Map<string, string>();

const unregisterWorkflowShortcut = (workflowId: string): void => {
  const previous = registeredShortcuts.get(workflowId);
  if (previous === undefined) {
    return;
  }
  registeredShortcuts.delete(workflowId);
  globalShortcut.unregister(previous);
  logMessage(`Unregistered shortcut "${previous}" for workflow ${workflowId}`);
};

const unregisterAllWorkflowShortcuts = (): void => {
  for (const workflowId of [...registeredShortcuts.keys()]) {
    unregisterWorkflowShortcut(workflowId);
  }
};

const registerWorkflowShortcut = async (workflow: Workflow): Promise<boolean> => {
  const shortcut = workflowShortcut(workflow);
  if (registeredShortcuts.get(workflow.id) !== shortcut) {
    unregisterWorkflowShortcut(workflow.id);
  }
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

    const wasRegistered = globalShortcut.isRegistered(shortcut);
    if (wasRegistered) {
      logMessage(`Unregistering existing shortcut "${shortcut}" before re-registering`);
      globalShortcut.unregister(shortcut);
      for (const [workflowId, accelerator] of registeredShortcuts) {
        if (accelerator === shortcut) {
          registeredShortcuts.delete(workflowId);
        }
      }
    }

    const success = globalShortcut.register(shortcut, () => {
      logMessage(
        `Shortcut "${shortcut}" triggered - executing workflow "${workflow.name}" (${workflow.id})`
      );
      runWorkflow(workflow).catch((error: unknown) => {
        logMessage(
          `Shortcut run of workflow "${workflow.name}" failed: ${String(error)}`,
          "error"
        );
      });
    });

    if (success) {
      registeredShortcuts.set(workflow.id, shortcut);
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

async function setupWorkflowShortcuts(): Promise<void> {
  logMessage("Setting up workflow shortcuts...");
  unregisterAllWorkflowShortcuts();
  try {
    const workflows = await fetchWorkflows();
    logMessage(`Found ${workflows.length} workflows to check for shortcuts`);

    let registeredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const workflow of workflows) {
      if (workflowShortcut(workflow)) {
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

export {
  setupWorkflowShortcuts,
  registerWorkflowShortcut,
  unregisterWorkflowShortcut,
};
