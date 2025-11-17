import { useQueries } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type { LanguageModel, ImageModel, TTSModel, ASRModel, VideoModel } from "../stores/ApiTypes";
import {
  useLanguageModelProviders,
  useImageModelProviders,
  useTTSProviders,
  useASRProviders,
  useVideoProviders
} from "./useProviders";

/**
 * Hook to fetch language models from all providers that support language models.
 * Queries each provider in parallel for better performance.
 */
export const useLanguageModelsByProvider = () => {
  const { providers, isLoading: providersLoading } = useLanguageModelProviders();

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
    error
  };
};

/**
 * Hook to fetch image models from all providers that support image generation.
 * Queries each provider in parallel for better performance.
 * 
 * Note: Always includes MLX provider even if it's not in the providers list,
 * as MLX models can be discovered from cache even if the provider isn't fully installed.
 */
export const useImageModelsByProvider = (opts?: { task?: "text_to_image" | "image_to_image" }) => {
  const { providers, isLoading: providersLoading, error: providersError } = useImageModelProviders();

  // Ensure MLX is always queried, even if not in providers list
  const mlxInProviders = providers.some((p) => p.provider === "mlx");
  const providersToQuery = mlxInProviders 
    ? providers 
    : [...providers, { provider: "mlx" as const, capabilities: ["text_to_image"] }];

  const queries = useQueries({
    queries: providersToQuery.length > 0 ? providersToQuery.map((provider) => ({
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
      enabled: !providersLoading && providersToQuery.length > 0,
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

  // Debug logging
  if (process.env.NODE_ENV === "development") {
    const successfulQueries = queries.filter((q) => q.data && !q.error);
    const failedQueries = queries.filter((q) => q.error);
    const modelsByProvider = successfulQueries.reduce((acc, q) => {
      const provider = q.data!.provider;
      acc[provider] = q.data!.models.length;
      return acc;
    }, {} as Record<string, number>);
    
    console.log("useImageModelsByProvider:", {
      providersCount: providers.length,
      providersLoading,
      providersError,
      queriesCount: queries.length,
      successfulQueries: successfulQueries.length,
      failedQueries: failedQueries.length,
      isLoading,
      modelsCount: allModels.length,
      modelsByProvider,
      errors: failedQueries.map((q) => ({ 
        provider: q.data?.provider || "unknown", 
        error: q.error 
      }))
    });
  }

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
 * Hook to fetch HuggingFace image models by filtering ImageModel results.
 * This filters models to only include HuggingFace providers.
 */
export const useHuggingFaceImageModelsByProvider = (opts?: { task?: "text_to_image" | "image_to_image" }) => {
  const { models, isLoading, isFetching, error } = useImageModelsByProvider(opts);
  
  // Filter to only HuggingFace providers
  const huggingFaceModels = models.filter((m) => {
    const provider = (m.provider || "").toLowerCase();
    return provider === "huggingface" || provider.startsWith("huggingface");
  });

  return {
    models: huggingFaceModels,
    isLoading,
    isFetching,
    error
  };
};
