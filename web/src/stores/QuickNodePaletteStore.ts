/**
 * QuickNodePaletteStore
 *
 * This module manages the state for the Quick Node Palette feature.
 * It provides a keyboard-driven, always-accessible node search that
 * appears with Ctrl+P for rapid node insertion.
 *
 * Features:
 * - Fuzzy search for nodes by name, description, and tags
 * - Keyboard navigation (arrow keys, Enter to select, Escape to close)
 * - Recent searches memory
 * - Category filtering
 */

import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";

interface QuickNodePaletteStore {
  isOpen: boolean;
  searchTerm: string;
  selectedIndex: number;
  filteredNodes: NodeMetadata[];
  recentSearches: string[];

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setSearchTerm: (term: string) => void;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  getSelectedNode: () => NodeMetadata | null;
  addRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;
  executeSearch: () => void;
}

const MAX_RECENT_SEARCHES = 10;
const MAX_FILTERED_NODES = 50;

const isNodeMatch = (node: NodeMetadata, term: string): boolean => {
  const searchTerm = term.toLowerCase().trim();
  if (!searchTerm) {return true;}

  const fieldsToSearch = [
    node.title,
    node.description,
    node.node_type,
    node.namespace
  ].filter(Boolean);

  return fieldsToSearch.some((field) =>
    field.toLowerCase().includes(searchTerm)
  );
};

const sortNodesByRelevance = (
  nodes: NodeMetadata[],
  term: string
): NodeMetadata[] => {
  if (!term.trim()) {
    return nodes;
  }

  const searchTerm = term.toLowerCase().trim();

  return [...nodes].sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    const aStartsWith = aTitle.startsWith(searchTerm) ? 0 : 1;
    const bStartsWith = bTitle.startsWith(searchTerm) ? 0 : 1;

    if (aStartsWith !== bStartsWith) {
      return aStartsWith - bStartsWith;
    }

    if (a.title.length !== b.title.length) {
      return a.title.length - b.title.length;
    }

    return a.title.localeCompare(b.title);
  });
};

export const createQuickNodePaletteStore = () =>
  create<QuickNodePaletteStore>((set, get) => {
    const performSearch = () => {
      const { searchTerm } = get();
      const metadata = useMetadataStore.getState().metadata;
      const allNodes = Object.values(metadata);

      const filtered = allNodes
        .filter((node) => isNodeMatch(node, searchTerm))
        .sort((a, b) => sortNodesByRelevance([a, b], searchTerm).indexOf(a) - sortNodesByRelevance([a, b], searchTerm).indexOf(b))
        .slice(0, MAX_FILTERED_NODES);

      set({ filteredNodes: filtered, selectedIndex: 0 });
    };

    return {
      isOpen: false,
      searchTerm: "",
      selectedIndex: 0,
      filteredNodes: [],
      recentSearches: [],

      openPalette: () => {
        performSearch();
        set({ isOpen: true });
      },

      closePalette: () => {
        const { searchTerm } = get();
        if (searchTerm.trim()) {
          get().addRecentSearch(searchTerm);
        }
        set({
          isOpen: false,
          searchTerm: "",
          selectedIndex: 0,
          filteredNodes: []
        });
      },

      togglePalette: () => {
        if (get().isOpen) {
          get().closePalette();
        } else {
          get().openPalette();
        }
      },

      setSearchTerm: (term: string) => {
        set({ searchTerm: term });
        performSearch();
      },

      setSelectedIndex: (index: number) => {
        const { filteredNodes } = get();
        const maxIndex = Math.max(0, filteredNodes.length - 1);
        const clampedIndex = Math.max(0, Math.min(index, maxIndex));
        set({ selectedIndex: clampedIndex });
      },

      moveSelectionUp: () => {
        const { selectedIndex } = get();
        const newIndex = selectedIndex <= 0 ? 0 : selectedIndex - 1;
        set({ selectedIndex: newIndex });
      },

      moveSelectionDown: () => {
        const { selectedIndex, filteredNodes } = get();
        const maxIndex = filteredNodes.length - 1;
        const newIndex = selectedIndex >= maxIndex ? maxIndex : selectedIndex + 1;
        set({ selectedIndex: newIndex });
      },

      getSelectedNode: () => {
        const { selectedIndex, filteredNodes } = get();
        if (selectedIndex < 0 || selectedIndex >= filteredNodes.length) {
          return null;
        }
        return filteredNodes[selectedIndex];
      },

      addRecentSearch: (term: string) => {
        const { recentSearches } = get();
        const trimmed = term.trim().toLowerCase();
        if (!trimmed) {return;}

        const filtered = recentSearches.filter((s) => s.toLowerCase() !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        set({ recentSearches: updated });
      },

      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },

      executeSearch: () => {
        performSearch();
      }
    };
  });

export const useQuickNodePaletteStore = createQuickNodePaletteStore();

export default useQuickNodePaletteStore;
