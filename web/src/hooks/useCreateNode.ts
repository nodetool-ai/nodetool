import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { shallow } from "zustand/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { useNodePresetsStore } from "../stores/NodePresetsStore";

// This hook encapsulates the logic for creating a new node in the graph.
// It handles translating screen coordinates to ReactFlow coordinates and

export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore(
    (state) => ({
      clickPosition: state.clickPosition,
      closeNodeMenu: state.closeNodeMenu
    }),
    shallow
  );
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);
  const incrementUsage = useNodePresetsStore((state) => state.incrementUsage);

  const createNodeFn = useCallback(
    (metadata: NodeMetadata, presetProperties?: Record<string, unknown> | { presetId: string; properties: Record<string, unknown> }) => {
      if (!reactFlowInstance) {return;}

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      // Check if this is a preset with id
      if (
        presetProperties &&
        typeof presetProperties === "object" &&
        "presetId" in presetProperties &&
        typeof (presetProperties as { presetId: unknown }).presetId === "string"
      ) {
        const presetWithId = presetProperties as { presetId: string; properties: Record<string, unknown> };
        
        const newNode = createNode(metadata, rfPos, presetWithId.properties);
        addNode(newNode);

        // Track this node as recently used
        addRecentNode(metadata.node_type);

        // Increment preset usage count
        incrementUsage(presetWithId.presetId);

        // Close the node menu after creating a node
        closeNodeMenu();
      } else {
        // Standard node creation
        const properties = presetProperties as Record<string, unknown> | undefined;
        const newNode = createNode(metadata, rfPos, properties);
        addNode(newNode);

        // Track this node as recently used
        addRecentNode(metadata.node_type);

        // Close the node menu after creating a node
        closeNodeMenu();
      }
    },
    [reactFlowInstance, centerPosition, clickPosition, createNode, addNode, addRecentNode, incrementUsage, closeNodeMenu]
  );

  return createNodeFn;
};
