import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uuidv4 } from './uuidv4';

export interface NodeSnippet {
  id: string;
  name: string;
  description?: string;
  nodeType: string;
  nodeLabel: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

interface SnippetsState {
  snippets: NodeSnippet[];
  addSnippet: (snippet: Omit<NodeSnippet, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => string;
  updateSnippet: (id: string, updates: Partial<Omit<NodeSnippet, 'id' | 'createdAt'>>) => void;
  deleteSnippet: (id: string) => void;
  incrementUsage: (id: string) => void;
  clearSnippets: () => void;
  getSnippets: () => NodeSnippet[];
  getSnippet: (id: string) => NodeSnippet | undefined;
}

const MAX_SNIPPETS = 50;

export const useSnippetsStore = create<SnippetsState>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (snippetData) => {
        const id = uuidv4();
        const now = Date.now();
        const newSnippet: NodeSnippet = {
          ...snippetData,
          id,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        };

        set((state) => ({
          snippets: [newSnippet, ...state.snippets].slice(0, MAX_SNIPPETS),
        }));

        return id;
      },

      updateSnippet: (id, updates) => {
        set((state) => ({
          snippets: state.snippets.map((snippet) =>
            snippet.id === id
              ? { ...snippet, ...updates, updatedAt: Date.now() }
              : snippet
          ),
        }));
      },

      deleteSnippet: (id) => {
        set((state) => ({
          snippets: state.snippets.filter((snippet) => snippet.id !== id),
        }));
      },

      incrementUsage: (id) => {
        set((state) => ({
          snippets: state.snippets.map((snippet) =>
            snippet.id === id
              ? { ...snippet, usageCount: snippet.usageCount + 1 }
              : snippet
          ),
        }));
      },

      clearSnippets: () => {
        set({ snippets: [] });
      },

      getSnippets: () => {
        return get().snippets;
      },

      getSnippet: (id) => {
        return get().snippets.find((snippet) => snippet.id === id);
      },
    }),
    {
      name: 'nodetool-node-snippets',
      version: 1,
    }
  )
);
