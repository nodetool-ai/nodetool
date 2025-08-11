import { create } from "zustand";
import { persist } from "zustand/middleware";

type FavoriteKey = string; // `${provider}:${id}`

export type RecentEntry = {
  provider: string;
  id: string;
  name: string;
  lastUsedAt: number;
};

type ModelPreferencesState = {
  favorites: Set<FavoriteKey>;
  recents: RecentEntry[];
  onlyAvailable: boolean;
  toggleFavorite: (provider: string, id: string) => void;
  isFavorite: (provider: string, id: string) => boolean;
  addRecent: (entry: Omit<RecentEntry, "lastUsedAt">) => void;
  getRecent: () => RecentEntry[];
  setOnlyAvailable: (only: boolean) => void;
};

function keyFor(provider: string, id: string): FavoriteKey {
  return `${provider}:${id}`;
}

const MAX_RECENTS = 8;

export const useModelPreferencesStore = create<ModelPreferencesState>()(
  persist(
    (set, get) => ({
      favorites: new Set<FavoriteKey>(),
      recents: [],
      onlyAvailable: false,
      toggleFavorite: (provider: string, id: string) => {
        const k = keyFor(provider, id);
        const favorites = new Set(get().favorites);
        if (favorites.has(k)) {
          favorites.delete(k);
        } else {
          favorites.add(k);
        }
        set({ favorites });
        // eslint-disable-next-line no-console
        console.log("[ModelMenu] toggleFavorite", {
          provider,
          id,
          isFavorite: favorites.has(k)
        });
      },
      isFavorite: (provider: string, id: string) => {
        return get().favorites.has(keyFor(provider, id));
      },
      addRecent: ({ provider, id, name }) => {
        const now = Date.now();
        const next = [
          { provider, id, name, lastUsedAt: now },
          ...get().recents.filter(
            (r) => !(r.provider === provider && r.id === id)
          )
        ]
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          .slice(0, MAX_RECENTS);
        set({ recents: next });
        // eslint-disable-next-line no-console
        console.log("[ModelMenu] addRecent", { provider, id, name });
      },
      getRecent: () => get().recents,
      setOnlyAvailable: (only: boolean) => set({ onlyAvailable: only })
    }),
    {
      name: "model-preferences",
      partialize: (state) => ({
        favorites: Array.from(state.favorites),
        recents: state.recents,
        onlyAvailable: state.onlyAvailable
      }),
      // Rehydrate Set
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (Array.isArray((state as any).favorites)) {
          (state as any).favorites = new Set((state as any).favorites);
        }
      }
    }
  )
);

export default useModelPreferencesStore;
