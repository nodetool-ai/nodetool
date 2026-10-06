import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";

import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { Slugify } from "../../utils/TypeHandler";
import { useHandleNodePlacement } from "../useHandleNodePlacement";

export type AddConnectedNodeArgs = {
  nodeType: string;
  sourceId: string;
  sourceHandle: string;
  /** Output type name, used for the edge's colour class. */
  sourceType: string;
  targetHandle: string;
  /** Flow-space anchor. Defaults to the source handle's position. */
  anchor?: XYPosition | null;
};

/**
 * Create a node of `nodeType` next to an output and connect the output to
 * `targetHandle`. Returns the new node's id, or null when the node type has
 * no metadata or there is nowhere to place it.
 */
export const useAddConnectedNode = (): ((
  args: AddConnectedNodeArgs
) => string | null) => {
  const { createNode, addNode, addEdge, generateEdgeId } = useNodes(
    useShallow((state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    }))
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const { handleAnchor, initialPosition, alignNodeToAnchor } =
    useHandleNodePlacement();

  return useCallback(
    ({
      nodeType,
      sourceId,
      sourceHandle,
      sourceType,
      targetHandle,
      anchor
    }: AddConnectedNodeArgs): string | null => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        return null;
      }
      const at = anchor ?? handleAnchor(sourceId, sourceHandle, "source");
      if (!at) {
        return null;
      }
      const node = createNode(metadata, initialPosition(at));
      addNode(node);
      addEdge({
        id: generateEdgeId(),
        source: sourceId,
        target: node.id,
        sourceHandle,
        targetHandle,
        type: "default",
        className: Slugify(sourceType)
      });
      alignNodeToAnchor(node.id, at, targetHandle);
      return node.id;
    },
    [
      addEdge,
      addNode,
      alignNodeToAnchor,
      createNode,
      generateEdgeId,
      getMetadata,
      handleAnchor,
      initialPosition
    ]
  );
};
