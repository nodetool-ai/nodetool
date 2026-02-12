/**
 * Optimized hook for subscribing to node metadata with proper selector.
 * Prevents unnecessary re-renders when other parts of the MetadataStore change.
 *
 * @param nodeType - The node type
 * @returns The metadata for the node type
 */
import useMetadataStore from "../stores/MetadataStore";
import { NodeMetadata } from "../stores/ApiTypes";

export const useNodeMetadata = (
  nodeType: string
): NodeMetadata | undefined => {
  return useMetadataStore((state) => state.getMetadata(nodeType));
};
