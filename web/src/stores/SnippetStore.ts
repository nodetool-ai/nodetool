import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface SnippetNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  height?: number;
  selected?: boolean;
}

export interface SnippetEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface Snippet {
  id: string;
  name: string;
  description: string;
  nodes: SnippetNode[];
  edges: SnippetEdge[];
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

interface SnippetStoreState {
  snippets: Snippet[];
  addSnippet: (snippet: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "usageCount">) => Snippet;
  updateSnippet: (id: string, updates: Partial<Omit<Snippet, "id" | "createdAt" | "updatedAt">>) => void;
  deleteSnippet: (id: string) => void;
  incrementUsage: (id: string) => void;
  getSnippet: (id: string) => Snippet | undefined;
  getAllSnippets: () => Snippet[];
}

const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
};

export const convertNodesToSnippetNodes = (nodes: Node<NodeData>[]): SnippetNode[] => {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type || "unknown",
    position: node.position,
    data: node.data as Record<string, unknown>,
    width: node.width,
    height: node.height,
    selected: node.selected
  }));
};

export const convertEdgesToSnippetEdges = (edges: Edge[]): SnippetEdge[] => {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    type: edge.type
  }));
};

export const createSnippetFromSelection = (
  name: string,
  description: string,
  nodes: Node<NodeData>[],
  edges: Edge[]
): Omit<Snippet, "id" | "createdAt" | "updatedAt" | "usageCount"> => {
  return {
    name,
    description,
    nodes: convertNodesToSnippetNodes(nodes),
    edges: convertEdgesToSnippetEdges(edges)
  };
};

export const useSnippetStore = create<SnippetStoreState>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (snippetData): Snippet => {
        const now = new Date().toISOString();
        const snippet: Snippet = {
          ...snippetData,
          id: generateUUID(),
          createdAt: now,
          updatedAt: now,
          usageCount: 0
        };
        set((state) => ({
          snippets: [...state.snippets, snippet]
        }));
        return snippet;
      },

      updateSnippet: (id: string, updates: Partial<Omit<Snippet, "id" | "createdAt" | "updatedAt">>): void => {
        set((state) => ({
          snippets: state.snippets.map((snippet) =>
            snippet.id === id
              ? { ...snippet, ...updates, updatedAt: new Date().toISOString() }
              : snippet
          )
        }));
      },

      deleteSnippet: (id: string): void => {
        set((state) => ({
          snippets: state.snippets.filter((snippet) => snippet.id !== id)
        }));
      },

      incrementUsage: (id: string): void => {
        set((state) => ({
          snippets: state.snippets.map((snippet) =>
            snippet.id === id
              ? { ...snippet, usageCount: snippet.usageCount + 1, updatedAt: new Date().toISOString() }
              : snippet
          )
        }));
      },

      getSnippet: (id: string): Snippet | undefined => {
        return get().snippets.find((snippet) => snippet.id === id);
      },

      getAllSnippets: (): Snippet[] => {
        return get().snippets;
      }
    }),
    {
      name: "nodetool-snippets"
    }
  )
);

export default useSnippetStore;
