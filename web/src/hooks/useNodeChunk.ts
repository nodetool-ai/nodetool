/**
 * Optimized hook for subscribing to node chunks with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The chunk value for the node
 */
import useResultsStore from "../stores/ResultsStore";

export const useNodeChunk = (
  workflowId: string,
  nodeId: string
): string | undefined => {
  return useResultsStore((state) => state.getChunk(workflowId, nodeId));
};
