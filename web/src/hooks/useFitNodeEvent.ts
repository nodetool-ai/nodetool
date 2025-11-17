import { useEffect } from "react";
import { Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useFitView } from "./useFitView";
import { NodeData } from "../stores/NodeData";

/**
 * Hook to listen for custom "nodetool:fit-node" events and fit the view to the specified node.
 * This allows components outside the ReactFlowProvider to trigger node focusing.
 */
export const useFitNodeEvent = () => {
  const findNode = useNodes((state) => state.findNode);
  const fitView = useFitView();

  useEffect(() => {
    const handleFitNode = (
      event: CustomEvent<{ nodeId: string; node: Node }>
    ) => {
      const { nodeId, node: eventNode } = event.detail;
      console.log("[useFitNodeEvent] received nodetool:fit-node event", {
        nodeId,
        hasNode: !!eventNode
      });

      const node = (eventNode || findNode(nodeId)) as
        | Node<NodeData>
        | undefined;
      if (!node) {
        console.error("[useFitNodeEvent] node not found", { nodeId });
        return;
      }

      // Use fitView with nodeIds to avoid selecting the node
      requestAnimationFrame(() => {
        fitView({ padding: 0.4, nodeIds: [nodeId] });
      });
    };

    window.addEventListener(
      "nodetool:fit-node",
      handleFitNode as EventListener
    );
    return () => {
      window.removeEventListener(
        "nodetool:fit-node",
        handleFitNode as EventListener
      );
    };
  }, [findNode, fitView]);
};
