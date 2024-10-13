import { useNodeStore } from "../../stores/NodeStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "@xyflow/react";
import { uuidv4 } from "../../stores/uuidv4";
import { devWarn } from "../../utils/DevLog";
import { NodeData } from "../../stores/NodeData";
import { useCallback } from "react";

export const useCopyPaste = () => {
  const reactFlow = useReactFlow();

  const handleCopy = useCallback(async (nodeId?: string) => {
    const nodes = useNodeStore.getState().nodes;
    const edges = useNodeStore.getState().edges;
    const selectedNodes = useNodeStore.getState().getSelectedNodes();
    const focusedElement = document.activeElement as HTMLElement;
    if (
      (focusedElement.classList.contains("MuiInput-input") &&
        !focusedElement.classList.contains("action")) ||
      focusedElement.tagName === "TEXTAREA"
    ) {
      return { nodesToCopy: [], connectedEdges: [] };
    }

    let nodesToCopy: Node[];
    if (nodeId && nodeId !== "") {
      // Find the node with the given nodeId
      const node = nodes.find((node: any) => node.id === nodeId);
      nodesToCopy = node ? [node] : [];
    } else {
      nodesToCopy = selectedNodes;
    }
    if (nodesToCopy.length === 0) {
      return { nodesToCopy: [], connectedEdges: [] };
    }
    const nodesToCopyIds = nodesToCopy.map((node) => node.id);
    const connectedEdges = edges.filter(
      (edge) =>
        nodesToCopyIds.includes(edge.source) ||
        nodesToCopyIds.includes(edge.target)
    );
    const serializedData = JSON.stringify({
      nodes: nodesToCopy,
      edges: connectedEdges
    });

    localStorage.setItem("copiedNodesData", serializedData);

    return { nodesToCopy, connectedEdges };
  }, []);

  const handleCut = useCallback(
    async (nodeId?: string) => {
      const nodes = useNodeStore.getState().nodes;
      const edges = useNodeStore.getState().edges;
      const setNodes = useNodeStore.getState().setNodes;
      const setEdges = useNodeStore.getState().setEdges;
      const { nodesToCopy, connectedEdges } = await handleCopy(nodeId);

      if (nodesToCopy.length === 0) {
        return;
      }

      const filteredNodes = nodes.filter(
        (node) => !nodesToCopy.some((n) => n.id === node.id)
      );
      setNodes(filteredNodes);

      const filteredEdges = edges.filter(
        (edge) => !connectedEdges.some((e) => e.id === edge.id)
      );
      setEdges(filteredEdges);
    },
    [handleCopy]
  );

  const handlePaste = useCallback(async () => {
    let clipboardData: string | null = null;
    const nodes = useNodeStore.getState().nodes;
    const edges = useNodeStore.getState().edges;
    const setNodes = useNodeStore.getState().setNodes;
    const setEdges = useNodeStore.getState().setEdges;

    clipboardData = localStorage.getItem("copiedNodesData");

    if (!clipboardData) {
      console.warn("No valid data found in clipboard or localStorage");
      return;
    }

    const parsedData = JSON.parse(clipboardData);

    const mousePosition = getMousePosition();
    if (!mousePosition) {
      devWarn("Mouse position not available");
      return;
    }

    const elementUnderCursor = document.elementFromPoint(
      mousePosition.x,
      mousePosition.y
    );

    if (
      elementUnderCursor?.classList.contains("react-flow__pane") ||
      elementUnderCursor?.classList.contains("loop-node") ||
      (elementUnderCursor?.classList.contains("action") &&
        !document.activeElement?.classList.contains("MuiInputBase-input"))
    ) {
      const { nodes: copiedNodes, edges: copiedEdges } = parsedData;
      const oldToNewIds = new Map<string, string>();
      const newNodes: Node<NodeData>[] = [];
      const newEdges: Edge[] = [];

      // create new IDs for all nodes
      copiedNodes.forEach((node: Node<NodeData>) => {
        oldToNewIds.set(node.id, uuidv4());
      });

      // calculate offset for pasting
      const firstNodePosition = reactFlow.screenToFlowPosition({
        x: mousePosition.x,
        y: mousePosition.y
      });

      if (!firstNodePosition) {
        devWarn("Failed to calculate paste position");
        return;
      }

      const offset = {
        x: firstNodePosition.x - copiedNodes[0].position.x,
        y: firstNodePosition.y - copiedNodes[0].position.y
      };

      // create new nodes with updated IDs and parent references
      for (const node of copiedNodes) {
        const newId = oldToNewIds.get(node.id)!;
        let newParentId: string | undefined;

        // check if parent exists in copied nodes
        if (node.parentId && oldToNewIds.has(node.parentId)) {
          newParentId = oldToNewIds.get(node.parentId);
        } else {
          newParentId = undefined;
        }

        const newNode: Node<NodeData> = {
          ...node,
          id: newId,
          parentId: newParentId,
          position: {
            x: node.position.x + (newParentId ? 0 : offset.x),
            y: node.position.y + (newParentId ? 0 : offset.y)
          },
          positionAbsolute: node.positionAbsolute
            ? {
                x: node.positionAbsolute.x + offset.x,
                y: node.positionAbsolute.y + offset.y
              }
            : undefined,
          selected: false
        };

        newNodes.push(newNode);
      }

      // Update edges
      copiedEdges.forEach((edge: Edge) => {
        const newSource = oldToNewIds.get(edge.source);
        const newTarget = oldToNewIds.get(edge.target);

        if (newSource && newTarget) {
          newEdges.push({
            ...edge,
            id: uuidv4(),
            source: newSource,
            target: newTarget
          });
        }
      });

      // Update state
      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);
    }
  }, [reactFlow]);

  return { handleCopy, handlePaste, handleCut };
};
