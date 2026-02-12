/**
 * Optimized hook for subscribing to node progress with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The progress value for the node
 */
import useResultsStore from "../stores/ResultsStore";

export const useNodeProgress = (
  workflowId: string,
  nodeId: string
): { progress: number; total: number; chunk?: string } | undefined => {
  return useResultsStore((state) => state.getProgress(workflowId, nodeId));
};
