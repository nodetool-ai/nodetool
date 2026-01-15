import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface FindResult {
  node: Node<NodeData>;
  matchIndex: number;
}

interface FindInWorkflowState {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;
  highlightedNodeIds: Set<string>;

  openFind: () => void;
  closeFind: () => void;
  setSearchTerm: (term: string) => void;
  setResults: (results: FindResult[]) => void;
  setSelectedIndex: (index: number) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  clearHighlightedNodes: () => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
}

export const useFindInWorkflowStore = create<FindInWorkflowState>((set, get) => ({
  isOpen: false,
  searchTerm: "",
  results: [],
  selectedIndex: 0,
  highlightedNodeIds: new Set<string>(),

  openFind: () =>
    set({
      isOpen: true,
      searchTerm: "",
      results: [],
      selectedIndex: 0,
      highlightedNodeIds: new Set<string>()
    }),
  closeFind: () =>
    set({
      isOpen: false,
      searchTerm: "",
      results: [],
      selectedIndex: 0,
      highlightedNodeIds: new Set<string>()
    }),
  setSearchTerm: (searchTerm: string) => set({ searchTerm }),
  setResults: (results: FindResult[]) =>
    set({
      results,
      selectedIndex: results.length > 0 ? 0 : -1,
      highlightedNodeIds: new Set(results.map((r) => r.node.id))
    }),
  setSelectedIndex: (selectedIndex: number) => set({ selectedIndex }),
  setHighlightedNodeIds: (highlightedNodeIds: Set<string>) => set({ highlightedNodeIds }),
  clearHighlightedNodes: () => set({ highlightedNodeIds: new Set<string>() }),
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
  clearSearch: () =>
    set({
      searchTerm: "",
      results: [],
      selectedIndex: 0,
      highlightedNodeIds: new Set<string>()
    })
}));
