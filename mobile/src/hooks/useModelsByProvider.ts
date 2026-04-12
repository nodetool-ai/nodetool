/**
 * Hooks for fetching models by provider, mirroring the web's useModelsByProvider.
 *
 * Each hook fetches providers with the relevant capability, then fetches models
 * from each provider in parallel. Results are flattened into a single array.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiService } from "../services/api";
import type {
  ProviderInfo,
  LanguageModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  EmbeddingModel,
} from "../types/ApiTypes";

// ── Generic model type ──────────────────────────────────────────────

interface BaseModel {
  type: string;
  id: string;
  name: string;
  provider: string;
}

interface UseModelsResult<T> {
  models: T[];
  providers: ProviderInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Capability → model type mapping ─────────────────────────────────

const CAPABILITY_MAP: Record<string, string> = {
  language_model: "generate_message",
  embedding_model: "generate_embedding",
  image_model: "text_to_image",
  tts_model: "text_to_speech",
  asr_model: "automatic_speech_recognition",
  video_model: "text_to_video",
};

// ── Generic hook ────────────────────────────────────────────────────

function useModelsByProvider<T extends BaseModel>(
  capability: string,
  fetchModels: (provider: string) => Promise<T[]>
): UseModelsResult<T> {
  const [models, setModels] = useState<T[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allProviders = await apiService.getProvidersByCapability(capability);
      if (!mountedRef.current) return;
      setProviders(allProviders);

      const results = await Promise.allSettled(
        allProviders.map((p) => fetchModels(p.provider))
      );
      if (!mountedRef.current) return;

      const allModels: T[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          allModels.push(...result.value);
        }
      }
      // Sort alphabetically by name
      allModels.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      setModels(allModels);
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error).message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [capability, fetchModels]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll]);

  return { models, providers, isLoading, error, refetch: fetchAll };
}

// ── Typed hooks per model category ──────────────────────────────────

const fetchLLM = (provider: string) => apiService.getLanguageModels(provider);
const fetchImage = (provider: string) => apiService.getImageModels(provider);
const fetchTTS = (provider: string) => apiService.getTTSModels(provider);
const fetchASR = (provider: string) => apiService.getASRModels(provider);
const fetchVideo = (provider: string) => apiService.getVideoModels(provider);

export function useLanguageModelsByProvider(): UseModelsResult<LanguageModel> {
  return useModelsByProvider("generate_message", fetchLLM);
}

export function useImageModelsByProvider(): UseModelsResult<ImageModel> {
  return useModelsByProvider("text_to_image", fetchImage);
}

export function useTTSModelsByProvider(): UseModelsResult<TTSModel> {
  return useModelsByProvider("text_to_speech", fetchTTS);
}

export function useASRModelsByProvider(): UseModelsResult<ASRModel> {
  return useModelsByProvider("automatic_speech_recognition", fetchASR);
}

export function useVideoModelsByProvider(): UseModelsResult<VideoModel> {
  return useModelsByProvider("text_to_video", fetchVideo);
}

/**
 * Returns the right hook result for a given model type string.
 * Used by the generic ModelSelector to fetch models of any type.
 */
export function useModelsForType(modelType: string): UseModelsResult<BaseModel> {
  // Map model type to capability
  const capability = CAPABILITY_MAP[modelType];

  // Determine fetch function — cast to BaseModel[] since all model types
  // share the same {type, id, name, provider} shape.
  const fetchFn = useCallback(
    async (provider: string): Promise<BaseModel[]> => {
      switch (modelType) {
        case "language_model":
          return apiService.getLanguageModels(provider) as Promise<BaseModel[]>;
        case "image_model":
          return apiService.getImageModels(provider) as Promise<BaseModel[]>;
        case "tts_model":
          return apiService.getTTSModels(provider) as Promise<BaseModel[]>;
        case "asr_model":
          return apiService.getASRModels(provider) as Promise<BaseModel[]>;
        case "video_model":
          return apiService.getVideoModels(provider) as Promise<BaseModel[]>;
        default:
          return apiService.getLanguageModels(provider) as Promise<BaseModel[]>;
      }
    },
    [modelType]
  );

  return useModelsByProvider(capability ?? "generate_message", fetchFn);
}
