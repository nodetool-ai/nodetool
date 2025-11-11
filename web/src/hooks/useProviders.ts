import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type { ProviderInfo } from "../stores/ApiTypes";

/**
 * Hook to fetch and cache available providers with their capabilities.
 * Providers are cached and can be invalidated when secrets change.
 */
export const useProviders = () => {
  const {
    data: providers,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/providers", {});
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: false
  });

  return {
    providers: providers || [],
    isLoading,
    isFetching,
    error
  };
};

/**
 * Get providers that support a specific capability.
 */
export const useProvidersByCapability = (capability: string) => {
  const { providers, isLoading, isFetching, error } = useProviders();

  const filteredProviders = providers.filter((p) =>
    p.capabilities.includes(capability)
  );

  return {
    providers: filteredProviders,
    isLoading,
    isFetching,
    error
  };
};

/**
 * Get providers that support language model generation.
 */
export const useLanguageModelProviders = () => {
  return useProvidersByCapability("generate_message");
};

/**
 * Get providers that support image generation.
 */
export const useImageModelProviders = () => {
  return useProvidersByCapability("text_to_image");
};

/**
 * Get providers that support TTS.
 */
export const useTTSProviders = () => {
  return useProvidersByCapability("text_to_speech");
};

/**
 * Get providers that support ASR.
 */
export const useASRProviders = () => {
  return useProvidersByCapability("automatic_speech_recognition");
};

/**
 * Get providers that support video generation.
 */
export const useVideoProviders = () => {
  return useProvidersByCapability("text_to_video");
};

