import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoritesState {
  favoriteWorkflowIds: string[];
  isFavorite: (workflowId: string) => boolean;
  addFavorite: (workflowId: string) => void;
  removeFavorite: (workflowId: string) => void;
  toggleFavorite: (workflowId: string) => void;
  getFavorites: () => string[];
}

const useFavoritesStore = create<FavoritesState>()(
  persist<FavoritesState>(
    (set, get) => ({
      favoriteWorkflowIds: [],

      isFavorite: (workflowId: string) => {
        return get().favoriteWorkflowIds.includes(workflowId);
      },

      addFavorite: (workflowId: string) => {
        set((state) => {
          if (state.favoriteWorkflowIds.includes(workflowId)) {
            return state;
          }
          return {
            favoriteWorkflowIds: [...state.favoriteWorkflowIds, workflowId]
          };
        });
      },

      removeFavorite: (workflowId: string) => {
        set((state) => ({
          favoriteWorkflowIds: state.favoriteWorkflowIds.filter(
            (id) => id !== workflowId
          )
        }));
      },

      toggleFavorite: (workflowId: string) => {
        const { isFavorite, addFavorite, removeFavorite } = get();
        if (isFavorite(workflowId)) {
          removeFavorite(workflowId);
        } else {
          addFavorite(workflowId);
        }
      },

      getFavorites: () => {
        return get().favoriteWorkflowIds;
      }
    }),
    {
      name: "workflow-favorites"
    }
  )
);

export default useFavoritesStore;
