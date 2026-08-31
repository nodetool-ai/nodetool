import { useCallback, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import type {
  LanguageModel,
  ImageModel,
  TTSModel,
  ASRModel,
  MusicModel,
  VideoModel,
  ProviderInfo,
  UnifiedModel
} from "../stores/ApiTypes";
import {
  useLanguageModelProviders,
  useImageModelProviders,
  useTTSProviders,
  useASRProviders,
  useMusicProviders,
  useVideoProviders
} from "./useProviders";
import { useWorkers } from "./useWorkers";

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

interface ProviderModels<T> {
  provider: string;
  models: T[];
}

interface AggregatedProviderModels<T> {
  models: T[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null | undefined;
  providerErrors: Array<{ provider: string; error: unknown }>;
  loadingProgress: { total: number; loaded: number; loading: number };
  refetch: () => Promise<void>;
}

/**
 * How long a provider's model list stays fresh. Exported so the per-node
 * constraint hooks (`useMediaModelConstraints`) can register a query that
 * shares these cache entries exactly rather than fighting them over staleness.
 */
export const MODEL_STALE_TIME = 5 * 60 * 1000;

/**
 * Fan one per-provider fetch out across `providers` and flatten the results.
 *
 * The flattening must live in `combine`, not in a `useMemo` over the returned
 * results array: that array is rebuilt every render, so a `useMemo` keyed on it
 * never hits. `combine` is cached against the underlying query results, so
 * `models` keeps a stable identity until a provider's models change.
 */
export const useAggregatedProviderModels = <T>(
  providers: ProviderInfo[],
  providersLoading: boolean,
  queryKeyPrefix: string,
  fetchModels: (provider: string) => Promise<T[]>
): AggregatedProviderModels<T> => {
  const combine = useCallback(
    (
      results: Array<UseQueryResult<ProviderModels<T>, Error>>
    ): AggregatedProviderModels<T> => {
      const models: T[] = [];
      const providerErrors: Array<{ provider: string; error: unknown }> = [];
      let loaded = 0;
      let loading = 0;
      let isFetching = false;
      let error: Error | null | undefined;
      results.forEach((result, index) => {
        if (result.data) {
          for (const model of result.data.models) {
            models.push(model);
          }
        }
        if (result.error) {
          error ??= result.error;
          const provider = providers[index]?.provider;
          if (provider) {
            providerErrors.push({ provider, error: result.error });
          }
        }
        if (result.data || result.error) {
          loaded += 1;
        }
        if (result.isLoading) {
          loading += 1;
        }
        if (result.isFetching) {
          isFetching = true;
        }
      });
      return {
        models,
        isLoading: loading > 0,
        isFetching,
        error,
        providerErrors,
        loadingProgress: { total: providers.length, loaded, loading },
        refetch: async () => {
          await Promise.all(results.map((result) => result.refetch()));
        }
      };
    },
    [providers]
  );

  const queries = useMemo(
    () =>
      providers.map((provider) => ({
        queryKey: [queryKeyPrefix, provider.provider],
        queryFn: async (): Promise<ProviderModels<T>> => ({
          provider: provider.provider,
          models: await fetchModels(provider.provider)
        }),
        enabled: !providersLoading && providers.length > 0,
        staleTime: MODEL_STALE_TIME,
        refetchOnWindowFocus: false
      })),
    [providers, providersLoading, queryKeyPrefix, fetchModels]
  );

  return useQueries({ queries, combine });
};

interface LanguageModelsByProviderResult extends ModelsByProviderResult<LanguageModel> {
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

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.llmByProvider.query({ provider })) ||
        []) as LanguageModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "language-models",
    fetchModels
  );

  const requireToolSupport = options?.requireToolSupport;
  const allModels = useMemo(
    () =>
      requireToolSupport
        ? aggregated.models.filter((m) => m.supports_tools !== false)
        : aggregated.models,
    [aggregated.models, requireToolSupport]
  );

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: allModels,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: aggregated.error,
    providerErrors: aggregated.providerErrors,
    loadingProgress: aggregated.loadingProgress,
    allowedProviders: options?.allowedProviders,
    refetch: aggregated.refetch
  };
};

/**
 * Hook to fetch image models from all providers that support image generation.
 * Queries each provider in parallel for better performance.
 */
export type ImageModelTask =
  | "text_to_image"
  | "image_to_image"
  | "inpainting"
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
  "inpainting",
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
  if (!supportedTasks || supportedTasks.length === 0) {
    // No tasks declared — strict tasks never match, generation tasks pass through
    return !STRICT_MODEL_TASKS.has(task);
  }
  return supportedTasks.includes(task);
};

export const useImageModelsByProvider = (opts?: { task?: ImageModelTask | ImageModelTask[] }): ModelsByProviderResult<ImageModel> => {
  const { providers, isLoading: providersLoading, error: providersError } = useImageModelProviders();

  const fetchModels = useCallback(async (provider: string) => {
    try {
      return ((await trpc.models.imageByProvider.query({ provider })) ||
        []) as ImageModel[];
    } catch {
      // Return empty array for this provider instead of failing completely
      return [] as ImageModel[];
    }
  }, []);

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "image-models",
    fetchModels
  );

  const task = opts?.task;
  // Key by content so an inline task array doesn't recompute every render.
  const taskKey = Array.isArray(task) ? task.join(",") : task;
  const allModels = useMemo(() => {
    if (!taskKey) {
      return aggregated.models;
    }
    const tasks = taskKey.split(",");
    return aggregated.models.filter((m) =>
      tasks.some((t) => modelMatchesTask(m.supported_tasks, t))
    );
  }, [aggregated.models, taskKey]);

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: allModels,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: providersError || aggregated.error,
    refetch: aggregated.refetch
  };
};

/**
 * Hook to fetch per-model media options (aspect ratios, resolutions, durations)
 * for a given provider/model. Runs only once both provider and model are known.
 * The result shape ({ aspectRatios, resolutions, durations }) is inferred from
 * the `models.mediaOptions` tRPC procedure.
 */
export const useMediaOptions = (opts: {
  provider?: string | null;
  model?: string | null;
  task: "image" | "video";
}) =>
  useQuery({
    queryKey: ["media-options", opts.task, opts.provider ?? null, opts.model ?? null],
    queryFn: () =>
      trpc.models.mediaOptions.query({
        provider: opts.provider as string,
        model: opts.model as string,
        task: opts.task
      }),
    enabled: Boolean(opts.provider) && Boolean(opts.model),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

/**
 * Hook to fetch TTS models from all providers that support text-to-speech.
 * Queries each provider in parallel for better performance.
 */
export const useTTSModelsByProvider = (): ModelsByProviderResult<TTSModel> => {
  const { providers, isLoading: providersLoading } = useTTSProviders();

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.ttsByProvider.query({ provider })) ||
        []) as TTSModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "tts-models",
    fetchModels
  );

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: aggregated.models,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: aggregated.error,
    refetch: aggregated.refetch
  };
};

/**
 * Hook to fetch ASR models from all providers that support automatic speech recognition.
 * Queries each provider in parallel for better performance.
 */
export const useASRModelsByProvider = (): ModelsByProviderResult<ASRModel> => {
  const { providers, isLoading: providersLoading } = useASRProviders();

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.asrByProvider.query({ provider })) ||
        []) as ASRModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "asr-models",
    fetchModels
  );

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: aggregated.models,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: aggregated.error,
    refetch: aggregated.refetch
  };
};

/**
 * Hook to fetch music models from all providers that support music generation.
 * Queries each provider in parallel for better performance.
 */
export const useMusicModelsByProvider = (): ModelsByProviderResult<MusicModel> => {
  const { providers, isLoading: providersLoading } = useMusicProviders();

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.musicByProvider.query({ provider })) ||
        []) as MusicModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "music-models",
    fetchModels
  );

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: aggregated.models,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: aggregated.error,
    refetch: aggregated.refetch
  };
};

/**
 * Hook to fetch video models from all providers that support video generation.
 * Queries each provider in parallel for better performance.
 */
export const useVideoModelsByProvider = (opts?: { task?: VideoModelTask }): ModelsByProviderResult<VideoModel> => {
  const { providers, isLoading: providersLoading } = useVideoProviders();

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.videoByProvider.query({ provider })) ||
        []) as VideoModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "video-models",
    fetchModels
  );

  const videoTask = opts?.task;
  const allModels = useMemo(
    () =>
      videoTask
        ? aggregated.models.filter((m) =>
            modelMatchesTask(m.supported_tasks, videoTask)
          )
        : aggregated.models,
    [aggregated.models, videoTask]
  );

  const providerNames = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  return {
    models: allModels,
    providers: providerNames,
    isLoading: providersLoading || aggregated.isLoading,
    isFetching: aggregated.isFetching,
    error: aggregated.error,
    refetch: aggregated.refetch
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

  // With a worker attached, nodes run on the worker, so the relevant cache
  // (and the dialog's model list) is the worker's — query that instead of
  // the local HF cache.
  const { activeWorker } = useWorkers();
  const scope = activeWorker ? ("worker" as const) : ("local" as const);

  const query = useQuery({
    queryKey: ["hf-models", opts?.modelType ?? "none", opts?.task ?? "all", scope],
    enabled: !!opts?.modelType,
    queryFn: async () => {
      if (!opts?.modelType) {
        return [] as ImageModel[];
      }
      const models = await fetchHfModelsByType(opts.modelType, scope);
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

  // Derive providers from the already-filtered HF models so the sidebar
  // never shows unrelated API providers (Fal.ai, Gemini, etc.).
  const providers = useMemo(() => {
    const seen = new Set<string>();
    for (const m of models) {
      const p = m.provider ?? "";
      if (p) seen.add(p);
    }
    return Array.from(seen);
  }, [models]);

  return {
    models: models || [],
    providers,
    isLoading,
    isFetching,
    error,
    refetch
  };
};

const fetchHfModelsByType = async (
  modelType: string,
  scope: "local" | "worker" = "local"
): Promise<UnifiedModel[]> => {
  const normalizedType = modelType.startsWith("hf.") ? modelType : `hf.${modelType}`;
  return trpc.models.huggingfaceByType.query({
    model_type: normalizedType,
    scope
  }) as Promise<UnifiedModel[]>;
};

const convertUnifiedToImageModel = (model: UnifiedModel): ImageModel => {
  const providerId: ImageModel["provider"] = "huggingface";
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
    provider: "transformers_js",
    id: model.id || model.repo_id || "",
    name: model.name || model.repo_id || model.id || "",
    path: model.path || undefined,
    supported_tasks: [],
    downloaded: model.downloaded ?? false,
    size_on_disk: model.size_on_disk ?? null
  } as ImageModel;
};
