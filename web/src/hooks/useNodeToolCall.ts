/**
 * Optimized hook for subscribing to node tool calls with proper selector.
 * Prevents unnecessary re-renders when other parts of the ResultsStore change.
 *
 * @param workflowId - The workflow ID
 * @param nodeId - The node ID
 * @returns The tool call for the node
 */
import useResultsStore from "../stores/ResultsStore";
import { ToolCallUpdate } from "../stores/ApiTypes";

export const useNodeToolCall = (
  workflowId: string,
  nodeId: string
): ToolCallUpdate | undefined => {
  return useResultsStore((state) => state.getToolCall(workflowId, nodeId));
};
