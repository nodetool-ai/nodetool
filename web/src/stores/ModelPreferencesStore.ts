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
  // Provider enable/disable map. Missing key => enabled
  enabledProviders: Record<string, boolean>;
  toggleFavorite: (provider: string, id: string) => void;
  isFavorite: (provider: string, id: string) => boolean;
  addRecent: (entry: Omit<RecentEntry, "lastUsedAt">) => void;
  getRecent: () => RecentEntry[];
  setOnlyAvailable: (only: boolean) => void;
  isProviderEnabled: (provider: string) => boolean;
  setProviderEnabled: (provider: string, enabled: boolean) => void;
  defaults: Record<string, { provider: string; id: string; name: string }>;
  setDefault: (
    modelType: string,
    model: { provider: string; id: string; name: string }
  ) => void;
  clearDefault: (modelType: string) => void;
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
      enabledProviders: {},
      defaults: {},
      setDefault: (modelType, model) => {
        const prev = get().defaults;
        set({ defaults: { ...prev, [modelType]: model } });
      },
      clearDefault: (modelType) => {
        const { [modelType]: _, ...rest } = get().defaults;
        set({ defaults: rest });
      },
      toggleFavorite: (provider: string, id: string) => {
        const preferenceKey = keyFor(provider, id);
        const favorites = new Set(get().favorites);
        if (favorites.has(preferenceKey)) {
          favorites.delete(preferenceKey);
        } else {
          favorites.add(preferenceKey);
        }
        set({ favorites });
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
      },
      getRecent: () => get().recents,
      setOnlyAvailable: (only: boolean) => set({ onlyAvailable: only }),
      isProviderEnabled: (provider: string) => {
        const map = get().enabledProviders || {};
        // Default to enabled when not present
        return map[provider] !== false;
      },
      setProviderEnabled: (provider: string, enabled: boolean) => {
        const prev = get().enabledProviders || {};
        const next = { ...prev, [provider]: enabled };
        set({ enabledProviders: next });
      }
    }),
    {
      name: "model-preferences",
      partialize: (state) => ({
        favorites: Array.from(state.favorites),
        recents: state.recents,
        onlyAvailable: state.onlyAvailable,
        enabledProviders: state.enabledProviders,
        defaults: state.defaults
      }),
      // Rehydrate Set
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        const rawFavorites = (state as { favorites: unknown }).favorites;
        if (Array.isArray(rawFavorites)) {
          state.favorites = new Set(rawFavorites as FavoriteKey[]);
        }
      }
    }
  )
);

export default useModelPreferencesStore;
