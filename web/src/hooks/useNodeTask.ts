/**
 * Optimized hook for subscribing to node tasks with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The task for the node
 */
import useResultsStore from "../stores/ResultsStore";
import { Task } from "../stores/ApiTypes";

export const useNodeTask = (
  workflowId: string,
  nodeId: string
): Task | undefined => {
  return useResultsStore((state) => state.getTask(workflowId, nodeId));
};
