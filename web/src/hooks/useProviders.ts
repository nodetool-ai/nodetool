import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { ProviderInfo } from "../stores/ApiTypes";

interface UseProvidersResult {
  providers: ProviderInfo[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Hook to fetch and cache available providers with their capabilities.
 * Providers are cached and can be invalidated when secrets change.
 */
export const useProviders = (): UseProvidersResult => {
  const {
    data: providers,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["providers"],
    queryFn: () => trpc.models.providers.query(),
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
export const useProvidersByCapability = (capability: string): UseProvidersResult => {
  const { providers, isLoading, isFetching, error } = useProviders();

  const filteredProviders = useMemo(
    () => providers.filter((p) => p.capabilities.includes(capability)),
    [providers, capability]
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
export const useLanguageModelProviders = (): UseProvidersResult => {
  return useProvidersByCapability("generate_message");
};

/**
 * Get providers that support image generation.
 */
export const useImageModelProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_image");
};

/**
 * Get providers that support TTS.
 */
export const useTTSProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_speech");
};

/**
 * Get providers that support ASR.
 */
export const useASRProviders = (): UseProvidersResult => {
  return useProvidersByCapability("automatic_speech_recognition");
};

/**
 * Get providers that support video generation.
 */
export const useVideoProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_video");
};

/**
 * Get providers that support embeddings.
 */
export const useEmbeddingProviders = (): UseProvidersResult => {
  return useProvidersByCapability("generate_embedding");
};

