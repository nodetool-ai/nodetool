import { useEffect } from "react";
import { Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useFitView } from "./useFitView";
import { NodeData } from "../stores/NodeData";

/**
 * Custom hook for handling custom "nodetool:fit-node" events.
 * 
 * This hook allows components outside the ReactFlowProvider to trigger
 * viewport fitting to specific nodes. It listens for custom window events
 * and animates the viewport to center on the specified node with padding.
 * 
 * The hook is useful for scenarios where external components (e.g., chat,
 * sidebar panels) need to programmatically focus nodes in the workflow editor.
 * 
 * @example
 * ```typescript
 * // In any component:
 * const fitToNode = (nodeId: string) => {
 *   window.dispatchEvent(new CustomEvent('nodetool:fit-node', {
 *     detail: { nodeId: 'node-123' }
 *   }));
 * };
 * 
 * // Or with the full node object:
 * window.dispatchEvent(new CustomEvent('nodetool:fit-node', {
 *   detail: { nodeId: 'node-123', node: nodeObject }
 * }));
 * ```
 */
export const useFitNodeEvent = () => {
  const findNode = useNodes((state) => state.findNode);
  const fitView = useFitView();

  useEffect(() => {
    const handleFitNode = (
      event: CustomEvent<{ nodeId: string; node: Node }>
    ) => {
      const { nodeId, node: eventNode } = event.detail;

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
