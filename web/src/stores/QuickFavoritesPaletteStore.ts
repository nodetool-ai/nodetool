/**
 * QuickFavoritesPaletteStore
 *
 * Manages the state for the Quick Favorites Palette - a keyboard-driven
 * modal for quickly inserting favorite nodes onto the canvas.
 */

import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import { useFavoriteNodesStore } from "./FavoriteNodesStore";
import useMetadataStore from "./MetadataStore";

interface QuickFavoritesPaletteStore {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  filteredFavorites: Array<{ nodeType: string; timestamp: number }>;
  setFilteredFavorites: (favorites: Array<{ nodeType: string; timestamp: number }>) => void;
  getSelectedNode: () => NodeMetadata | null;
}

export const useQuickFavoritesPaletteStore = create<QuickFavoritesPaletteStore>(
  (set, get) => {
    const getFilteredFavorites = (term: string): Array<{ nodeType: string; timestamp: number }> => {
      const allFavorites = useFavoriteNodesStore.getState().favorites;
      if (!term.trim()) {
        return allFavorites;
      }
      const getMetadata = useMetadataStore.getState().getMetadata;
      const lowerTerm = term.toLowerCase();
      return allFavorites.filter((fav) => {
        const metadata = getMetadata(fav.nodeType);
        const name = metadata?.title?.toLowerCase() || "";
        const desc = fav.nodeType.toLowerCase();
        return name.includes(lowerTerm) || desc.includes(lowerTerm);
      });
    };

    return {
      isOpen: false,
      searchTerm: "",
      selectedIndex: 0,
      filteredFavorites: [],

      openPalette: () => {
        const favorites = getFilteredFavorites("");
        set({
          isOpen: true,
          searchTerm: "",
          selectedIndex: 0,
          filteredFavorites: favorites
        });
      },

      closePalette: () => {
        set({
          isOpen: false,
          searchTerm: "",
          selectedIndex: 0,
          filteredFavorites: []
        });
      },

      togglePalette: () => {
        const { isOpen } = get();
        if (isOpen) {
          get().closePalette();
        } else {
          get().openPalette();
        }
      },

      setSearchTerm: (term: string) => {
        const filtered = getFilteredFavorites(term);
        set({
          searchTerm: term,
          selectedIndex: 0,
          filteredFavorites: filtered
        });
      },

      setSelectedIndex: (index: number) => {
        set({ selectedIndex: index });
      },

      moveSelectionUp: () => {
        const { selectedIndex } = get();
        set({ selectedIndex: Math.max(0, selectedIndex - 1) });
      },

      moveSelectionDown: () => {
        const { selectedIndex, filteredFavorites } = get();
        const maxIndex = Math.max(0, filteredFavorites.length - 1);
        set({ selectedIndex: Math.min(maxIndex, selectedIndex + 1) });
      },

      setFilteredFavorites: (favorites) => {
        set({ filteredFavorites: favorites });
      },

      getSelectedNode: () => {
        const { filteredFavorites, selectedIndex } = get();
        if (selectedIndex < 0 || selectedIndex >= filteredFavorites.length) {
          return null;
        }
        const favorite = filteredFavorites[selectedIndex];
        return useMetadataStore.getState().getMetadata(favorite.nodeType) || null;
      }
    };
  }
);

export default useQuickFavoritesPaletteStore;
