import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { useNodes } from "../contexts/NodeContext";

type DistributeNodesOptions = {
  direction: "horizontal" | "vertical";
};

const useDistributeNodes = () => {
  const DISTANCE = 40;
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
        { position: { x: number; y: number }; data: Partial<NodeData> }
      >();

      selectedNodes.forEach((node) => {
        nodeUpdates.set(node.id, {
          position: { ...node.position },
          data: { ...(node.data || {}) }
        });
      });

      if (direction === "horizontal") {
        const yCoordinates = selectedNodes.map((node) => node.position.y);
        const topMostY = Math.min(...yCoordinates);
        const nodesByY = new Map<number, typeof selectedNodes>();
        yCoordinates.forEach((y, index) => {
          const existing = nodesByY.get(y);
          if (existing) {
            existing.push(selectedNodes[index]);
          } else {
            nodesByY.set(y, [selectedNodes[index]]);
          }
        });

        nodesByY.forEach((nodesAtY) => {
          if (nodesAtY.length < 2) return;

          const sortedNodes = [...nodesAtY].sort(
            (a, b) => a.position.x - b.position.x
          );
          const firstNode = sortedNodes[0];
          const lastNode = sortedNodes[sortedNodes.length - 1];
          const firstBounds = firstNode.measured?.width ?? 100;
          const lastBounds = lastNode.measured?.width ?? 100;

          const totalWidth =
            lastNode.position.x + lastBounds - firstNode.position.x;
          const totalNodeWidth = sortedNodes.reduce(
            (sum, n) => sum + (n.measured?.width ?? 100),
            0
          );
          const totalSpacing = totalWidth - totalNodeWidth;
          const spacing = totalSpacing / (sortedNodes.length - 1);

          let currentX = firstNode.position.x;
          sortedNodes.forEach((node) => {
            const update = nodeUpdates.get(node.id)!;
            update.position.x = currentX;
            update.position.y = topMostY;
            currentX += (node.measured?.width ?? 100) + spacing;
          });
        });
      } else {
        const xCoordinates = selectedNodes.map((node) => node.position.x);
        const leftMostX = Math.min(...xCoordinates);
        const nodesByX = new Map<number, typeof selectedNodes>();
        xCoordinates.forEach((x, index) => {
          const existing = nodesByX.get(x);
          if (existing) {
            existing.push(selectedNodes[index]);
          } else {
            nodesByX.set(x, [selectedNodes[index]]);
          }
        });

        nodesByX.forEach((nodesAtX) => {
          if (nodesAtX.length < 2) return;

          const sortedNodes = [...nodesAtX].sort(
            (a, b) => a.position.y - b.position.y
          );
          const firstNode = sortedNodes[0];
          const lastNode = sortedNodes[sortedNodes.length - 1];
          const firstBounds = firstNode.measured?.height ?? 50;
          const lastBounds = lastNode.measured?.height ?? 50;

          const totalHeight =
            lastNode.position.y + lastBounds - firstNode.position.y;
          const totalNodeHeight = sortedNodes.reduce(
            (sum, n) => sum + (n.measured?.height ?? 50),
            0
          );
          const totalSpacing = totalHeight - totalNodeHeight;
          const spacing = totalSpacing / (sortedNodes.length - 1);

          let currentY = firstNode.position.y;
          sortedNodes.forEach((node) => {
            const update = nodeUpdates.get(node.id)!;
            update.position.y = currentY;
            update.position.x = leftMostX;
            currentY += (node.measured?.height ?? 50) + spacing;
          });
        });
      }

      reactFlow.setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          const updatedProps = nodeUpdates.get(currentNode.id);
          if (updatedProps) {
            return {
              ...currentNode,
              position: { ...updatedProps.position },
              data: { ...currentNode.data, ...updatedProps.data }
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
