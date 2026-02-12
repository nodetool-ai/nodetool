/**
 * Optimized hook for subscribing to node planning updates with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The planning update for the node
 */
import useResultsStore from "../stores/ResultsStore";
import { PlanningUpdate } from "../stores/ApiTypes";

export const useNodePlanningUpdate = (
  workflowId: string,
  nodeId: string
): PlanningUpdate | undefined => {
  return useResultsStore((state) => state.getPlanningUpdate(workflowId, nodeId));
};
