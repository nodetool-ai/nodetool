/**
 * Optimized hook for subscribing to node status with proper selector.
 * Prevents unnecessary re-renders when other parts of the StatusStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The status value for the node
 */
import useStatusStore from "../stores/StatusStore";

export const useNodeStatus = (
  workflowId: string,
  nodeId: string
): string | Record<string, unknown> | null | undefined => {
  return useStatusStore((state) => state.getStatus(workflowId, nodeId));
};
