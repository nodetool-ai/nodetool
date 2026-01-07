import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

type DistributeNodesOptions = {
  direction: "horizontal" | "vertical";
};

const DEFAULT_SPACING = 40;

const useDistributeNodes = () => {
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const reactFlow = useReactFlow();

  const distributeNodes = useCallback(
    ({ direction }: DistributeNodesOptions) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 3) {
        return;
      }

      const nodeUpdates = new Map<
        string,
        { position: { x: number; y: number } }
      >();

      selectedNodes.forEach((node) => {
        nodeUpdates.set(node.id, {
          position: { ...node.position }
        });
      });

      if (direction === "horizontal") {
        const sortedNodes = [...selectedNodes].sort(
          (a, b) => a.position.x - b.position.x
        );

        const leftmostX = sortedNodes[0].position.x;
        const rightmostX = sortedNodes[sortedNodes.length - 1].position.x;

        const totalWidth = sortedNodes.reduce((sum, node) => {
          const width = node.measured?.width ?? node.width ?? 200;
          return sum + width;
        }, 0);

        const availableSpace = rightmostX - leftmostX - totalWidth;
        const spacing = Math.max(
          DEFAULT_SPACING,
          availableSpace / (sortedNodes.length - 1)
        );

        let currentX = leftmostX;
        sortedNodes.forEach((node) => {
          const update = nodeUpdates.get(node.id)!;
          const width = node.measured?.width ?? node.width ?? 200;
          update.position.x = currentX;
          currentX = currentX + width + spacing;
        });
      } else {
        const sortedNodes = [...selectedNodes].sort(
          (a, b) => a.position.y - b.position.y
        );

        const topmostY = sortedNodes[0].position.y;
        const bottommostY = sortedNodes[sortedNodes.length - 1].position.y;

        const totalHeight = sortedNodes.reduce((sum, node) => {
          const height = node.measured?.height ?? node.height ?? 60;
          return sum + height;
        }, 0);

        const availableSpace = bottommostY - topmostY - totalHeight;
        const spacing = Math.max(
          DEFAULT_SPACING,
          availableSpace / (sortedNodes.length - 1)
        );

        let currentY = topmostY;
        sortedNodes.forEach((node) => {
          const update = nodeUpdates.get(node.id)!;
          const height = node.measured?.height ?? node.height ?? 60;
          update.position.y = currentY;
          currentY = currentY + height + spacing;
        });
      }

      reactFlow.setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          const updatedProps = nodeUpdates.get(currentNode.id);
          if (updatedProps) {
            return {
              ...currentNode,
              position: { ...updatedProps.position }
            };
          }
          return currentNode;
        })
      );
    },
    [getSelectedNodes, reactFlow]
  );

  return distributeNodes;
};

export default useDistributeNodes;
