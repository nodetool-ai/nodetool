/**
 * SnippetStore
 *
 * Manages workflow snippets - reusable groups of connected nodes that can be
 * saved and inserted into workflows. Persists to localStorage.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge, XYPosition } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface SnippetNode {
  id: string;
  type: string;
  position: XYPosition;
  data: Record<string, unknown>;
  selected?: boolean;
  zIndex?: number;
}

export interface SnippetEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface WorkflowSnippet {
  id: string;
  name: string;
  description: string;
  nodes: SnippetNode[];
  edges: SnippetEdge[];
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

interface SnippetStore {
  snippets: WorkflowSnippet[];
  addSnippet: (
    name: string,
    description: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    tags?: string[]
  ) => string;
  updateSnippet: (
    id: string,
    updates: Partial<Pick<WorkflowSnippet, "name" | "description" | "tags">>
  ) => void;
  deleteSnippet: (id: string) => void;
  getSnippet: (id: string) => WorkflowSnippet | undefined;
  getAllSnippets: () => WorkflowSnippet[];
  duplicateSnippet: (id: string) => string;
  clearSnippets: () => void;
  getSnippetsByTag: (tag: string) => WorkflowSnippet[];
}

const MAX_SNIPPETS = 50;

export const useSnippetStore = create<SnippetStore>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (
        name: string,
        description: string,
        nodes: Node<NodeData>[],
        edges: Edge[],
        tags: string[] = []
      ): string => {
        const snippetId = `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const snippetNodes: SnippetNode[] = nodes.map((node) => ({
          id: node.id,
          type: node.type ?? "unknown",
          position: node.position,
          data: node.data as Record<string, unknown>,
          selected: node.selected,
          zIndex: node.zIndex
        }));

        const snippetEdges: SnippetEdge[] = edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          type: edge.type
        }));

        const newSnippet: WorkflowSnippet = {
          id: snippetId,
          name,
          description,
          nodes: snippetNodes,
          edges: snippetEdges,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags
        };

        set((state) => ({
          snippets: [newSnippet, ...state.snippets].slice(0, MAX_SNIPPETS)
        }));

        return snippetId;
      },

      updateSnippet: (
        id: string,
        updates: Partial<Pick<WorkflowSnippet, "name" | "description" | "tags">>
      ) => {
        set((state) => ({
          snippets: state.snippets.map((snippet) =>
            snippet.id === id
              ? { ...snippet, ...updates, updatedAt: Date.now() }
              : snippet
          )
        }));
      },

      deleteSnippet: (id: string) => {
        set((state) => ({
          snippets: state.snippets.filter((snippet) => snippet.id !== id)
        }));
      },

      getSnippet: (id: string) => {
        return get().snippets.find((snippet) => snippet.id === id);
      },

      getAllSnippets: () => {
        return get().snippets;
      },

      duplicateSnippet: (id: string): string => {
        const snippet = get().snippets.find((s) => s.id === id);
        if (!snippet) {
          throw new Error(`Snippet with id ${id} not found`);
        }

        const newId = `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const duplicatedSnippet: WorkflowSnippet = {
          ...snippet,
          id: newId,
          name: `${snippet.name} (Copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        set((state) => ({
          snippets: [duplicatedSnippet, ...state.snippets].slice(0, MAX_SNIPPETS)
        }));

        return newId;
      },

      clearSnippets: () => {
        set({ snippets: [] });
      },

      getSnippetsByTag: (tag: string) => {
        return get().snippets.filter((snippet) => snippet.tags.includes(tag));
      }
    }),
    {
      name: "nodetool-snippets",
      version: 1
    }
  )
);

export default useSnippetStore;
