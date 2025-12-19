import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type {
  LanguageModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  UnifiedModel
} from "../stores/ApiTypes";
import { BASE_URL } from "../stores/BASE_URL";
import {
  useLanguageModelProviders,
  useImageModelProviders,
  useTTSProviders,
  useASRProviders,
  useVideoProviders
} from "./useProviders";

/**
 * Collection of React Query hooks that bridge the UI to backend model endpoints.
 *
 * Backend contract (nodetool-core/nodetool/api/model.py):
 * - GET /api/models/llm/{provider}     → LanguageModel[]
 * - GET /api/models/image/{provider}   → ImageModel[]
 * - GET /api/models/tts/{provider}     → TTSModel[]
 * - GET /api/models/asr/{provider}     → ASRModel[]
 * - GET /api/models/video/{provider}   → VideoModel[]
 * - GET /api/models/huggingface/type/{model_type} → UnifiedModel[] filtered server-side by hf.* type
 *
 * Providers are enumerated via use*Providers hooks and fanned out into parallel
 * queries to minimize latency. Each hook returns aggregated models along with
 * loading/fetching/error state so pages can render incremental results safely.
 */

/**
 * Hook to fetch language models from all providers that support language models.
 * Queries each provider in parallel for better performance.
 */
export const useLanguageModelsByProvider = (options?: {
  allowedProviders?: string[];
}) => {
  const { providers: allProviders, isLoading: providersLoading } =
    useLanguageModelProviders();

  const providers = useMemo(() => {
    if (!options?.allowedProviders) return allProviders;
    const lowerAllowed = options.allowedProviders.map((p) => p.toLowerCase());
    return allProviders.filter((p) =>
      lowerAllowed.includes(p.provider.toLowerCase())
    );
  }, [allProviders, options?.allowedProviders]);

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["language-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const { data, error } = await client.GET("/api/models/llm/{provider}", {
          params: {
            path: {
              provider: providerValue as any
            }
          }
        });
        if (error) throw error;
        return {
          provider: providerValue,
          models: (data || []) as LanguageModel[]
        };
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false
    }))
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  const allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  return {
    models: allModels || [],
    isLoading,
    isFetching,
    error,
    allowedProviders: options?.allowedProviders
  };
};

/**
 * Hook to fetch image models from all providers that support image generation.
 * Queries each provider in parallel for better performance.
 */
export const useImageModelsByProvider = (opts?: { task?: "text_to_image" | "image_to_image" }) => {
  const { providers, isLoading: providersLoading, error: providersError } = useImageModelProviders();

  const queries = useQueries({
    queries: providers.length > 0 ? providers.map((provider) => ({
      queryKey: ["image-models", provider.provider],
      queryFn: async () => {
        try {
          // Convert Provider enum to string for API path parameter
          const providerValue = String(provider.provider);
          const { data, error } = await client.GET("/api/models/image/{provider}", {
            params: {
              path: {
                provider: providerValue as any
              }
            }
          });
          if (error) {
            console.error(`Error fetching image models for provider ${providerValue}:`, error);
            throw error;
          }
          return {
            provider: providerValue,
            models: (data || []) as ImageModel[]
          };
        } catch (err) {
          console.error(`Failed to fetch image models for provider ${provider.provider}:`, err);
          // Return empty array for this provider instead of failing completely
          return {
            provider: String(provider.provider),
            models: [] as ImageModel[]
          };
        }
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false
    })) : []
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = providersError || queries.find((q) => q.error)?.error;

  let allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  // Filter by supported task if requested. Include models with unknown supported_tasks for compatibility.
  if (opts?.task) {
    const task = opts.task;
    allModels = allModels.filter((m) => !m.supported_tasks || m.supported_tasks.length === 0 || m.supported_tasks.includes(task as any));
  }

  // Debug logging removed

  return {
    models: allModels || [],
    isLoading,
    isFetching,
    error
  };
};

/**
 * Hook to fetch TTS models from all providers that support text-to-speech.
 * Queries each provider in parallel for better performance.
 */
export const useTTSModelsByProvider = () => {
  const { providers, isLoading: providersLoading } = useTTSProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["tts-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const { data, error } = await client.GET("/api/models/tts/{provider}", {
          params: {
            path: {
              provider: providerValue as any
            }
          }
        });
        if (error) throw error;
        return {
          provider: providerValue,
          models: (data || []) as TTSModel[]
        };
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false
    }))
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  const allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  return {
    models: allModels || [],
    isLoading,
    isFetching,
    error
  };
};

/**
 * Hook to fetch ASR models from all providers that support automatic speech recognition.
 * Queries each provider in parallel for better performance.
 */
export const useASRModelsByProvider = () => {
  const { providers, isLoading: providersLoading } = useASRProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["asr-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const { data, error } = await client.GET("/api/models/asr/{provider}", {
          params: {
            path: {
              provider: providerValue as any
            }
          }
        });
        if (error) throw error;
        return {
          provider: providerValue,
          models: (data || []) as ASRModel[]
        };
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false
    }))
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  const allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  return {
    models: allModels || [],
    isLoading,
    isFetching,
    error
  };
};

/**
 * Hook to fetch video models from all providers that support video generation.
 * Queries each provider in parallel for better performance.
 */
export const useVideoModelsByProvider = (opts?: { task?: "text_to_video" | "image_to_video" }) => {
  const { providers, isLoading: providersLoading } = useVideoProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["video-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const { data, error } = await client.GET("/api/models/video/{provider}", {
          params: {
            path: {
              provider: providerValue as any
            }
          }
        });
        if (error) throw error;
        return {
          provider: providerValue,
          models: (data || []) as VideoModel[]
        };
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false
    }))
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  let allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  if (opts?.task) {
    const task = opts.task;
    allModels = allModels.filter((m) => !m.supported_tasks || m.supported_tasks.length === 0 || m.supported_tasks.includes(task as any));
  }

  return {
    models: allModels || [],
    isLoading,
    isFetching,
    error
  };
};

/**
 * Hook to fetch HuggingFace image models by delegating all hf.* typing to the backend.
 * When a modelType is provided, the typed HF endpoint is used directly; otherwise
 * we fall back to the generic image models filtered by provider.
 */
export const useHuggingFaceImageModelsByProvider = (opts?: {
  task?: "text_to_image" | "image_to_image";
  modelType?: string;
}) => {
  const baseData = useImageModelsByProvider(opts?.task ? { task: opts.task } : undefined);

  const query = useQuery({
    queryKey: ["hf-models", opts?.modelType ?? "none", opts?.task ?? "all"],
    enabled: !!opts?.modelType,
    queryFn: async () => {
      if (!opts?.modelType) {
        return [] as ImageModel[];
      }
      const models = await fetchHfModelsByType(opts.modelType, opts.task);
      return models.map((model) => convertUnifiedToImageModel(model));
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });

  const models = useMemo(() => {
    if (opts?.modelType) {
      return query.data || [];
    }
    const huggingFaceModels = baseData.models.filter((m) => {
      const provider = (m.provider || "").toLowerCase();
      return provider === "huggingface" || provider.startsWith("huggingface");
    });
    return huggingFaceModels;
  }, [opts?.modelType, query.data, baseData.models]);

  const isLoading = opts?.modelType ? query.isLoading : baseData.isLoading;
  const isFetching = opts?.modelType ? query.isFetching : baseData.isFetching;
  const error = opts?.modelType ? query.error : baseData.error;

  return {
    models: models || [],
    isLoading,
    isFetching,
    error
  };
};

const fetchHfModelsByType = async (
  modelType: string,
  task?: "text_to_image" | "image_to_image"
): Promise<UnifiedModel[]> => {
  const params = new URLSearchParams();
  if (task) {
    params.append("task", task);
  }

  const normalizedType = modelType.startsWith("hf.") ? modelType : `hf.${modelType}`;
  const encodedType = encodeURIComponent(normalizedType);
  const url = `${BASE_URL}/api/models/huggingface/type/${encodedType}${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch HuggingFace models for type ${normalizedType}: ${res.status} ${res.statusText} ${text}`
    );
  }
  return (await res.json()) as UnifiedModel[];
};

const convertUnifiedToImageModel = (model: UnifiedModel): ImageModel => {
  const providerId = "huggingface" as ImageModel["provider"];
  const pipelineTask = model.pipeline_tag
    ? model.pipeline_tag.replace(/-/g, "_")
    : undefined;

  return {
    type: "image_model",
    provider: providerId,
    id: model.id || model.repo_id || "",
    name: model.name || model.repo_id || model.id || "",
    path: model.path || undefined,
    supported_tasks: pipelineTask ? [pipelineTask as any] : []
  };
};
