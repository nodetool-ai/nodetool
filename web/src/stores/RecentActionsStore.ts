import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentAction {
  id: string;
  type: "workflow" | "node" | "template" | "command";
  name: string;
  timestamp: number;
  count: number;
}

export interface FavoritedItem {
  id: string;
  type: "workflow" | "node" | "template" | "command";
  name: string;
  addedAt: number;
}

interface RecentActionsState {
  recentActions: RecentAction[];
  favorites: FavoritedItem[];

  trackAction: (action: Omit<RecentAction, "timestamp" | "count">) => void;
  getRecentActions: () => RecentAction[];
  getFavorites: () => FavoritedItem[];

  toggleFavorite: (item: Omit<FavoritedItem, "addedAt">) => void;
  isFavorited: (id: string, type: FavoritedItem["type"]) => boolean;
  removeFavorite: (id: string, type: FavoritedItem["type"]) => void;

  clearRecentActions: () => void;
  clearAllFavorites: () => void;
}

const MAX_RECENT_ACTIONS = 20;

export const useRecentActionsStore = create<RecentActionsState>()(
  persist(
    (set, get) => ({
      recentActions: [],
      favorites: [],

      trackAction: (action) => {
        set((state) => {
          const existingIndex = state.recentActions.findIndex(
            (a) => a.id === action.id && a.type === action.type
          );

          if (existingIndex !== -1) {
            const updated = [...state.recentActions];
            updated[existingIndex] = {
              ...updated[existingIndex],
              timestamp: Date.now(),
              count: updated[existingIndex].count + 1,
            };
            return { recentActions: updated };
          }

          const newAction: RecentAction = {
            ...action,
            timestamp: Date.now(),
            count: 1,
          };

          const updated = [newAction, ...state.recentActions]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_RECENT_ACTIONS);

          return { recentActions: updated };
        });
      },

      getRecentActions: () => {
        return get().recentActions.slice(0, 5);
      },

      getFavorites: () => {
        return get().favorites;
      },

      toggleFavorite: (item) => {
        set((state) => {
          const existingIndex = state.favorites.findIndex(
            (f) => f.id === item.id && f.type === item.type
          );

          if (existingIndex !== -1) {
            const updated = [...state.favorites];
            updated.splice(existingIndex, 1);
            return { favorites: updated };
          }

          const newFavorite: FavoritedItem = {
            ...item,
            addedAt: Date.now(),
          };

          return { favorites: [...state.favorites, newFavorite] };
        });
      },

      isFavorited: (id, type) => {
        return get().favorites.some((f) => f.id === id && f.type === type);
      },

      removeFavorite: (id, type) => {
        set((state) => ({
          favorites: state.favorites.filter(
            (f) => !(f.id === id && f.type === type)
          ),
        }));
      },

      clearRecentActions: () => {
        set({ recentActions: [] });
      },

      clearAllFavorites: () => {
        set({ favorites: [] });
      },
    }),
    {
      name: "recent-actions-storage",
      partialize: (state) => ({
        recentActions: state.recentActions,
        favorites: state.favorites,
      }),
    }
  )
);
