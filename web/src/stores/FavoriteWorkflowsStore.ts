import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface FavoriteWorkflowsState {
  favoriteWorkflowIds: string[];
  actions: {
    toggleFavorite: (workflowId: string) => void;
    addFavorite: (workflowId: string) => void;
    removeFavorite: (workflowId: string) => void;
    isFavorite: (workflowId: string) => boolean;
    clearAll: () => void;
  };
}

export const useFavoriteWorkflowsStore = create<FavoriteWorkflowsState>()(
  persist(
    (set, get) => ({
      favoriteWorkflowIds: [],
      actions: {
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
      },
    }),
    {
      name: "favorite-workflows",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const useFavoriteWorkflowActions = () =>
  useFavoriteWorkflowsStore((state) => state.actions);

export const useIsWorkflowFavorite = (workflowId: string) =>
  useFavoriteWorkflowsStore((state) =>
    state.favoriteWorkflowIds.includes(workflowId)
  );

export const useFavoriteWorkflowIds = () =>
  useFavoriteWorkflowsStore((state) => state.favoriteWorkflowIds);
