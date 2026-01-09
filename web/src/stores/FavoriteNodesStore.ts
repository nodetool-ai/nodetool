/**
 * FavoriteNodesStore
 *
 * Tracks favorite nodes for quick access in the NodeMenu.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteNode {
  nodeType: string;
  timestamp: number;
}

interface FavoriteNodesStore {
  favorites: FavoriteNode[];
  addFavorite: (nodeType: string) => void;
  removeFavorite: (nodeType: string) => void;
  isFavorite: (nodeType: string) => boolean;
  getFavorites: () => FavoriteNode[];
  toggleFavorite: (nodeType: string) => void;
  clearFavorites: () => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
}

const MAX_FAVORITES = 12;

export const useFavoriteNodesStore = create<FavoriteNodesStore>()(
  persist(
    (set, get) => ({
      favorites: [],

      addFavorite: (nodeType: string) => {
        set((state) => {
          if (state.favorites.some((f) => f.nodeType === nodeType)) {
            return state;
          }
          const updated = [
            { nodeType, timestamp: Date.now() },
            ...state.favorites
          ];
          return {
            favorites: updated.slice(0, MAX_FAVORITES)
          };
        });
      },

      removeFavorite: (nodeType: string) => {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.nodeType !== nodeType)
        }));
      },

      isFavorite: (nodeType: string) => {
        return get().favorites.some((f) => f.nodeType === nodeType);
      },

      getFavorites: () => {
        return get().favorites;
      },

      toggleFavorite: (nodeType: string) => {
        if (get().isFavorite(nodeType)) {
          get().removeFavorite(nodeType);
        } else {
          get().addFavorite(nodeType);
        }
      },

      clearFavorites: () => {
        set({ favorites: [] });
      },

      reorderFavorites: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const updated = [...state.favorites];
          if (fromIndex >= 0 && fromIndex < updated.length && toIndex >= 0 && toIndex < updated.length) {
            const [removed] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, removed);
          }
          return { favorites: updated };
        });
      }
    }),
    {
      name: "nodetool-favorite-nodes",
      version: 1
    }
  )
);

export default useFavoriteNodesStore;
