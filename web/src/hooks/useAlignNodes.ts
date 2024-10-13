import { useCallback } from "react";
import { useNodeStore } from "../stores/NodeStore";
import { Node } from "@xyflow/react";
import useSessionStateStore from "../stores/SessionStateStore";
import { NodeData } from "../stores/NodeData";

type AlignNodesOptions = {
  arrangeSpacing: boolean;
  collapsed?: boolean;
};

const useAlignNodes = () => {
  const VERTICAL_SPACING = 20;
  const HORIZONTAL_SPACING = 40;
  const setNodes = useNodeStore((state) => state.setNodes);
  const setExplicitSave = useNodeStore((state) => state.setExplicitSave);
  const selectedNodes = useNodeStore((state) => state.getSelectedNodes());
  const nodes = useNodeStore((state) => state.nodes);

  const alignNodes = useCallback(
    ({ arrangeSpacing, collapsed }: AlignNodesOptions) => {
      if (selectedNodes.length < 2) return;
      setExplicitSave(true);

      const xCoordinates = selectedNodes.map((node) => node.position.x);
      const yCoordinates = selectedNodes.map((node) => node.position.y);

      const xRange = Math.max(...xCoordinates) - Math.min(...xCoordinates);
      const yRange = Math.max(...yCoordinates) - Math.min(...yCoordinates);
      const arrangedNodes: Node<NodeData>[] = [...selectedNodes];

      if (xRange < yRange) {
        // align left
        const leftMostX = Math.min(...xCoordinates);
        arrangedNodes.sort((a, b) => a.position.y - b.position.y); // Sort nodes by y position
        arrangedNodes.forEach((node, index) => {
          node.position.x = leftMostX;
          if (arrangeSpacing && index > 0) {
            const previousNodeHeight =
              arrangedNodes[index - 1].measured?.height ?? 0;
            node.position.y =
              arrangedNodes[index - 1].position.y +
              previousNodeHeight +
              VERTICAL_SPACING;
          }
        });
      } else {
        // align top
        const topMostY = Math.min(...yCoordinates);
        arrangedNodes.sort((a, b) => a.position.x - b.position.x); // Sort nodes by x position
        arrangedNodes.forEach((node, index) => {
          node.position.y = topMostY;
          if (arrangeSpacing && index > 0) {
            const previousNodeWidth =
              arrangedNodes[index - 1].measured?.width ?? 0;
            node.position.x =
              arrangedNodes[index - 1].position.x +
              previousNodeWidth +
              HORIZONTAL_SPACING;
          }
        });
      }
      //set collapsed
      if (collapsed) {
        arrangedNodes.forEach((node) => {
          node.data.collapsed = collapsed;
        });
      }
      setNodes(
        nodes.map(
          (node) =>
            arrangedNodes.find((arrangedNode) => arrangedNode.id === node.id) ||
            node
        ),
        false
      );
      setExplicitSave(false);
    },
    [selectedNodes, setExplicitSave, setNodes, nodes]
  );

  return alignNodes;
};

export default useAlignNodes;
