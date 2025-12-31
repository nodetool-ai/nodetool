import { create } from "zustand";

/**
 * Represents a Replicate model from the API
 */
export interface ReplicateModel {
  url: string;
  owner: string;
  name: string;
  description: string;
  visibility: string;
  github_url?: string;
  paper_url?: string;
  license_url?: string;
  run_count?: number;
  cover_image_url?: string;
  default_example?: {
    input?: Record<string, unknown>;
    output?: unknown;
  };
  latest_version?: ReplicateVersion;
}

/**
 * Represents a version of a Replicate model
 */
export interface ReplicateVersion {
  id: string;
  created_at: string;
  cog_version?: string;
  openapi_schema?: ReplicateOpenAPISchema;
}

/**
 * OpenAPI schema for a Replicate model version
 */
export interface ReplicateOpenAPISchema {
  info?: {
    title?: string;
    version?: string;
  };
  components?: {
    schemas?: {
      Input?: {
        properties?: Record<string, ReplicateSchemaProperty>;
        required?: string[];
      };
      Output?: {
        type?: string;
        items?: { type?: string; format?: string };
        format?: string;
      };
    };
  };
}

/**
 * A property in the Replicate model schema
 */
export interface ReplicateSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  items?: { type?: string; format?: string };
  "x-order"?: number;
  allOf?: Array<{ $ref?: string; default?: unknown }>;
}

/**
 * Search result from Replicate API
 */
export interface ReplicateSearchResult {
  results: ReplicateModel[];
  next?: string;
  previous?: string;
}

/**
 * Cache entry for model data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Store state for Replicate integration
 */
interface ReplicateStoreState {
  // Search state
  searchQuery: string;
  searchResults: ReplicateModel[];
  isSearching: boolean;
  searchError: string | null;
  
  // Model cache
  modelCache: Record<string, CacheEntry<ReplicateModel>>;
  versionCache: Record<string, CacheEntry<ReplicateVersion>>;
  
  // Selected model
  selectedModel: ReplicateModel | null;
  selectedVersion: ReplicateVersion | null;
  
  // Recent models
  recentModels: string[];
  
  // Actions
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: ReplicateModel[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  setSearchError: (error: string | null) => void;
  
  cacheModel: (modelId: string, model: ReplicateModel) => void;
  getCachedModel: (modelId: string) => ReplicateModel | null;
  cacheVersion: (versionId: string, version: ReplicateVersion) => void;
  getCachedVersion: (versionId: string) => ReplicateVersion | null;
  
  setSelectedModel: (model: ReplicateModel | null) => void;
  setSelectedVersion: (version: ReplicateVersion | null) => void;
  
  addRecentModel: (modelId: string) => void;
  clearRecentModels: () => void;
  
  clearCache: () => void;
}

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const MAX_RECENT_MODELS = 10;

/**
 * Zustand store for Replicate model management
 */
export const useReplicateStore = create<ReplicateStoreState>((set, get) => ({
  // Initial state
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  searchError: null,
  modelCache: {},
  versionCache: {},
  selectedModel: null,
  selectedVersion: null,
  recentModels: [],
  
  // Search actions
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  
  setSearchResults: (results: ReplicateModel[]) => {
    set({ searchResults: results });
    // Cache the results
    results.forEach((model) => {
      const modelId = `${model.owner}/${model.name}`;
      get().cacheModel(modelId, model);
    });
  },
  
  setIsSearching: (isSearching: boolean) => set({ isSearching }),
  
  setSearchError: (error: string | null) => set({ searchError: error }),
  
  // Cache actions
  cacheModel: (modelId: string, model: ReplicateModel) => {
    set((state) => ({
      modelCache: {
        ...state.modelCache,
        [modelId]: {
          data: model,
          timestamp: Date.now()
        }
      }
    }));
  },
  
  getCachedModel: (modelId: string) => {
    const entry = get().modelCache[modelId];
    if (!entry) {return null;}
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      // Remove stale entry
      set((state) => {
        const { [modelId]: _, ...rest } = state.modelCache;
        return { modelCache: rest };
      });
      return null;
    }
    
    return entry.data;
  },
  
  cacheVersion: (versionId: string, version: ReplicateVersion) => {
    set((state) => ({
      versionCache: {
        ...state.versionCache,
        [versionId]: {
          data: version,
          timestamp: Date.now()
        }
      }
    }));
  },
  
  getCachedVersion: (versionId: string) => {
    const entry = get().versionCache[versionId];
    if (!entry) {return null;}
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      // Remove stale entry
      set((state) => {
        const { [versionId]: _, ...rest } = state.versionCache;
        return { versionCache: rest };
      });
      return null;
    }
    
    return entry.data;
  },
  
  // Selection actions
  setSelectedModel: (model: ReplicateModel | null) => {
    set({ selectedModel: model });
    if (model) {
      get().addRecentModel(`${model.owner}/${model.name}`);
    }
  },
  
  setSelectedVersion: (version: ReplicateVersion | null) => {
    set({ selectedVersion: version });
  },
  
  // Recent models actions
  addRecentModel: (modelId: string) => {
    set((state) => {
      const filtered = state.recentModels.filter((id) => id !== modelId);
      const updated = [modelId, ...filtered].slice(0, MAX_RECENT_MODELS);
      return { recentModels: updated };
    });
  },
  
  clearRecentModels: () => set({ recentModels: [] }),
  
  // Clear all cache
  clearCache: () => set({
    modelCache: {},
    versionCache: {},
    searchResults: []
  })
}));

export default useReplicateStore;
