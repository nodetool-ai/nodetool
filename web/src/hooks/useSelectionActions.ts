import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

interface SelectionActionsReturn {
  alignLeft: () => void;
  alignCenter: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignMiddle: () => void;
  alignBottom: () => void;
  distributeHorizontal: () => void;
  distributeVertical: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  bypassSelected: () => void;
}

const NODE_WIDTH = 280;

export const useSelectionActions = (): SelectionActionsReturn => {
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const deleteNode = useNodes((state) => state.deleteNode);
  const toggleBypassSelected = useNodes((state) => state.toggleBypassSelected);
  const reactFlow = useReactFlow();

  const alignLeft = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const leftMostX = Math.min(...selectedNodes.map((n) => n.position.x));

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, x: leftMostX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignCenter = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const centerX =
      selectedNodes.reduce((sum, n) => sum + n.position.x, 0) /
      selectedNodes.length;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, x: centerX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignRight = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const rightMostX = Math.max(
      ...selectedNodes.map((n) => n.position.x + (n.measured?.width ?? NODE_WIDTH))
    );

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          return {
            ...node,
            position: { ...node.position, x: rightMostX - nodeWidth }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignTop = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const topMostY = Math.min(...selectedNodes.map((n) => n.position.y));

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, y: topMostY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignMiddle = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const middleY =
      selectedNodes.reduce((sum, n) => sum + n.position.y, 0) /
      selectedNodes.length;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, y: middleY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignBottom = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const bottomMostY = Math.max(
      ...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0))
    );

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeHeight = node.measured?.height ?? 0;
          return {
            ...node,
            position: { ...node.position, y: bottomMostY - nodeHeight }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const distributeHorizontal = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 3) {return;}

    const sortedNodes = [...selectedNodes].sort(
      (a, b) => a.position.x - b.position.x
    );

    const leftMostX = sortedNodes[0]!.position.x;
    const rightMostX = sortedNodes[sortedNodes.length - 1]!.position.x;

    const totalWidth = sortedNodes.reduce((sum, node) => {
      return sum + (node.measured?.width ?? NODE_WIDTH);
    }, 0);

    const availableSpace = rightMostX - leftMostX - totalWidth;
    const spacing = availableSpace / (sortedNodes.length - 1);

    let currentX = leftMostX;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          const newX = currentX;
          currentX += nodeWidth + spacing;
          return { ...node, position: { ...node.position, x: newX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const distributeVertical = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 3) {return;}

    const sortedNodes = [...selectedNodes].sort(
      (a, b) => a.position.y - b.position.y
    );

    const topMostY = sortedNodes[0]!.position.y;
    const bottomMostY = sortedNodes[sortedNodes.length - 1]!.position.y;

    const totalHeight = sortedNodes.reduce((sum, node) => {
      return sum + (node.measured?.height ?? 0);
    }, 0);

    const availableSpace = bottomMostY - topMostY - totalHeight;
    const spacing = availableSpace / (sortedNodes.length - 1);

    let currentY = topMostY;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeHeight = node.measured?.height ?? 0;
          const newY = currentY;
          currentY += nodeHeight + spacing;
          return { ...node, position: { ...node.position, y: newY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const deleteSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    selectedNodes.forEach((node) => {
      deleteNode(node.id);
    });
  }, [getSelectedNodes, deleteNode]);

  const duplicateSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {return;}

    const offset = 30;

    reactFlow.setNodes((currentNodes) => {
      const newNodes: typeof currentNodes = [];
      const nodeIdMap: Record<string, string> = {};

      selectedNodes.forEach((node) => {
        const newId = `${node.id}_copy_${Date.now()}`;
        nodeIdMap[node.id] = newId;

        newNodes.push({
          ...node,
          id: newId,
          position: {
            x: node.position.x + offset,
            y: node.position.y + offset
          },
          selected: true,
          data: { ...node.data }
        });
      });

      const newEdges = reactFlow.getEdges().map((edge) => {
        if (nodeIdMap[edge.source] && nodeIdMap[edge.target]) {
          return {
            ...edge,
            id: `${edge.id}_copy`,
            source: nodeIdMap[edge.source],
            target: nodeIdMap[edge.target],
            selected: true
          };
        }
        return { ...edge, selected: false };
      });

      reactFlow.setEdges(newEdges);

      return [...currentNodes, ...newNodes];
    });
  }, [getSelectedNodes, reactFlow]);

  const groupSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {return;}

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));
    const maxX = Math.max(...selectedNodes.map((n) => n.position.x + (n.measured?.width ?? NODE_WIDTH)));
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0)));

    const groupId = `group_${Date.now()}`;
    const padding = 20;

    reactFlow.setNodes((currentNodes) => {
      const groupNode = {
        id: groupId,
        type: "group" as const,
        position: { x: minX - padding, y: minY - padding },
        data: {
          label: "",
          collapsed: false,
          color: undefined
        },
        style: {
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2
        },
        selected: true,
        parentId: undefined,
        extent: undefined,
        expandParent: false
      };

      const updatedNodes = currentNodes.map((node) => {
        if (node.selected) {
          return {
            ...node,
            parentId: groupId,
            extent: "parent" as const,
            selected: false
          };
        }
        return node;
      });

      return [groupNode, ...updatedNodes];
    });
  }, [getSelectedNodes, reactFlow]);

  const bypassSelected = useCallback(() => {
    toggleBypassSelected();
  }, [toggleBypassSelected]);

  return {
    alignLeft,
    alignCenter,
    alignRight,
    alignTop,
    alignMiddle,
    alignBottom,
    distributeHorizontal,
    distributeVertical,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    bypassSelected
  };
};

export default useSelectionActions;
