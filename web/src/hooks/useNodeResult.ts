/**
 * Optimized hook for subscribing to node results with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The result value for the node
 */
import useResultsStore from "../stores/ResultsStore";

export const useNodeResult = (
  workflowId: string,
  nodeId: string
): unknown => {
  return useResultsStore((state) => {
    const r =
      state.getOutputResult(workflowId, nodeId) ||
      state.getResult(workflowId, nodeId);
    return r;
  });
};
