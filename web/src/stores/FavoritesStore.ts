import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteNode {
  nodeType: string;
  addedAt: number;
}

type FavoritesStore = {
  favorites: FavoriteNode[];
  addFavorite: (nodeType: string) => void;
  removeFavorite: (nodeType: string) => void;
  toggleFavorite: (nodeType: string) => void;
  isFavorite: (nodeType: string) => boolean;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  clearFavorites: () => void;
};

const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      favorites: [],
      addFavorite: (nodeType: string) => {
        const current = get().favorites;
        if (!current.some((f) => f.nodeType === nodeType)) {
          set({
            favorites: [...current, { nodeType, addedAt: Date.now() }]
          });
        }
      },
      removeFavorite: (nodeType: string) => {
        set({
          favorites: get().favorites.filter((f) => f.nodeType !== nodeType)
        });
      },
      toggleFavorite: (nodeType: string) => {
        const current = get().favorites;
        if (current.some((f) => f.nodeType === nodeType)) {
          set({
            favorites: current.filter((f) => f.nodeType !== nodeType)
          });
        } else {
          set({
            favorites: [...current, { nodeType, addedAt: Date.now() }]
          });
        }
      },
      isFavorite: (nodeType: string) => {
        return get().favorites.some((f) => f.nodeType === nodeType);
      },
      reorderFavorites: (fromIndex: number, toIndex: number) => {
        const current = [...get().favorites];
        const [removed] = current.splice(fromIndex, 1);
        current.splice(toIndex, 0, removed);
        set({ favorites: current });
      },
      clearFavorites: () => {
        set({ favorites: [] });
      }
    }),
    {
      name: "node-favorites"
    }
  )
);

export default useFavoritesStore;
