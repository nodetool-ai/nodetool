import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface FindResult {
  node: Node<NodeData>;
  matchIndex: number;
}

/**
 * Filter options for advanced workflow search
 */
export interface SearchFilters {
  /** Filter by node type category (e.g., "image", "text", "audio") */
  typeCategory?: string;
  /** Filter by connection state */
  connectionState?: "connected" | "disconnected" | "any";
  /** Filter by execution state */
  executionState?: "success" | "error" | "running" | "pending" | "any";
  /** Filter by bypass state */
  bypassState?: "bypassed" | "active" | "any";
}

interface FindInWorkflowState {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;
  filters: SearchFilters;
  showFilters: boolean;

  openFind: () => void;
  closeFind: () => void;
  setSearchTerm: (term: string) => void;
  setResults: (results: FindResult[]) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
  setFilters: (filters: SearchFilters) => void;
  toggleFilters: () => void;
  updateFilter: <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => void;
}

export const useFindInWorkflowStore = create<FindInWorkflowState>((set, get) => ({
  isOpen: false,
  searchTerm: "",
  results: [],
  selectedIndex: 0,
  filters: {},
  showFilters: false,

  openFind: () => set({ isOpen: true, searchTerm: "", results: [], selectedIndex: 0 }),
  closeFind: () => set({ isOpen: false, searchTerm: "", results: [], selectedIndex: 0 }),
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

  setFilters: (filters: SearchFilters) => set({ filters }),

  toggleFilters: () => set((state) => ({ showFilters: !state.showFilters })),

  updateFilter: <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value
      }
    }));
  }
}));
