/**
 * SnippetStore
 *
 * Manages node snippets - saved groups of connected nodes that can be
 * reused across workflows. Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "./NodeData";

export interface SnippetNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Omit<NodeData, "positionAbsolute"> & {
    positionAbsolute?: { x: number; y: number };
  };
  selected?: boolean;
  parentId?: string | undefined;
  zIndex?: number;
}

export interface SnippetEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  selected?: boolean;
}

export interface Snippet {
  id: string;
  name: string;
  description: string;
  nodes: SnippetNode[];
  edges: SnippetEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface SnippetExport {
  version: number;
  snippets: Snippet[];
}

interface SnippetStore {
  snippets: Snippet[];
  addSnippet: (
    name: string,
    description: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => string;
  updateSnippet: (
    id: string,
    updates: Partial<Pick<Snippet, "name" | "description">>
  ) => void;
  deleteSnippet: (id: string) => void;
  getSnippet: (id: string) => Snippet | undefined;
  getAllSnippets: () => Snippet[];
  importSnippets: (snippets: Snippet[]) => void;
  exportSnippets: () => string;
  clearAllSnippets: () => void;
}

const SNIPPET_STORAGE_KEY = "nodetool-snippets";
const CURRENT_VERSION = 1;

export const useSnippetStore = create<SnippetStore>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (
        name: string,
        description: string,
        nodes: Node<NodeData>[],
        edges: Edge[]
      ): string => {
        const snippetNodes: SnippetNode[] = nodes.map((node) => ({
          id: node.id,
          type: node.type ?? "default",
          position: node.position,
          data: {
            ...node.data,
            positionAbsolute: node.data.positionAbsolute
          },
          selected: node.selected,
          parentId: node.parentId,
          zIndex: node.zIndex
        }));

        const snippetEdges: SnippetEdge[] = edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          selected: edge.selected
        }));

        const snippet: Snippet = {
          id: crypto.randomUUID(),
          name,
          description,
          nodes: snippetNodes,
          edges: snippetEdges,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        set((state) => ({
          snippets: [snippet, ...state.snippets]
        }));

        return snippet.id;
      },

      updateSnippet: (
        id: string,
        updates: Partial<Pick<Snippet, "name" | "description">>
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

      importSnippets: (snippets: Snippet[]) => {
        const validSnippets = snippets.filter(
          (snippet) =>
            typeof snippet.id === "string" &&
            typeof snippet.name === "string" &&
            Array.isArray(snippet.nodes) &&
            Array.isArray(snippet.edges)
        );

        set((state) => ({
          snippets: [...validSnippets, ...state.snippets]
        }));
      },

      exportSnippets: (): string => {
        const exportData: SnippetExport = {
          version: CURRENT_VERSION,
          snippets: get().snippets
        };
        return JSON.stringify(exportData, null, 2);
      },

      clearAllSnippets: () => {
        set({ snippets: [] });
      }
    }),
    {
      name: SNIPPET_STORAGE_KEY,
      version: 1
    }
  )
);

export default useSnippetStore;
