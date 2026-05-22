import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import type {
  LanguageModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  UnifiedModel
} from "../stores/ApiTypes";
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
 * Backend contract (tRPC models router):
 * - trpc.models.llmByProvider({ provider })     → LanguageModel[]
 * - trpc.models.imageByProvider({ provider })   → ImageModel[]
 * - trpc.models.ttsByProvider({ provider })     → TTSModel[]
 * - trpc.models.asrByProvider({ provider })     → ASRModel[]
 * - trpc.models.videoByProvider({ provider })   → VideoModel[]
 * - trpc.models.huggingfaceByType({ model_type }) → UnifiedModel[] filtered by hf.* type
 *
 * Providers are enumerated via use*Providers hooks and fanned out into parallel
 * queries to minimize latency. Each hook returns aggregated models along with
 * loading/fetching/error state so pages can render incremental results safely.
 */

export interface ModelsByProviderResult<T> {
  models: T[];
  providers: string[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null | undefined;
  refetch: () => Promise<void>;
}

export interface LanguageModelsByProviderResult extends ModelsByProviderResult<LanguageModel> {
  providerErrors: Array<{ provider: string; error: unknown }>;
  loadingProgress: { total: number; loaded: number; loading: number };
  allowedProviders: string[] | undefined;
}

/**
 * Hook to fetch language models from all providers that support language models.
 * Queries each provider in parallel for better performance.
 */
export const useLanguageModelsByProvider = (options?: {
  allowedProviders?: string[];
  /**
   * When true, drop models whose `supports_tools` is explicitly `false`.
   * Models with `supports_tools` unset/null are kept (unknown is assumed
   * to support tools — matches the BaseProvider default).
   */
  requireToolSupport?: boolean;
}): LanguageModelsByProviderResult => {
  const { providers: allProviders, isLoading: providersLoading } =
    useLanguageModelProviders();

  const providers = useMemo(() => {
    if (!options?.allowedProviders) {return allProviders;}
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
        const data = await trpc.models.llmByProvider.query({ provider: providerValue });
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

  const aggregatedLanguageModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  const allModels = options?.requireToolSupport
    ? aggregatedLanguageModels.filter((m) => m.supports_tools !== false)
    : aggregatedLanguageModels;

  // Track per-provider errors for debugging feedback
  const providerErrors = useMemo(() => {
    const errors: Array<{ provider: string; error: unknown }> = [];
    queries.forEach((q, idx) => {
      if (q.error && providers[idx]) {
        errors.push({
          provider: providers[idx].provider,
          error: q.error
        });
      }
    });
    return errors;
  }, [queries, providers]);

  // Track loading progress
  const loadingProgress = useMemo(() => {
    const total = providers.length;
    const loaded = queries.filter((q) => q.data || q.error).length;
    const loading = queries.filter((q) => q.isLoading).length;
    return { total, loaded, loading };
  }, [providers.length, queries]);

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    providerErrors,
    loadingProgress,
    allowedProviders: options?.allowedProviders,
    refetch
  };
};

/**
 * Hook to fetch image models from all providers that support image generation.
 * Queries each provider in parallel for better performance.
 */
export type ImageModelTask =
  | "text_to_image"
  | "image_to_image"
  | "upscale"
  | "remove_background"
  | "relight"
  | "vectorize";

export type VideoModelTask =
  | "text_to_video"
  | "image_to_video"
  | "video_to_video"
  | "lip_sync";

/**
 * Specialized editing tasks. These are reliably detectable and mutually
 * exclusive, so filtering is strict: only models that explicitly declare the
 * task qualify. A model with no tasks never matches a specialized picker.
 */
const STRICT_MODEL_TASKS = new Set<string>([
  "upscale",
  "remove_background",
  "relight",
  "vectorize",
  "video_to_video",
  "lip_sync"
]);

const modelMatchesTask = (
  supportedTasks: string[] | null | undefined,
  task: string
): boolean => {
  const has = (supportedTasks?.length ?? 0) > 0;
  if (STRICT_MODEL_TASKS.has(task)) {
    return has && supportedTasks!.includes(task);
  }
  // Generation tasks (text_to_*/image_to_*): FAL/Replicate generators are
  // tagged with both, so they filter strictly. The untagged-passes branch is a
  // fallback only for providers that emit no tasks (e.g. HuggingFace models
  // without a pipeline tag), so they don't vanish from the generation pickers.
  return !has || supportedTasks!.includes(task);
};

export const useImageModelsByProvider = (opts?: { task?: ImageModelTask }): ModelsByProviderResult<ImageModel> => {
  const { providers, isLoading: providersLoading, error: providersError } = useImageModelProviders();

  const queries = useQueries({
    queries: providers.length > 0 ? providers.map((provider) => ({
      queryKey: ["image-models", provider.provider],
      queryFn: async () => {
        try {
          const providerValue = provider.provider;
          const data = await trpc.models.imageByProvider.query({ provider: providerValue });
          return {
            provider: providerValue,
            models: (data || []) as ImageModel[]
          };
        } catch {
          // Return empty array for this provider instead of failing completely
          return {
            provider: provider.provider,
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

  // Filter by supported task. Lenient for generation tasks (untagged models
  // pass); strict for specialized editing tasks (see STRICT_MODEL_TASKS).
  if (opts?.task) {
    const task = opts.task;
    allModels = allModels.filter((m) => modelMatchesTask(m.supported_tasks, task));
  }

  // Debug logging removed

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    refetch
  };
};

/**
 * Hook to fetch TTS models from all providers that support text-to-speech.
 * Queries each provider in parallel for better performance.
 */
export const useTTSModelsByProvider = (): ModelsByProviderResult<TTSModel> => {
  const { providers, isLoading: providersLoading } = useTTSProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["tts-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const data = await trpc.models.ttsByProvider.query({ provider: providerValue });
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

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    refetch
  };
};

/**
 * Hook to fetch ASR models from all providers that support automatic speech recognition.
 * Queries each provider in parallel for better performance.
 */
export const useASRModelsByProvider = (): ModelsByProviderResult<ASRModel> => {
  const { providers, isLoading: providersLoading } = useASRProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["asr-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const data = await trpc.models.asrByProvider.query({ provider: providerValue });
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

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    refetch
  };
};

/**
 * Hook to fetch video models from all providers that support video generation.
 * Queries each provider in parallel for better performance.
 */
export const useVideoModelsByProvider = (opts?: { task?: VideoModelTask }): ModelsByProviderResult<VideoModel> => {
  const { providers, isLoading: providersLoading } = useVideoProviders();

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["video-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const data = await trpc.models.videoByProvider.query({ provider: providerValue });
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
    allModels = allModels.filter((m) => modelMatchesTask(m.supported_tasks, task));
  }

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    refetch
  };
};

/**
 * Hook to fetch HuggingFace image models by delegating all hf.* typing to the backend.
 * When a modelType is provided, the typed HF endpoint is used directly; otherwise
 * we fall back to the generic image models filtered by provider.
 */
export const useHuggingFaceImageModelsByProvider = (opts?: {
  task?: ImageModelTask;
  modelType?: string;
}): ModelsByProviderResult<ImageModel> => {
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
  const refetch = useMemo(
    () => async () => {
      if (opts?.modelType) {
        await query.refetch();
        return;
      }
      await baseData.refetch();
    },
    [opts?.modelType, query, baseData]
  );

  return {
    models: models || [],
    providers: baseData.providers ?? [],
    isLoading,
    isFetching,
    error,
    refetch
  };
};

const fetchHfModelsByType = async (
  modelType: string,
  _task?: ImageModelTask
): Promise<UnifiedModel[]> => {
  const normalizedType = modelType.startsWith("hf.") ? modelType : `hf.${modelType}`;
  return trpc.models.huggingfaceByType.query({ model_type: normalizedType }) as Promise<UnifiedModel[]>;
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
    supported_tasks: pipelineTask ? [pipelineTask] : []
  };
};

/**
 * Hook to fetch Transformers.js models for a given `tjs.<task>` type.
 *
 * The backend merges the curated recommended list with anything cached locally
 * in the Transformers.js cache directory. Recommended-but-uncached entries are
 * returned with `downloaded: false` so the picker can show them as
 * downloadable.
 */
export const useTransformersJsModelsByType = (opts?: {
  modelType?: string;
}): ModelsByProviderResult<ImageModel> => {
  const query = useQuery({
    queryKey: ["tjs-models", opts?.modelType ?? "none"],
    enabled: !!opts?.modelType,
    queryFn: async () => {
      if (!opts?.modelType) return [] as ImageModel[];
      const models = (await trpc.models.transformersJsByType.query({
        model_type: opts.modelType
      })) as UnifiedModel[];
      return models.map(convertUnifiedToTransformersJsModel);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });

  const refetch = useMemo(
    () => async () => {
      await query.refetch();
    },
    [query]
  );

  return {
    models: query.data ?? [],
    providers: ["transformers_js"],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch
  };
};

const convertUnifiedToTransformersJsModel = (
  model: UnifiedModel
): ImageModel => {
  // Preserve `downloaded` / `size_on_disk` past the conversion — the picker
  // filters by `downloaded === true` and these fields don't live on the
  // ImageModel interface, so we widen via cast.
  return {
    type: "image_model",
    provider: "transformers_js" as ImageModel["provider"],
    id: model.id || model.repo_id || "",
    name: model.name || model.repo_id || model.id || "",
    path: model.path || undefined,
    supported_tasks: [],
    downloaded: model.downloaded ?? false,
    size_on_disk: model.size_on_disk ?? null
  } as ImageModel;
};
