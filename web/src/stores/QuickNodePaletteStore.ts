/**
 * QuickNodePaletteStore
 *
 * Manages the state for the Quick Node Palette - a fast, fuzzy-search
 * modal for quickly adding nodes to the canvas.
 *
 * Features:
 * - Open/close state management
 * - Search term tracking
 * - Fuzzy search results using Fuse.js
 * - Keyboard navigation support
 * - Recent and favorite nodes priority
 */

import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import { useFavoriteNodesStore } from "./FavoriteNodesStore";
import { useRecentNodesStore } from "./RecentNodesStore";
import Fuse from "fuse.js";

export interface QuickNodePaletteItem {
  nodeType: string;
  title: string;
  description: string;
  namespace: string;
  isFavorite: boolean;
  isRecent: boolean;
  timestamp?: number;
}

export interface QuickNodePaletteStore {
  isOpen: boolean;
  searchTerm: string;
  selectedIndex: number;
  results: QuickNodePaletteItem[];
  allNodes: QuickNodePaletteItem[];

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setSearchTerm: (term: string) => void;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  getSelectedItem: () => QuickNodePaletteItem | null;
  initializeNodes: (metadata: Record<string, NodeMetadata>) => void;
}

const FUSE_OPTIONS = {
  keys: ["title", "nodeType", "namespace", "description"],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true
};

let fuse: Fuse<QuickNodePaletteItem> | null = null;

export const useQuickNodePaletteStore = create<QuickNodePaletteStore>(
  (set, get) => ({
    isOpen: false,
    searchTerm: "",
    selectedIndex: 0,
    results: [],
    allNodes: [],

    openPalette: () => {
      set({ isOpen: true, searchTerm: "", selectedIndex: 0 });
    },

    closePalette: () => {
      set({ isOpen: false, searchTerm: "", selectedIndex: 0 });
    },

    togglePalette: () => {
      const { isOpen } = get();
      if (isOpen) {
        set({ isOpen: false, searchTerm: "", selectedIndex: 0 });
      } else {
        set({ isOpen: true, searchTerm: "", selectedIndex: 0 });
      }
    },

    setSearchTerm: (term: string) => {
      const { allNodes } = get();

      if (!term.trim()) {
        const recentStore = useRecentNodesStore.getState();
        const favoriteStore = useFavoriteNodesStore.getState();
        const recentNodes = recentStore.getRecentNodes();
        const favorites = favoriteStore.getFavorites();

        const recentSet = new Set(recentNodes.map((n) => n.nodeType));
        const favoriteSet = new Set(favorites.map((f) => f.nodeType));

        const prioritized = [...allNodes].sort((a, b) => {
          const aIsFavorite = favoriteSet.has(a.nodeType);
          const bIsFavorite = favoriteSet.has(b.nodeType);
          const aIsRecent = recentSet.has(a.nodeType);
          const bIsRecent = recentSet.has(b.nodeType);

          if (aIsFavorite && !bIsFavorite) { return -1; }
          if (!aIsFavorite && bIsFavorite) { return 1; }
          if (aIsRecent && !bIsRecent) { return -1; }
          if (!aIsRecent && bIsRecent) { return 1; }

          const aRecent = recentNodes.find((n) => n.nodeType === a.nodeType);
          const bRecent = recentNodes.find((n) => n.nodeType === b.nodeType);
          if (aRecent && bRecent) {
            return (bRecent.timestamp ?? 0) - (aRecent.timestamp ?? 0);
          }

          return a.title.localeCompare(b.title);
        });

        set({
          searchTerm: term,
          results: prioritized.slice(0, 20),
          selectedIndex: 0
        });
        return;
      }

      if (fuse) {
        const searchResults = fuse.search(term);
        const favoriteStore = useFavoriteNodesStore.getState();
        const recentStore = useRecentNodesStore.getState();
        const favoriteSet = new Set(favoriteStore.getFavorites().map((f) => f.nodeType));
        const _recentSet = new Set(recentStore.getRecentNodes().map((n) => n.nodeType));

        const mappedResults = searchResults.map((result) => result.item);
        const prioritizedResults = [...mappedResults].sort((a, b) => {
          const aIsFavorite = favoriteSet.has(a.nodeType);
          const bIsFavorite = favoriteSet.has(b.nodeType);
          if (aIsFavorite && !bIsFavorite) { return -1; }
          if (!aIsFavorite && bIsFavorite) { return 1; }
          return 0;
        });

        set({
          searchTerm: term,
          results: prioritizedResults.slice(0, 20),
          selectedIndex: 0
        });
      }
    },

    setSelectedIndex: (index: number) => {
      const { results } = get();
      const maxIndex = Math.max(0, results.length - 1);
      set({ selectedIndex: Math.min(index, maxIndex) });
    },

    moveSelectionUp: () => {
      const { selectedIndex, results } = get();
      if (results.length === 0) { return; }
      const newIndex = selectedIndex <= 0 ? results.length - 1 : selectedIndex - 1;
      set({ selectedIndex: newIndex });
    },

    moveSelectionDown: () => {
      const { selectedIndex, results } = get();
      if (results.length === 0) { return; }
      const newIndex = selectedIndex >= results.length - 1 ? 0 : selectedIndex + 1;
      set({ selectedIndex: newIndex });
    },

    getSelectedItem: () => {
      const { results, selectedIndex } = get();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        return results[selectedIndex];
      }
      return null;
    },

    initializeNodes: (metadata: Record<string, NodeMetadata>) => {
      const favoriteStore = useFavoriteNodesStore.getState();
      const recentStore = useRecentNodesStore.getState();
      const favoriteSet = new Set(favoriteStore.getFavorites().map((f) => f.nodeType));
      const recentSet = new Set(recentStore.getRecentNodes().map((n) => n.nodeType));

      const nodes: QuickNodePaletteItem[] = Object.values(metadata).map((meta) => ({
        nodeType: meta.node_type,
        title: meta.title || meta.node_type.split(".").pop() || meta.node_type,
        description: meta.description || "",
        namespace: meta.namespace,
        isFavorite: favoriteSet.has(meta.node_type),
        isRecent: recentSet.has(meta.node_type)
      }));

      fuse = new Fuse(nodes, FUSE_OPTIONS);
      set({ allNodes: nodes });
    }
  })
);

export default useQuickNodePaletteStore;
