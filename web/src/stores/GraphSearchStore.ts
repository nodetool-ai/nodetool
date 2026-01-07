import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface SearchResult {
  nodeId: string;
  node: Node<NodeData>;
  matchType: "name" | "type" | "property" | "label";
  matchField: string;
  matchValue: string;
  highlightedText: string;
}

export interface SearchFilters {
  nodeTypes: string[];
  connectedStatus: "all" | "connected" | "disconnected";
  hasErrors: boolean;
  searchInProperties: boolean;
  searchInNames: boolean;
  searchInTypes: boolean;
}

interface GraphSearchState {
  isOpen: boolean;
  searchQuery: string;
  results: SearchResult[];
  selectedResultIndex: number;
  filters: SearchFilters;
  isSearching: boolean;

  setIsOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setSelectedResultIndex: (index: number) => void;
  nextResult: () => void;
  previousResult: () => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  setIsSearching: (isSearching: boolean) => void;
  clearSearch: () => void;
}

const defaultFilters: SearchFilters = {
  nodeTypes: [],
  connectedStatus: "all",
  hasErrors: false,
  searchInProperties: true,
  searchInNames: true,
  searchInTypes: true
};

export const useGraphSearchStore = create<GraphSearchState>((set, get) => ({
  isOpen: false,
  searchQuery: "",
  results: [],
  selectedResultIndex: 0,
  filters: defaultFilters,
  isSearching: false,

  setIsOpen: (isOpen: boolean) => set({ isOpen }),

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),

  setResults: (results: SearchResult[]) =>
    set({ results, selectedResultIndex: 0 }),

  setSelectedResultIndex: (selectedResultIndex: number) =>
    set({ selectedResultIndex }),

  nextResult: () => {
    const { results, selectedResultIndex } = get();
    if (results.length > 0) {
      const newIndex = (selectedResultIndex + 1) % results.length;
      set({ selectedResultIndex: newIndex });
    }
  },

  previousResult: () => {
    const { results, selectedResultIndex } = get();
    if (results.length > 0) {
      const newIndex =
        selectedResultIndex > 0
          ? selectedResultIndex - 1
          : results.length - 1;
      set({ selectedResultIndex: newIndex });
    }
  },

  setFilters: (filters: Partial<SearchFilters>) =>
    set((state) => ({
      filters: { ...state.filters, ...filters }
    })),

  resetFilters: () => set({ filters: defaultFilters }),

  setIsSearching: (isSearching: boolean) => set({ isSearching }),

  clearSearch: () =>
    set({
      searchQuery: "",
      results: [],
      selectedResultIndex: 0,
      isSearching: false
    })
}));
