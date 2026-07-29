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

export const useProviders = (): UseProvidersResult => {
  const {
    data: providers,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["providers"],
    queryFn: () => trpc.models.providers.query(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  return {
    providers: providers || [],
    isLoading,
    isFetching,
    error
  };
};

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

export const useLanguageModelProviders = (): UseProvidersResult => {
  return useProvidersByCapability("generate_message");
};

export const useImageModelProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_image");
};

export const useTTSProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_speech");
};

export const useASRProviders = (): UseProvidersResult => {
  return useProvidersByCapability("automatic_speech_recognition");
};

export const useMusicProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_music");
};

export const useVideoProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_video");
};

export const useEmbeddingProviders = (): UseProvidersResult => {
  return useProvidersByCapability("generate_embedding");
};

