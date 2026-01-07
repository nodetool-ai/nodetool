import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoriteWorkflowsState {
  favoriteWorkflowIds: Set<string>;
  toggleFavorite: (workflowId: string) => void;
  isFavorite: (workflowId: string) => boolean;
  getFavorites: () => string[];
  setFavorites: (workflowIds: string[]) => void;
}

export const useFavoriteWorkflowsStore = create<FavoriteWorkflowsState>()(
  persist(
    (set, get) => ({
      favoriteWorkflowIds: new Set<string>(),

      toggleFavorite: (workflowId: string) =>
        set((state) => {
          const newFavorites = new Set(state.favoriteWorkflowIds);
          if (newFavorites.has(workflowId)) {
            newFavorites.delete(workflowId);
          } else {
            newFavorites.add(workflowId);
          }
          return { favoriteWorkflowIds: newFavorites };
        }),

      isFavorite: (workflowId: string) => {
        return get().favoriteWorkflowIds.has(workflowId);
      },

      getFavorites: () => {
        return Array.from(get().favoriteWorkflowIds);
      },

      setFavorites: (workflowIds: string[]) =>
        set(() => ({
          favoriteWorkflowIds: new Set(workflowIds)
        }))
    }),
    {
      name: "favorite-workflows-storage",
      partialize: (state) => ({
        favoriteWorkflowIds: Array.from(state.favoriteWorkflowIds)
      }),
      merge: (persisted, current) => {
        const typedPersisted = persisted as { favoriteWorkflowIds?: string[] } | undefined;
        if (typedPersisted?.favoriteWorkflowIds) {
          return {
            ...current,
            favoriteWorkflowIds: new Set(typedPersisted.favoriteWorkflowIds)
          };
        }
        return current;
      }
    }
  )
);
