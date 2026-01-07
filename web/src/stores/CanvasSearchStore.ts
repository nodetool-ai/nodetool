/**
 * CanvasSearchStore
 *
 * This module manages the state and behavior for searching nodes on the canvas.
 * It handles:
 * - Opening/closing the search panel
 * - Search term management
 * - Filtering and highlighting matching nodes
 * - Navigation through search results
 * - Zooming to found nodes
 *
 * The store uses Zustand for state management.
 */

import { create } from "zustand";
import { Node, NodeProps } from "@xyflow/react";

export interface SearchResult {
  node: Node;
  matchType: "title" | "type" | "id" | "properties";
  matchText: string;
}

export type CanvasSearchStore = {
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  selectedResultIndex: number;
  setSelectedResultIndex: (index: number | ((prev: number) => number)) => void;
  highlightedNodeIds: string[];
  setHighlightedNodeIds: (ids: string[]) => void;
  clearSearch: () => void;
  performSearch: (nodes: Node[], term: string) => void;
};

export const createCanvasSearchStore = () =>
  create<CanvasSearchStore>((set, get) => ({
    isSearchOpen: false,
    setIsSearchOpen: (open: boolean) => set({ isSearchOpen: open }),
    searchTerm: "",
    setSearchTerm: (term: string) => {
      set({ searchTerm: term });
      if (term.trim() === "") {
        set({
          searchResults: [],
          selectedResultIndex: -1,
          highlightedNodeIds: []
        });
      }
    },
    searchResults: [],
    setSearchResults: (results: SearchResult[]) =>
      set({ searchResults: results, selectedResultIndex: -1 }),
    selectedResultIndex: -1,
    setSelectedResultIndex: (indexOrFn) =>
      set((state) => ({
        selectedResultIndex:
          typeof indexOrFn === "function"
            ? indexOrFn(state.selectedResultIndex)
            : indexOrFn
      })),
    highlightedNodeIds: [],
    setHighlightedNodeIds: (ids: string[]) => set({ highlightedNodeIds: ids }),
    clearSearch: () =>
      set({
        searchTerm: "",
        searchResults: [],
        selectedResultIndex: -1,
        highlightedNodeIds: [],
        isSearchOpen: false
      }),
    performSearch: (nodes: Node[], term: string) => {
      if (!term.trim()) {
        set({ searchResults: [], selectedResultIndex: -1, highlightedNodeIds: [] });
        return;
      }

      const normalizedTerm = term.toLowerCase();
      const results: SearchResult[] = [];

      for (const node of nodes) {
        const nodeData = node.data as Record<string, unknown>;
        const title = (nodeData?.title as string) || node.type || "";
        const type = node.type || "";
        const id = node.id;

        let matchType: SearchResult["matchType"] | null = null;
        let matchText = "";

        if (title.toLowerCase().includes(normalizedTerm)) {
          matchType = "title";
          matchText = title;
        } else if (type.toLowerCase().includes(normalizedTerm)) {
          matchType = "type";
          matchText = type;
        } else if (id.toLowerCase().includes(normalizedTerm)) {
          matchType = "id";
          matchText = id;
        } else {
          const propertiesStr = JSON.stringify(nodeData).toLowerCase();
          if (propertiesStr.includes(normalizedTerm)) {
            matchType = "properties";
            matchText = term;
          }
        }

        if (matchType) {
          results.push({ node, matchType, matchText });
        }
      }

      const highlightedIds = results.map((r) => r.node.id);
      set({
        searchResults: results,
        selectedResultIndex: results.length > 0 ? 0 : -1,
        highlightedNodeIds: highlightedIds
      });
    }
  }));

export const useCanvasSearchStore = createCanvasSearchStore();

export default useCanvasSearchStore;
