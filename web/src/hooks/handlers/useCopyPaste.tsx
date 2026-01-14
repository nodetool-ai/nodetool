/**
 * Custom hook that provides copy, cut, and paste functionality for nodes and edges in the flow editor.
 * Handles both single node and multi-node operations, preserves connections between copied nodes,
 * and supports both Electron clipboard API and localStorage fallback for data persistence.
 * Also maintains a clipboard history (clipboard ring) for accessing previously copied items.
 */

import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "@xyflow/react";
import { uuidv4 } from "../../stores/uuidv4";
import log from "loglevel";
import { NodeData } from "../../stores/NodeData";
import { useCallback, useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useSessionStateStore from "../../stores/SessionStateStore";
import useClipboardHistoryStore from "../../stores/ClipboardHistoryStore";

const hasValidPosition = (position: any) =>
  !!position &&
  typeof position.x === "number" &&
  typeof position.y === "number";

const isValidNode = (node: any): node is Node<NodeData> =>
  !!node && typeof node.id === "string" && hasValidPosition(node.position);

const isValidEdge = (edge: any): edge is Edge =>
  !!edge && typeof edge.source === "string" && typeof edge.target === "string";

export const useCopyPaste = () => {
  const reactFlow = useReactFlow();
  const generateNodeIds = useNodes((state) => state.generateNodeIds);
  const { setClipboardData, setIsClipboardValid } = useSessionStateStore(
    (state) => ({
      setClipboardData: state.setClipboardData,
      setIsClipboardValid: state.setIsClipboardValid
    })
  );

  const addToClipboardHistory = useClipboardHistoryStore(
    (state) => state.addItem
  );

  const { nodes, edges, setNodes, setEdges, workflowId } = useNodes(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      workflowId: state.workflow.id
    })
  );

  const selectedNodes = useMemo(() => {
    return nodes.filter((node) => node.selected);
  }, [nodes]);

  const handleCopy = useCallback(
    async (nodeId?: string) => {
      let nodesToCopy: Node[];
      if (nodeId && nodeId !== "") {
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

      // Use Electron's clipboard API if available, otherwise fallback to localStorage
      if (window.api?.clipboardWriteText) {
        await window.api.clipboardWriteText(serializedData);
      } else {
        localStorage.setItem("copiedNodesData", serializedData);
      }

      // Let UI know we have valid node data available for paste
      setClipboardData(serializedData);
      setIsClipboardValid(true);

      // Add to clipboard history
      addToClipboardHistory({
        nodes: nodesToCopy as Node<NodeData>[],
        edges: connectedEdges
      });

      return { nodesToCopy, connectedEdges };
    },
    [nodes, edges, selectedNodes, setClipboardData, setIsClipboardValid, addToClipboardHistory]
  );

  const handleCut = useCallback(
    async (nodeId?: string) => {
      const { nodesToCopy, connectedEdges } = await handleCopy(nodeId);

      if (nodesToCopy.length === 0) {
        return;
      }

      // Optimization: Use Set for O(n) filtering instead of O(n*m) with nested some()
      const nodesToCopyIds = new Set(nodesToCopy.map((n) => n.id));
      const connectedEdgeIds = new Set(connectedEdges.map((e) => e.id));

      const filteredNodes = nodes.filter(
        (node) => !nodesToCopyIds.has(node.id)
      );
      setNodes(filteredNodes);

      const filteredEdges = edges.filter(
        (edge) => !connectedEdgeIds.has(edge.id)
      );
      setEdges(filteredEdges);
    },
    [handleCopy, nodes, edges, setNodes, setEdges]
  );

  const handlePaste = useCallback(async () => {
    let clipboardData: string | null = null;

    // Try to get data from Electron's clipboard first, then fallback to localStorage
    if (window.api?.clipboardReadText) {
      try {
        clipboardData = await window.api.clipboardReadText();
      } catch (error) {
        console.warn("Failed to read from Electron clipboard:", error);
      }
    }

    if (!clipboardData) {
      clipboardData = localStorage.getItem("copiedNodesData");
    }

    if (!clipboardData) {
      console.warn("No valid data found in clipboard or localStorage");
      return;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(clipboardData);
    } catch (error) {
      log.warn("Failed to parse clipboard data", error);
      setIsClipboardValid(false);
      return;
    }

    if (
      !parsedData ||
      typeof parsedData !== "object" ||
      !Array.isArray((parsedData as any).nodes) ||
      !Array.isArray((parsedData as any).edges) ||
      !(parsedData as any).nodes.every(isValidNode) ||
      !(parsedData as any).edges.every(isValidEdge)
    ) {
      log.warn("Clipboard data does not contain valid nodes/edges");
      setIsClipboardValid(false);
      return;
    }

    const mousePosition = getMousePosition();
    if (!mousePosition) {
      log.warn("Mouse position not available");
      return;
    }

    // Check if the active element is a text input (should use native paste instead)
    const activeElement = document.activeElement;
    const isTextInput =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      (activeElement as HTMLElement)?.isContentEditable;

    // Skip node paste if user is typing in a text field
    if (isTextInput) {
      return;
    }

    // At this point, no text input is focused, so we can proceed with node paste
    // Previously we checked if cursor was over the flow pane, but that breaks
    // paste from Electron's Edit menu where cursor is on the menu
    const { nodes: copiedNodes, edges: copiedEdges } = parsedData as {
      nodes: Node<NodeData>[];
      edges: Edge[];
    };
    const oldToNewIds = new Map<string, string>();
    const newNodes: Node<NodeData>[] = [];
    const newEdges: Edge[] = [];

    // Generate new sequential IDs for all copied nodes
    const newIds = generateNodeIds(copiedNodes.length);
    copiedNodes.forEach((node: Node<NodeData>, index: number) => {
      oldToNewIds.set(node.id, newIds[index]);
    });

    // calculate offset for pasting
    const firstNodePosition = reactFlow.screenToFlowPosition({
      x: mousePosition.x,
      y: mousePosition.y
    });

    if (!firstNodePosition) {
      log.warn("Failed to calculate paste position");
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

      const positionAbsolute = node.data?.positionAbsolute;

      const newNode: Node<NodeData> = {
        ...node,
        id: newId,
        parentId: newParentId,
        data: {
          ...node.data,
          // Fix: Update workflow_id to current workflow when pasting
          workflow_id: workflowId,
          positionAbsolute: positionAbsolute
            ? {
                x: positionAbsolute.x + offset.x,
                y: positionAbsolute.y + offset.y
              }
            : undefined
        },
        position: {
          x: node.position.x + (newParentId ? 0 : offset.x),
          y: node.position.y + (newParentId ? 0 : offset.y)
        },
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
          id: uuidv4(), // Edge IDs can still be UUIDs
          source: newSource,
          target: newTarget
        });
      }
    });

    // Update state
    setNodes([...nodes, ...newNodes]);
    setEdges([...edges, ...newEdges]);
  }, [
    generateNodeIds,
    reactFlow,
    nodes,
    edges,
    setNodes,
    setEdges,
    setIsClipboardValid,
    workflowId
  ]);

  return { handleCopy, handleCut, handlePaste };
};
