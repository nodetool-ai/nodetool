import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface SnippetNode {
  id: string;
  type: string | undefined;
  position: { x: number; y: number };
  data: NodeData;
  parentId?: string;
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
  description?: string;
  nodes: SnippetNode[];
  edges: SnippetEdge[];
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface SnippetCreateData {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface SnippetLibraryState {
  snippets: Snippet[];
  isOpen: boolean;
  searchQuery: string;
  selectedSnippetId: string | null;
  setSnippets: (snippets: Snippet[]) => void;
  addSnippet: (snippet: Snippet) => void;
  updateSnippet: (id: string, updates: Partial<Snippet>) => void;
  deleteSnippet: (id: string) => void;
  duplicateSnippet: (id: string) => Snippet | null;
  openLibrary: () => void;
  closeLibrary: () => void;
  setSearchQuery: (query: string) => void;
  selectSnippet: (id: string | null) => void;
  incrementUsage: (id: string) => void;
  importSnippet: (snippet: Snippet) => void;
  exportSnippets: () => string;
  importSnippets: (json: string) => number;
}
