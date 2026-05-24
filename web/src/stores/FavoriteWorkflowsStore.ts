import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ favoriteWorkflowIds: state.favoriteWorkflowIds }),
      migrate: (persistedState, _version) => {
        if (!persistedState || typeof persistedState !== "object" || Array.isArray(persistedState)) {
          return { favoriteWorkflowIds: [] };
        }
        const state = persistedState as Record<string, unknown>;
        return {
          favoriteWorkflowIds: Array.isArray(state.favoriteWorkflowIds)
            ? (state.favoriteWorkflowIds as string[])
            : []
        };
      }
    }
  )
);

export interface FavoriteWorkflowActions {
  toggleFavorite: (workflowId: string) => void;
  addFavorite: (workflowId: string) => void;
  removeFavorite: (workflowId: string) => void;
  isFavorite: (workflowId: string) => boolean;
  clearAll: () => void;
}

export const useFavoriteWorkflowActions = (): FavoriteWorkflowActions =>
  useFavoriteWorkflowsStore(
    useShallow((state) => ({
      toggleFavorite: state.toggleFavorite,
      addFavorite: state.addFavorite,
      removeFavorite: state.removeFavorite,
      isFavorite: state.isFavorite,
      clearAll: state.clearAll
    }))
  );

export const useIsWorkflowFavorite = (workflowId: string): boolean =>
  useFavoriteWorkflowsStore((state) =>
    state.favoriteWorkflowIds.includes(workflowId)
  );

export const useFavoriteWorkflowIds = (): string[] =>
  useFavoriteWorkflowsStore((state) => state.favoriteWorkflowIds);
