import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isBoolean, isObjectLike } from "../utils/typePredicates";

type FavoriteKey = string; // `${provider}:${id}`

type RecentEntry = {
  provider: string;
  id: string;
  name: string;
  lastUsedAt: number;
};

/** The persisted projection of the store: `favorites` is an array on disk. */
type PersistedModelPreferences = {
  favorites: FavoriteKey[];
  recents: RecentEntry[];
  onlyAvailable: boolean;
  enabledProviders: Record<string, boolean>;
  defaults: Record<string, { provider: string; id: string; name: string }>;
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
      version: 1,
      partialize: (state): PersistedModelPreferences => ({
        favorites: Array.from(state.favorites),
        recents: state.recents,
        onlyAvailable: state.onlyAvailable,
        enabledProviders: state.enabledProviders,
        defaults: state.defaults
      }),
      migrate: (persistedState, _version): PersistedModelPreferences => {
        // Corrupt localStorage (string, null, etc.) must NOT be passed
        // through unchanged: it would rehydrate the store into an
        // invalid shape that breaks selectors expecting the partialized
        // keys. Always return an object with every required field.
        const fallback: PersistedModelPreferences = {
          favorites: [],
          recents: [],
          onlyAvailable: false,
          enabledProviders: {},
          defaults: {}
        };
        if (!persistedState || !isObjectLike(persistedState)) {
          return fallback;
        }
        const state = persistedState as Record<string, unknown>;
        return {
          favorites: Array.isArray(state.favorites)
            ? state.favorites
            : fallback.favorites,
          recents: Array.isArray(state.recents)
            ? state.recents
            : fallback.recents,
          onlyAvailable:
            isBoolean(state.onlyAvailable)
              ? state.onlyAvailable
              : fallback.onlyAvailable,
          enabledProviders:
            state.enabledProviders &&
            isObjectLike(state.enabledProviders)
              ? (state.enabledProviders as PersistedModelPreferences["enabledProviders"])
              : fallback.enabledProviders,
          defaults:
            state.defaults && isObjectLike(state.defaults)
              ? (state.defaults as PersistedModelPreferences["defaults"])
              : fallback.defaults
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        // After JSON deserialization, favorites is an array, not a Set.
        const rawFavorites = state.favorites as unknown;
        state.favorites = Array.isArray(rawFavorites)
          ? new Set(rawFavorites as FavoriteKey[])
          : new Set<FavoriteKey>();
      }
    }
  )
);

export default useModelPreferencesStore;
