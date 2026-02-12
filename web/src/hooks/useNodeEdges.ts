/**
 * Optimized hook for subscribing to node edges with proper selector.
 * Prevents unnecessary re-renders when other parts of the NodeStore change.
 *
 * @returns The edges array
 */
import { useNodes } from "../contexts/NodeContext";
import { Edge } from "@xyflow/react";

export const useNodeEdges = (): Edge[] => {
  return useNodes((state) => state.edges);
};
