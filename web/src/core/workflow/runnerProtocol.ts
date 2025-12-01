import { WorkflowAttributes } from "../../stores/ApiTypes";
import { handleUpdate } from "../../stores/workflowUpdates";
import { WorkflowRunnerStore } from "../../stores/WorkflowRunner";

/**
 * Returns a message handler that delegates protocol handling to the shared
 * workflowUpdates helper. Kept outside the store so it can be tested
 * without Zustand wiring.
 */
export const createRunnerMessageHandler = (
  store: WorkflowRunnerStore
): (workflow: WorkflowAttributes, data: any) => void => {
  return (workflow: WorkflowAttributes, data: any) => {
    handleUpdate(workflow, data, store);
  };
};
