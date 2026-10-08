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

/** Keeps `providers` referentially stable before the query resolves, so the
 *  per-capability filters below hold their memo while loading. */
const EMPTY_PROVIDERS: ProviderInfo[] = [];

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
    providers: providers || EMPTY_PROVIDERS,
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

/**
 * Every capability an `image_model` runs. A provider that only removes
 * backgrounds or estimates depth still lists models for the image picker.
 */
const IMAGE_MODEL_CAPABILITIES = [
  "text_to_image",
  "image_to_image",
  "inpainting",
  "outpaint_image",
  "upscale_image",
  "remove_background",
  "relight_image",
  "segment_image",
  "vectorize_image",
  "estimate_depth"
];

export const useImageModelProviders = (): UseProvidersResult => {
  const { providers, isLoading, isFetching, error } = useProviders();

  const filteredProviders = useMemo(
    () =>
      providers.filter((p) =>
        IMAGE_MODEL_CAPABILITIES.some((c) => p.capabilities.includes(c))
      ),
    [providers]
  );

  return {
    providers: filteredProviders,
    isLoading,
    isFetching,
    error
  };
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

export const useAudioToAudioProviders = (): UseProvidersResult => {
  return useProvidersByCapability("audio_to_audio");
};

export const useVideoProviders = (): UseProvidersResult => {
  return useProvidersByCapability("text_to_video");
};

export const useEmbeddingProviders = (): UseProvidersResult => {
  return useProvidersByCapability("generate_embedding");
};

export const useRerankProviders = (): UseProvidersResult => {
  return useProvidersByCapability("rerank");
};

