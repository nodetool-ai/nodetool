import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface FindResult {
  node: Node<NodeData>;
  matchIndex: number;
}

const MAX_RECENT_SEARCHES = 10;

interface FindInWorkflowState {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;
  recentSearches: string[];
  showRecentSearches: boolean;

  openFind: () => void;
  closeFind: () => void;
  setSearchTerm: (term: string) => void;
  setResults: (results: FindResult[]) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
  addRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;
  setShowRecentSearches: (show: boolean) => void;
}

export const useFindInWorkflowStore = create<FindInWorkflowState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      searchTerm: "",
      results: [],
      selectedIndex: 0,
      recentSearches: [],
      showRecentSearches: false,

      openFind: () =>
        set({
          isOpen: true,
          searchTerm: "",
          results: [],
          selectedIndex: 0,
          showRecentSearches: get().recentSearches.length > 0
        }),
      closeFind: () =>
        set({
          isOpen: false,
          searchTerm: "",
          results: [],
          selectedIndex: 0,
          showRecentSearches: false
        }),
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
      clearSearch: () =>
        set({
          searchTerm: "",
          results: [],
          selectedIndex: 0,
          showRecentSearches: get().recentSearches.length > 0
        }),
      addRecentSearch: (term: string) => {
        if (!term.trim()) {
          return;
        }
        const currentSearches = get().recentSearches;
        const filteredSearches = currentSearches.filter((s) => s !== term);
        const newSearches = [term, ...filteredSearches].slice(0, MAX_RECENT_SEARCHES);
        set({ recentSearches: newSearches });
      },
      clearRecentSearches: () => set({ recentSearches: [] }),
      setShowRecentSearches: (show: boolean) => set({ showRecentSearches: show })
    }),
    {
      name: "find-in-workflow-storage",
      partialize: (state) => ({
        recentSearches: state.recentSearches
      })
    }
  )
);
