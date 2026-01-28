import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface FavoriteWorkflowsState {
  favoriteWorkflowIds: string[];
  toggleFavorite: (workflowId: string) => void;
  addFavorite: (workflowId: string) => void;
  removeFavorite: (workflowId: string) => void;
  isFavorite: (workflowId: string) => boolean;
  clearAll: () => void;
}

export const useFavoriteWorkflowsStore = create<FavoriteWorkflowsState>()(
  persist(
    (set, get) => ({
      favoriteWorkflowIds: [],
      toggleFavorite: (workflowId: string) => {
        set((state) => {
          const isFav = state.favoriteWorkflowIds.includes(workflowId);
          return {
            favoriteWorkflowIds: isFav
              ? state.favoriteWorkflowIds.filter((id) => id !== workflowId)
              : [...state.favoriteWorkflowIds, workflowId],
          };
        });
      },
      addFavorite: (workflowId: string) => {
        set((state) => {
          if (state.favoriteWorkflowIds.includes(workflowId)) {
            return state;
          }
          return {
            favoriteWorkflowIds: [...state.favoriteWorkflowIds, workflowId],
          };
        });
      },
      removeFavorite: (workflowId: string) => {
        set((state) => ({
          favoriteWorkflowIds: state.favoriteWorkflowIds.filter(
            (id) => id !== workflowId
          ),
        }));
      },
      isFavorite: (workflowId: string) => {
        return get().favoriteWorkflowIds.includes(workflowId);
      },
      clearAll: () => {
        set({ favoriteWorkflowIds: [] });
      },
    }),
    {
      name: "favorite-workflows",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ favoriteWorkflowIds: state.favoriteWorkflowIds }),
    }
  )
);

export const useFavoriteWorkflowActions = () => {
  const toggleFavorite = useFavoriteWorkflowsStore((state) => state.toggleFavorite);
  const addFavorite = useFavoriteWorkflowsStore((state) => state.addFavorite);
  const removeFavorite = useFavoriteWorkflowsStore((state) => state.removeFavorite);
  const isFavorite = useFavoriteWorkflowsStore((state) => state.isFavorite);
  const clearAll = useFavoriteWorkflowsStore((state) => state.clearAll);
  return { toggleFavorite, addFavorite, removeFavorite, isFavorite, clearAll };
};

export const useIsWorkflowFavorite = (workflowId: string) =>
  useFavoriteWorkflowsStore((state) =>
    state.favoriteWorkflowIds.includes(workflowId)
  );

export const useFavoriteWorkflowIds = () =>
  useFavoriteWorkflowsStore((state) => state.favoriteWorkflowIds);
