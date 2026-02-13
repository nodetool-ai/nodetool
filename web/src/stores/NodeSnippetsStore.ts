/**
 * NodeSnippetsStore
 *
 * Manages node snippets - reusable node configurations with property values.
 * Unlike favorites (which only bookmark node types), snippets capture the actual
 * node configuration including property values, making them true templates.
 *
 * Features:
 * - Save single or multiple nodes as snippets
 * - Restore snippets to workflow with new IDs
 * - Persistent storage in localStorage
 * - Snippet naming and management
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeSnippetData {
  id: string;
  type: string;
  data: NodeData;
  position?: { x: number; y: number };
}

export interface NodeSnippetEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NodeSnippet {
  id: string;
  name: string;
  description: string;
  nodes: NodeSnippetData[];
  edges: NodeSnippetEdge[];
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
}

interface NodeSnippetsStore {
  snippets: NodeSnippet[];
  addSnippet: (snippet: Omit<NodeSnippet, "id" | "createdAt" | "updatedAt" | "nodeCount">) => string;
  updateSnippet: (id: string, updates: Partial<Omit<NodeSnippet, "id" | "createdAt" | "nodeCount">>) => void;
  deleteSnippet: (id: string) => void;
  getSnippet: (id: string) => NodeSnippet | undefined;
  getSnippets: () => NodeSnippet[];
  getSnippetsByNodeType: (nodeType: string) => NodeSnippet[];
  createSnippetFromNodes: (
    name: string,
    description: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => string;
}

const MAX_SNIPPETS = 50;

/**
 * Creates a snippet ID from timestamp and random string
 */
const generateSnippetId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `snippet_${timestamp}_${random}`;
};

/**
 * Extracts snippet data from ReactFlow nodes and edges
 * Preserves node data including properties but excludes workflow-specific data
 */
const extractSnippetData = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): { nodes: NodeSnippetData[]; edges: NodeSnippetEdge[] } => {
  // Create a map of old node IDs to new snippet IDs
  const idMap = new Map<string, string>();
  nodes.forEach((node) => {
    idMap.set(node.id, `node_${node.id}`);
  });

  // Extract node data, preserving position but excluding workflow_id
  const snippetNodes: NodeSnippetData[] = nodes.map((node) => ({
    id: idMap.get(node.id) || node.id,
    type: node.type || "default",
    data: {
      ...node.data,
      workflow_id: "" // Clear workflow-specific ID
    },
    position: node.position
  }));

  // Extract edges, remapping source and target IDs
  const snippetEdges: NodeSnippetEdge[] = edges
    .filter((edge) => {
      // Only include edges that connect nodes within the selection
      const sourceInSelection = idMap.has(edge.source);
      const targetInSelection = idMap.has(edge.target);
      return sourceInSelection && targetInSelection;
    })
    .map((edge) => ({
      id: `edge_${edge.id}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined
    }));

  return { nodes: snippetNodes, edges: snippetEdges };
};

export const useNodeSnippetsStore = create<NodeSnippetsStore>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (snippet) => {
        const id = generateSnippetId();
        const now = Date.now();
        const newSnippet: NodeSnippet = {
          ...snippet,
          id,
          createdAt: now,
          updatedAt: now,
          nodeCount: snippet.nodes.length
        };

        set((state) => {
          const updated = [...state.snippets, newSnippet];
          // Sort by updated time descending, most recent first
          updated.sort((a, b) => b.updatedAt - a.updatedAt);
          return {
            snippets: updated.slice(0, MAX_SNIPPETS)
          };
        });

        return id;
      },

      updateSnippet: (id, updates) => {
        set((state) => ({
          snippets: state.snippets.map((s) =>
            s.id === id
              ? { ...s, ...updates, updatedAt: Date.now() }
              : s
          ).sort((a, b) => b.updatedAt - a.updatedAt)
        }));
      },

      deleteSnippet: (id) => {
        set((state) => ({
          snippets: state.snippets.filter((s) => s.id !== id)
        }));
      },

      getSnippet: (id) => {
        return get().snippets.find((s) => s.id === id);
      },

      getSnippets: () => {
        return get().snippets;
      },

      getSnippetsByNodeType: (nodeType) => {
        return get().snippets.filter((s) =>
          s.nodes.some((n) => n.type === nodeType)
        );
      },

      createSnippetFromNodes: (name, description, nodes, edges) => {
        const { nodes: snippetNodes, edges: snippetEdges } =
          extractSnippetData(nodes, edges);

        return get().addSnippet({
          name,
          description,
          nodes: snippetNodes,
          edges: snippetEdges
        });
      }
    }),
    {
      name: "nodetool-node-snippets",
      version: 1
    }
  )
);

export default useNodeSnippetsStore;
