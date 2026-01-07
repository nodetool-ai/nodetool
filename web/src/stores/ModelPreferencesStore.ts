import { create } from "zustand";
import { persist } from "zustand/middleware";

type FavoriteKey = string; // `${provider}:${id}`

export type RecentEntry = {
  provider: string;
  id: string;
  name: string;
  lastUsedAt: number;
};

/**
 * Model type identifiers for default model preferences.
 * These correspond to the different model property types in the workflow system.
 */
export type DefaultModelType = 
  | "language_model" 
  | "image_model" 
  | "video_model" 
  | "tts_model" 
  | "asr_model";

/**
 * A default model entry stores the information needed to reconstruct a model reference.
 */
export type DefaultModelEntry = {
  type: DefaultModelType;
  provider: string;
  id: string;
  name: string;
  path?: string;
};

type ModelPreferencesState = {
  favorites: Set<FavoriteKey>;
  recents: RecentEntry[];
  onlyAvailable: boolean;
  // Provider enable/disable map. Missing key => enabled
  enabledProviders: Record<string, boolean>;
  // Default models for each model type
  defaultModels: Partial<Record<DefaultModelType, DefaultModelEntry>>;
  toggleFavorite: (provider: string, id: string) => void;
  isFavorite: (provider: string, id: string) => boolean;
  addRecent: (entry: Omit<RecentEntry, "lastUsedAt">) => void;
  getRecent: () => RecentEntry[];
  setOnlyAvailable: (only: boolean) => void;
  isProviderEnabled: (provider: string) => boolean;
  setProviderEnabled: (provider: string, enabled: boolean) => void;
  // Default model methods
  setDefaultModel: (modelType: DefaultModelType, entry: Omit<DefaultModelEntry, "type">) => void;
  getDefaultModel: (modelType: DefaultModelType) => DefaultModelEntry | undefined;
  clearDefaultModel: (modelType: DefaultModelType) => void;
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
      defaultModels: {},
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
      },
      setDefaultModel: (modelType: DefaultModelType, entry: Omit<DefaultModelEntry, "type">) => {
        const prev = get().defaultModels || {};
        const next = { 
          ...prev, 
          [modelType]: { 
            type: modelType,
            provider: entry.provider,
            id: entry.id,
            name: entry.name,
            path: entry.path
          } 
        };
        set({ defaultModels: next });
      },
      getDefaultModel: (modelType: DefaultModelType) => {
        return get().defaultModels?.[modelType];
      },
      clearDefaultModel: (modelType: DefaultModelType) => {
        const prev = get().defaultModels || {};
        const { [modelType]: _, ...next } = prev;
        set({ defaultModels: next });
      }
    }),
    {
      name: "model-preferences",
      partialize: (state) => ({
        favorites: Array.from(state.favorites),
        recents: state.recents,
        onlyAvailable: state.onlyAvailable,
        enabledProviders: state.enabledProviders,
        defaultModels: state.defaultModels
      }),
      // Rehydrate Set
      onRehydrateStorage: () => (state) => {
        if (!state) {return;}
        if (Array.isArray((state as any).favorites)) {
          (state as any).favorites = new Set((state as any).favorites);
        }
      }
    }
  )
);

export default useModelPreferencesStore;
