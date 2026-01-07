/**
 * FavoriteNodesStore
 *
 * This module manages the user's favorite nodes for quick access.
 * It provides:
 * - Adding/removing nodes from favorites
 * - Checking if a node is favorited
 * - Getting all favorite nodes
 * - Persisting favorites to localStorage
 *
 * Favorites are stored by node_type identifier.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteNodesStore {
  /** Set of node_type identifiers that are marked as favorites */
  favorites: Set<string>;

  /** Add a node to favorites */
  addFavorite: (nodeType: string) => void;

  /** Remove a node from favorites */
  removeFavorite: (nodeType: string) => void;

  /** Toggle a node's favorite status */
  toggleFavorite: (nodeType: string) => void;

  /** Check if a node is favorited */
  isFavorite: (nodeType: string) => boolean;

  /** Get all favorite node types */
  getFavorites: () => string[];

  /** Clear all favorites */
  clearFavorites: () => void;
}

export const useFavoriteNodesStore = create<FavoriteNodesStore>()(
  persist(
    (set, get) => ({
      favorites: new Set<string>(),

      addFavorite: (nodeType: string) => {
        set((state) => {
          const newFavorites = new Set(state.favorites);
          newFavorites.add(nodeType);
          return { favorites: newFavorites };
        });
      },

      removeFavorite: (nodeType: string) => {
        set((state) => {
          const newFavorites = new Set(state.favorites);
          newFavorites.delete(nodeType);
          return { favorites: newFavorites };
        });
      },

      toggleFavorite: (nodeType: string) => {
        const { favorites } = get();
        if (favorites.has(nodeType)) {
          get().removeFavorite(nodeType);
        } else {
          get().addFavorite(nodeType);
        }
      },

      isFavorite: (nodeType: string) => {
        return get().favorites.has(nodeType);
      },

      getFavorites: () => {
        return Array.from(get().favorites);
      },

      clearFavorites: () => {
        set({ favorites: new Set<string>() });
      }
    }),
    {
      name: "favorite-nodes-storage",
      partialize: (state) => ({
        favorites: Array.from(state.favorites)
      }),
      merge: (persistedState, currentState) => {
        const typedPersisted = persistedState as { favorites: string[] } | undefined;
        if (typedPersisted?.favorites) {
          return {
            ...currentState,
            favorites: new Set(typedPersisted.favorites)
          };
        }
        return currentState;
      }
    }
  )
);

export default useFavoriteNodesStore;
