/**
 * Custom hook that provides copy, cut, and paste functionality for nodes and edges in the flow editor.
 * Handles both single node and multi-node operations, preserves connections between copied nodes,
 * and supports both Electron clipboard API and localStorage fallback for data persistence.
 * 
 * Also handles pasting of clipboard content like images, HTML, RTF, and text by creating
 * appropriate constant nodes.
 */

import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "@xyflow/react";
import { uuidv4 } from "../../stores/uuidv4";
import log from "loglevel";
import { NodeData } from "../../stores/NodeData";
import { useCallback, useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useClipboardContentPaste } from "./useClipboardContentPaste";
import { isTextInputActive } from "../../utils/browser";

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

  const { nodes, edges, setNodes, setEdges, workflowId } = useNodes(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      workflowId: state.workflow.id
    })
  );

  const { handleContentPaste, readClipboardText } = useClipboardContentPaste();

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

      // Use Electron's clipboard API if available, otherwise fallback to browser clipboard API
      if (window.api?.clipboard?.writeText) {
        await window.api.clipboard.writeText(serializedData);
      } else if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(serializedData);
        } catch (error) {
          // Browser clipboard may fail due to permissions, fall back to localStorage
          log.debug("Browser clipboard write failed, using localStorage:", error);
          localStorage.setItem("copiedNodesData", serializedData);
        }
      } else {
        localStorage.setItem("copiedNodesData", serializedData);
      }
      
      // Also store in localStorage as backup for cross-tab paste
      localStorage.setItem("copiedNodesData", serializedData);

      // Let UI know we have valid node data available for paste
      setClipboardData(serializedData);
      setIsClipboardValid(true);

      return { nodesToCopy, connectedEdges };
    },
    [nodes, edges, selectedNodes, setClipboardData, setIsClipboardValid]
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
    // Skip paste handling if user is typing in a text field (should use native paste instead)
    if (isTextInputActive()) {
      return;
    }

    let clipboardData: string | null = null;

    // Try to get data from Author's clipboard first using robust reader
    clipboardData = await readClipboardText();

    if (!clipboardData) {
      clipboardData = localStorage.getItem("copiedNodesData");
    }

    // If no text clipboard data, try to handle as content (image, html, rtf, text)
    if (!clipboardData) {
      const handled = await handleContentPaste();
      if (handled) {
        return;
      }
      log.debug("No valid data found in clipboard or localStorage");
      return;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(clipboardData);
    } catch {
      // JSON parse failed, try to handle as clipboard content
      log.debug("Clipboard data is not valid JSON, trying content paste");
      const handled = await handleContentPaste();
      if (!handled) {
        setIsClipboardValid(false);
      }
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
      // Not valid node data, try to handle as clipboard content
      log.debug("Clipboard data does not contain valid nodes/edges, trying content paste");
      const handled = await handleContentPaste();
      if (!handled) {
        setIsClipboardValid(false);
      }
      return;
    }

    const mousePosition = getMousePosition();
    if (!mousePosition) {
      log.warn("Mouse position not available");
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
        selected: true // Select pasted nodes
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
          target: newTarget,
          selected: false // Edges should not be selected
        });
      }
    });

    // Deselect existing nodes, then add the new selected nodes
    const deselectedNodes = nodes.map((node) => ({
      ...node,
      selected: false
    }));
    const deselectedEdges = edges.map((edge) => ({
      ...edge,
      selected: false
    }));

    // Update state
    setNodes([...deselectedNodes, ...newNodes]);
    setEdges([...deselectedEdges, ...newEdges]);
  }, [
    generateNodeIds,
    reactFlow,
    nodes,
    edges,
    setNodes,
    setEdges,
    setIsClipboardValid,
    workflowId,
    handleContentPaste,
    readClipboardText
  ]);

  return { handleCopy, handleCut, handlePaste };
};
