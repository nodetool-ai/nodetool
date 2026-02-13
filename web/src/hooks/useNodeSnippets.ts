/**
 * useNodeSnippets
 *
 * Custom hook for working with node snippets.
 * Provides utilities to save node configurations as snippets and restore them.
 *
 * @example
 * // Save selected nodes as a snippet
 * const { saveAsSnippet } = useNodeSnippets();
 * saveAsSnippet("My Snippet", "Description", selectedNodes, edges);
 *
 * @example
 * // Restore a snippet to the workflow
 * const { restoreSnippet } = useNodeSnippets();
 * restoreSnippet(snippetId, position);
 */

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import useNodeSnippetsStore, { NodeSnippet } from "../stores/NodeSnippetsStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";

interface UseNodeSnippetsOptions {
  /**
   * Offset in pixels to apply when restoring snippets.
   * Useful for preventing exact overlap when inserting multiple snippets.
   */
  restoreOffset?: { x: number; y: number };
}

interface UseNodeSnippetsReturn {
  /** Save nodes as a named snippet */
  saveAsSnippet: (
    name: string,
    description: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => string;

  /** Restore a snippet at the specified position */
  restoreSnippet: (
    snippetId: string,
    position: { x: number; y: number }
  ) => void;

  /** Delete a snippet by ID */
  deleteSnippet: (snippetId: string) => void;

  /** Get all snippets */
  getSnippets: () => NodeSnippet[];

  /** Get a snippet by ID */
  getSnippet: (id: string) => NodeSnippet | undefined;

  /** Get snippets that contain a specific node type */
  getSnippetsByNodeType: (
    nodeType: string
  ) => NodeSnippet[];

  /** Update snippet metadata */
  updateSnippet: (
    id: string,
    updates: { name?: string; description?: string }
  ) => void;
}

/**
 * Hook for managing node snippets
 */
export const useNodeSnippets = (
  options: UseNodeSnippetsOptions = {}
): UseNodeSnippetsReturn => {
  const { restoreOffset = { x: 0, y: 0 } } = options;

  const createSnippetFromNodes = useNodeSnippetsStore(
    (state) => state.createSnippetFromNodes
  );
  const deleteSnippetStore = useNodeSnippetsStore(
    (state) => state.deleteSnippet
  );
  const updateSnippetStore = useNodeSnippetsStore(
    (state) => state.updateSnippet
  );
  const getSnippets = useNodeSnippetsStore(
    (state) => state.getSnippets
  );
  const getSnippet = useNodeSnippetsStore(
    (state) => state.getSnippet
  );
  const getSnippetsByNodeType = useNodeSnippetsStore(
    (state) => state.getSnippetsByNodeType
  );

  const { nodes, setNodes, setEdges } = useNodes((state) => ({
    nodes: state.nodes,
    setNodes: state.setNodes,
    setEdges: state.setEdges
  }));

  const nodeStoreRef = useNodeStoreRef();

  const { addNodes: rfAddNodes } = useReactFlow();

  // Import generateUUID properly from NodeStore
  const generateUUID = (): string => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (char: string) {
        const randomValue = (Math.random() * 16) | 0;
        return (randomValue & (char === "x" ? 0x3 : 0xf)).toString(16);
      }
    );
  };

  /**
   * Save selected nodes and their connections as a reusable snippet
   */
  const saveAsSnippet = useCallback(
    (name: string, description: string, nodesToSave: Node<NodeData>[], edgesToSave: Edge[]) => {
      if (nodesToSave.length === 0) {
        throw new Error("Cannot create snippet: no nodes provided");
      }
      return createSnippetFromNodes(name, description, nodesToSave, edgesToSave);
    },
    [createSnippetFromNodes]
  );

  /**
   * Restore a snippet by adding its nodes and edges to the workflow
   */
  const restoreSnippet = useCallback(
    (snippetId: string, position: { x: number; y: number }) => {
      const snippet = getSnippet(snippetId);
      if (!snippet) {
        throw new Error(`Snippet not found: ${snippetId}`);
      }

      // Find the minimum x and y positions in the snippet
      const minX = Math.min(...snippet.nodes.map((n) => n.position?.x ?? 0));
      const minY = Math.min(...snippet.nodes.map((n) => n.position?.y ?? 0));

      // Create ID map for snippet nodes to new workflow nodes
      const idMap = new Map<string, string>();

      // Calculate offset to position snippet at the desired location
      const offsetX = position.x - minX + restoreOffset.x;
      const offsetY = position.y - minY + restoreOffset.y;

      // Create nodes with new IDs and positions
      const newNodes: Node<NodeData>[] = snippet.nodes.map((snippetNode) => {
        const newNodeId = generateUUID();
        idMap.set(snippetNode.id, newNodeId);

        return {
          id: newNodeId,
          type: snippetNode.type,
          position: {
            x: (snippetNode.position?.x ?? 0) + offsetX,
            y: (snippetNode.position?.y ?? 0) + offsetY
          },
          data: {
            ...snippetNode.data,
            workflow_id: "" // Will be set by store
          },
          selected: false
        };
      });

      // Create edges with remapped node IDs
      const newEdges: Edge[] = snippet.edges
        .map((snippetEdge): Edge | null => {
          const sourceId = idMap.get(snippetEdge.source);
          const targetId = idMap.get(snippetEdge.target);

          if (!sourceId || !targetId) {
            console.warn(
              `Skipping edge ${snippetEdge.id}: source or target not found in ID map`
            );
            return null;
          }

          return {
            id: generateUUID(),
            source: sourceId,
            target: targetId,
            sourceHandle: snippetEdge.sourceHandle ?? undefined,
            targetHandle: snippetEdge.targetHandle ?? undefined,
            selected: false
          };
        })
        .filter((edge): edge is Edge => edge !== null);

      // Add nodes and edges using both ReactFlow and store methods
      rfAddNodes(newNodes);
      setNodes([...nodes, ...newNodes]);
      setEdges([...(nodeStoreRef.getState().edges), ...newEdges]);
    },
    [getSnippet, nodes, setNodes, setEdges, rfAddNodes, nodeStoreRef, restoreOffset]
  );

  /**
   * Update snippet metadata (name, description)
   */
  const updateSnippet = useCallback(
    (id: string, updates: { name?: string; description?: string }) => {
      updateSnippetStore(id, updates);
    },
    [updateSnippetStore]
  );

  const deleteSnippet = useCallback(
    (id: string) => {
      deleteSnippetStore(id);
    },
    [deleteSnippetStore]
  );

  return {
    saveAsSnippet,
    restoreSnippet,
    deleteSnippet,
    getSnippets,
    getSnippet,
    getSnippetsByNodeType,
    updateSnippet
  };
};

export default useNodeSnippets;
