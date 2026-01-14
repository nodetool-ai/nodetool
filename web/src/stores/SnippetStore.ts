import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Snippet, SnippetLibraryState, SnippetNode, SnippetEdge } from "./SnippetTypes";
import { uuidv4 } from "./uuidv4";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

const STORAGE_KEY = "nodetool-snippet-library";

const convertNodeToSnippet = (node: Node<NodeData>): SnippetNode => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
  parentId: node.parentId,
  zIndex: node.zIndex
});

const convertEdgeToSnippet = (edge: Edge): SnippetEdge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle,
  targetHandle: edge.targetHandle,
  selected: edge.selected
});

const convertSnippetToNode = (snippetNode: SnippetNode, idMap: Map<string, string>): Node<NodeData> => ({
  id: idMap.get(snippetNode.id) || uuidv4(),
  type: snippetNode.type,
  position: snippetNode.position,
  data: snippetNode.data,
  parentId: snippetNode.parentId ? idMap.get(snippetNode.parentId) : undefined,
  zIndex: snippetNode.zIndex,
  selected: false
});

const convertSnippetToEdge = (snippetEdge: SnippetEdge, idMap: Map<string, string>): Edge => ({
  id: uuidv4(),
  source: idMap.get(snippetEdge.source) || snippetEdge.source,
  target: idMap.get(snippetEdge.target) || snippetEdge.target,
  sourceHandle: snippetEdge.sourceHandle,
  targetHandle: snippetEdge.targetHandle,
  selected: false
});

const getDefaultSnippets = (): Snippet[] => [];

const useSnippetStore = create<SnippetLibraryState>()(
  persist(
    (set, get) => ({
      snippets: getDefaultSnippets(),
      isOpen: false,
      searchQuery: "",
      selectedSnippetId: null,

      setSnippets: (snippets: Snippet[]) => set({ snippets }),

      addSnippet: (snippet: Snippet) =>
        set((state) => ({
          snippets: [snippet, ...state.snippets]
        })),

      updateSnippet: (id: string, updates: Partial<Snippet>) =>
        set((state) => ({
          snippets: state.snippets.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
          )
        })),

      deleteSnippet: (id: string) =>
        set((state) => ({
          snippets: state.snippets.filter((s) => s.id !== id),
          selectedSnippetId: state.selectedSnippetId === id ? null : state.selectedSnippetId
        })),

      duplicateSnippet: (id: string) => {
        const snippet = get().snippets.find((s) => s.id === id);
        if (!snippet) return null;

        const newSnippet: Snippet = {
          ...snippet,
          id: uuidv4(),
          name: `${snippet.name} (Copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0
        };

        set((state) => ({
          snippets: [newSnippet, ...state.snippets]
        }));

        return newSnippet;
      },

      openLibrary: () => set({ isOpen: true }),

      closeLibrary: () => set({ isOpen: false, selectedSnippetId: null }),

      setSearchQuery: (query: string) => set({ searchQuery: query }),

      selectSnippet: (id: string | null) => set({ selectedSnippetId: id }),

      incrementUsage: (id: string) =>
        set((state) => ({
          snippets: state.snippets.map((s) =>
            s.id === id ? { ...s, usageCount: s.usageCount + 1 } : s
          )
        })),

      importSnippet: (snippet: Snippet) => {
        const existing = get().snippets.find((s) => s.id === snippet.id);
        if (existing) {
          get().updateSnippet(existing.id, snippet);
        } else {
          get().addSnippet(snippet);
        }
      },

      exportSnippets: () => {
        const snippets = get().snippets;
        return JSON.stringify(snippets, null, 2);
      },

      importSnippets: (json: string) => {
        let imported: Snippet[];
        try {
          imported = JSON.parse(json);
        } catch {
          return 0;
        }

        if (!Array.isArray(imported)) return 0;

        let count = 0;
        imported.forEach((snippet) => {
          if (isValidSnippet(snippet)) {
            get().importSnippet({
              ...snippet,
              id: uuidv4(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              usageCount: 0
            });
            count++;
          }
        });

        return count;
      }
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ snippets: state.snippets })
    }
  )
);

function isValidSnippet(obj: unknown): obj is Snippet {
  if (!obj || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    Array.isArray(s.nodes) &&
    Array.isArray(s.edges) &&
    typeof s.createdAt === "string" &&
    typeof s.updatedAt === "string" &&
    typeof s.usageCount === "number"
  );
}

export const createSnippetFromSelection = (
  name: string,
  description: string,
  nodes: Node<NodeData>[],
  edges: Edge[]
): Snippet => {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    name,
    description,
    nodes: nodes.map(convertNodeToSnippet),
    edges: edges.map(convertEdgeToSnippet),
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
};

export const applySnippetToGraph = (
  snippet: Snippet,
  nodes: Node<NodeData>[],
  edges: Edge[],
  generateNodeId: () => string,
  position?: { x: number; y: number }
): { newNodes: Node<NodeData>[]; newEdges: Edge[] } => {
  const idMap = new Map<string, string>();
  const newNodeIds = snippet.nodes.map(() => generateNodeId());
  snippet.nodes.forEach((sn, index) => {
    idMap.set(sn.id, newNodeIds[index]);
  });

  const firstSnippetNode = snippet.nodes[0];
  const offset = position
    ? { x: position.x - firstSnippetNode.position.x, y: position.y - firstSnippetNode.position.y }
    : { x: 50, y: 50 };

  const newNodes = snippet.nodes.map((sn, index) =>
    convertSnippetToNode(sn, idMap)
  );

  newNodes.forEach((node, index) => {
    const snippetNode = snippet.nodes[index];
    if (snippetNode.parentId && idMap.has(snippetNode.parentId)) {
      node.position = {
        x: snippetNode.position.x,
        y: snippetNode.position.y
      };
    } else {
      node.position = {
        x: snippetNode.position.x + offset.x,
        y: snippetNode.position.y + offset.y
      };
    }
    const positionAbsolute = snippetNode.data?.positionAbsolute;
    if (positionAbsolute) {
      node.data.positionAbsolute = {
        x: positionAbsolute.x + offset.x,
        y: positionAbsolute.y + offset.y
      };
    }
  });

  const newEdges = snippet.edges
    .filter((se) => idMap.has(se.source) && idMap.has(se.target))
    .map((se) => convertSnippetToEdge(se, idMap));

  return { newNodes, newEdges };
};

export default useSnippetStore;
