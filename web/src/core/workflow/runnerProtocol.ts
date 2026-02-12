/**
 * Workflow runner protocol adapter.
 *
 * Runner WebSocket messages (JobUpdate, Prediction, NodeProgress/NodeUpdate,
 * Task/Planning updates) are processed via `handleUpdate` in
 * `workflowUpdates.ts`. This helper wires a store-specific handler that
 * delegates everything to the shared reducer so the protocol logic stays
 * centralized and testable outside of Zustand.
 */
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { handleUpdate, MsgpackData } from "../../stores/workflowUpdates";
import { WorkflowRunnerStore } from "../../stores/WorkflowRunner";

/**
 * Returns a message handler that delegates protocol handling to the shared
 * workflowUpdates helper. Kept outside the store so it can be tested
 * without Zustand wiring.
 */
export const createRunnerMessageHandler = (
  store: WorkflowRunnerStore
): (workflow: WorkflowAttributes, data: MsgpackData) => void => {
  return (workflow: WorkflowAttributes, data: MsgpackData) => {
    handleUpdate(workflow, data, store);
  };
};
