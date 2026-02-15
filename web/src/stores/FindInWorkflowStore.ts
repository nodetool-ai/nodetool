import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

/**
 * Search filter options for advanced node filtering.
 */
export interface SearchFilters {
  /** Filter by node category (input, output, processing, etc.) */
  category: string;
  /** Whether search should be case-sensitive */
  caseSensitive: boolean;
  /** Whether to search within node properties */
  searchProperties: boolean;
  /** Whether to search by node type */
  searchType: boolean;
}

/**
 * Default search filters.
 */
export const DEFAULT_FILTERS: SearchFilters = {
  category: "all",
  caseSensitive: false,
  searchProperties: false,
  searchType: true
};

export interface FindResult {
  node: Node<NodeData>;
  matchIndex: number;
  /** Highlighted text showing where the match occurred */
  highlightedText?: string;
}

interface FindInWorkflowState {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;
  filters: SearchFilters;

  openFind: () => void;
  closeFind: () => void;
  setSearchTerm: (term: string) => void;
  setResults: (results: FindResult[]) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
}

export const useFindInWorkflowStore = create<FindInWorkflowState>((set, get) => ({
  isOpen: false,
  searchTerm: "",
  results: [],
  selectedIndex: 0,
  filters: DEFAULT_FILTERS,

  openFind: () => set({ isOpen: true, searchTerm: "", results: [], selectedIndex: 0, filters: DEFAULT_FILTERS }),
  closeFind: () => set({ isOpen: false, searchTerm: "", results: [], selectedIndex: 0, filters: DEFAULT_FILTERS }),
  setSearchTerm: (searchTerm: string) => set({ searchTerm }),
  setResults: (results: FindResult[]) =>
    set({ results, selectedIndex: results.length > 0 ? 0 : -1 }),
  setSelectedIndex: (selectedIndex: number) => set({ selectedIndex }),
  navigateNext: () => {
    const { results, selectedIndex } = get();
    if (results.length === 0) {
      return;
    }
    const newIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0;
    set({ selectedIndex: newIndex });
  },
  navigatePrevious: () => {
    const { results, selectedIndex } = get();
    if (results.length === 0) {
      return;
    }
    const newIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1;
    set({ selectedIndex: newIndex });
  },
  clearSearch: () => set({ searchTerm: "", results: [], selectedIndex: 0 }),
  setFilters: (newFilters: Partial<SearchFilters>) =>
    set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS })
}));
