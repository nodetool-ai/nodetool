import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useReplicateStore, ReplicateModel, ReplicateVersion } from "../stores/ReplicateStore";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/**
 * Fetches models from the Replicate API
 * Note: This uses CORS proxy or requires API key on backend
 */
async function fetchReplicateModels(query?: string): Promise<ReplicateModel[]> {
  // For now, use the public models endpoint which doesn't require auth
  // In production, this would go through the backend
  const url = query 
    ? `${REPLICATE_API_BASE}/models?query=${encodeURIComponent(query)}`
    : `${REPLICATE_API_BASE}/models`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.results || [];
}

/**
 * Fetches a specific model from Replicate
 */
async function fetchReplicateModel(owner: string, name: string): Promise<ReplicateModel> {
  const response = await fetch(`${REPLICATE_API_BASE}/models/${owner}/${name}`, {
    headers: {
      "Accept": "application/json"
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetches a specific version of a model
 */
async function fetchReplicateVersion(owner: string, name: string, versionId: string): Promise<ReplicateVersion> {
  const response = await fetch(
    `${REPLICATE_API_BASE}/models/${owner}/${name}/versions/${versionId}`,
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch version: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Popular/featured Replicate models for quick access
 */
export const FEATURED_REPLICATE_MODELS = [
  { owner: "stability-ai", name: "sdxl", description: "SDXL Image Generation" },
  { owner: "meta", name: "llama-2-70b-chat", description: "Llama 2 70B Chat" },
  { owner: "openai", name: "whisper", description: "Audio Transcription" },
  { owner: "lucataco", name: "animate-diff", description: "Video Generation" },
  { owner: "cjwbw", name: "rembg", description: "Background Removal" },
  { owner: "black-forest-labs", name: "flux-schnell", description: "Fast Image Generation" },
  { owner: "black-forest-labs", name: "flux-dev", description: "High Quality Image Generation" }
];

/**
 * Hook for searching Replicate models
 */
export function useReplicateSearch(query: string, enabled = true) {
  const { setSearchResults, setIsSearching, setSearchError } = useReplicateStore();
  
  return useQuery({
    queryKey: ["replicate-search", query],
    queryFn: async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await fetchReplicateModels(query);
        setSearchResults(results);
        return results;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setSearchError(message);
        throw error;
      } finally {
        setIsSearching(false);
      }
    },
    enabled: enabled && query.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook for fetching a specific Replicate model
 */
export function useReplicateModel(owner: string, name: string, enabled = true) {
  const { getCachedModel, cacheModel } = useReplicateStore();
  const modelId = `${owner}/${name}`;
  
  return useQuery({
    queryKey: ["replicate-model", owner, name],
    queryFn: async () => {
      // Check cache first
      const cached = getCachedModel(modelId);
      if (cached) {
        return cached;
      }
      
      const model = await fetchReplicateModel(owner, name);
      cacheModel(modelId, model);
      return model;
    },
    enabled: enabled && !!owner && !!name,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });
}

/**
 * Hook for fetching a specific version of a model
 */
export function useReplicateVersion(owner: string, name: string, versionId: string, enabled = true) {
  const { getCachedVersion, cacheVersion } = useReplicateStore();
  
  return useQuery({
    queryKey: ["replicate-version", owner, name, versionId],
    queryFn: async () => {
      // Check cache first
      const cached = getCachedVersion(versionId);
      if (cached) {
        return cached;
      }
      
      const version = await fetchReplicateVersion(owner, name, versionId);
      cacheVersion(versionId, version);
      return version;
    },
    enabled: enabled && !!owner && !!name && !!versionId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  });
}

/**
 * Hook for getting featured models
 */
export function useFeaturedReplicateModels() {
  return useQuery({
    queryKey: ["replicate-featured"],
    queryFn: async () => {
      // Fetch details for featured models
      const modelPromises = FEATURED_REPLICATE_MODELS.map(async ({ owner, name }) => {
        try {
          return await fetchReplicateModel(owner, name);
        } catch {
          // Return a placeholder if fetch fails
          return {
            owner,
            name,
            url: `https://replicate.com/${owner}/${name}`,
            description: FEATURED_REPLICATE_MODELS.find(
              (m) => m.owner === owner && m.name === name
            )?.description || "",
            visibility: "public"
          } as ReplicateModel;
        }
      });
      
      return Promise.all(modelPromises);
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000 // 1 hour
  });
}

/**
 * Parse a model version string into components
 * Format: "owner/name:version" or "owner/name"
 */
export function parseModelVersion(modelVersion: string): {
  owner: string;
  name: string;
  version?: string;
} {
  const colonIndex = modelVersion.lastIndexOf(":");
  let modelPart: string;
  let version: string | undefined;
  
  if (colonIndex > -1) {
    modelPart = modelVersion.slice(0, colonIndex);
    version = modelVersion.slice(colonIndex + 1);
  } else {
    modelPart = modelVersion;
  }
  
  const parts = modelPart.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid model format: ${modelVersion}. Expected "owner/name" or "owner/name:version"`);
  }
  
  return {
    owner: parts[0],
    name: parts[1],
    version
  };
}

/**
 * Format a model version string
 */
export function formatModelVersion(owner: string, name: string, version?: string): string {
  if (version) {
    return `${owner}/${name}:${version}`;
  }
  return `${owner}/${name}`;
}

/**
 * Combined hook for Replicate model operations
 */
export function useReplicateModels() {
  const queryClient = useQueryClient();
  const store = useReplicateStore();
  
  const search = useCallback(async (query: string) => {
    store.setSearchQuery(query);
    if (!query) {
      store.setSearchResults([]);
      return [];
    }
    
    const results = await queryClient.fetchQuery({
      queryKey: ["replicate-search", query],
      queryFn: () => fetchReplicateModels(query)
    });
    
    store.setSearchResults(results);
    return results;
  }, [queryClient, store]);
  
  const getModel = useCallback(async (owner: string, name: string) => {
    const modelId = `${owner}/${name}`;
    const cached = store.getCachedModel(modelId);
    if (cached) {return cached;}
    
    const model = await queryClient.fetchQuery({
      queryKey: ["replicate-model", owner, name],
      queryFn: () => fetchReplicateModel(owner, name)
    });
    
    store.cacheModel(modelId, model);
    return model;
  }, [queryClient, store]);
  
  const selectModel = useCallback((model: ReplicateModel | null) => {
    store.setSelectedModel(model);
    if (model?.latest_version) {
      store.setSelectedVersion(model.latest_version);
    } else {
      store.setSelectedVersion(null);
    }
  }, [store]);
  
  return {
    // State
    searchQuery: store.searchQuery,
    searchResults: store.searchResults,
    isSearching: store.isSearching,
    searchError: store.searchError,
    selectedModel: store.selectedModel,
    selectedVersion: store.selectedVersion,
    recentModels: store.recentModels,
    
    // Actions
    search,
    getModel,
    selectModel,
    setSearchQuery: store.setSearchQuery,
    clearCache: store.clearCache,
    clearRecentModels: store.clearRecentModels
  };
}

export default useReplicateModels;
