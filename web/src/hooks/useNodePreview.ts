/**
 * Optimized hook for subscribing to node previews with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The preview value for the node
 */
import useResultsStore from "../stores/ResultsStore";

export const useNodePreview = (
  workflowId: string,
  nodeId: string
): unknown => {
  return useResultsStore((state) => state.getPreview(workflowId, nodeId));
};
