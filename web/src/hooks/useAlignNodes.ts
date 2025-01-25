import { useCallback } from "react";
import { useNodeStore } from "../stores/NodeStore";
import { Node, useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

type AlignNodesOptions = {
  arrangeSpacing: boolean;
  collapsed?: boolean;
};

const useAlignNodes = () => {
  const VERTICAL_SPACING = 20;
  const HORIZONTAL_SPACING = 40;
  const setExplicitSave = useNodeStore((state) => state.setExplicitSave);
  const getSelectedNodes = useNodeStore((state) => state.getSelectedNodes);
  const reactFlow = useReactFlow();

  const alignNodes = useCallback(
    ({ arrangeSpacing, collapsed }: AlignNodesOptions) => {
      const selectedNodes = getSelectedNodes();
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
        // Sort nodes by y position
        arrangedNodes.sort((a, b) => a.position.y - b.position.y);
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
        // Sort nodes by x position
        arrangedNodes.sort((a, b) => a.position.x - b.position.x);
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
      if (collapsed !== undefined) {
        arrangedNodes.forEach((node) => {
          node.data.collapsed = collapsed;
        });
      }

      // HACK: Force React Flow to update node internals
      // otherwise the nodes were only updated after deselecting
      arrangedNodes.forEach((node) => {
        reactFlow.setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id ? { ...n, position: node.position } : n
          )
        );
      });

      setExplicitSave(false);
    },
    [getSelectedNodes, setExplicitSave]
  );

  return alignNodes;
};

export default useAlignNodes;
