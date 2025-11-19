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
 * Uses the Hugging Face search endpoint when a specific model type is requested.
 */
export const useHuggingFaceImageModelsByProvider = (opts?: {
  task?: "text_to_image" | "image_to_image";
  modelType?: string;
}) => {
  const baseData = useImageModelsByProvider(opts?.task ? { task: opts.task } : undefined);
  const searchData = useHuggingFaceModelSearch(opts);

  if (searchData.hasSearch && !searchData.error) {
    return {
      models: searchData.models,
      isLoading: searchData.isLoading,
      isFetching: searchData.isFetching,
      error: searchData.error
    };
  }

  const huggingFaceModels = baseData.models.filter((m) => {
    const provider = (m.provider || "").toLowerCase();
    return provider === "huggingface" || provider.startsWith("huggingface");
  });

  return {
    models: huggingFaceModels,
    isLoading: baseData.isLoading,
    isFetching: baseData.isFetching,
    error: searchData.error ?? baseData.error
  };
};

type HuggingFaceSearchConfig = {
  repo_pattern?: string[];
  filename_pattern?: string[];
  pipeline_tag?: string[];
  tag?: string[];
  author?: string[];
  library_name?: string;
};

const HF_DEFAULT_FILE_PATTERNS = [
  "*.safetensors",
  "*.ckpt",
  "*.gguf",
  "*.bin"
];

const HF_PTH_FILE_PATTERNS = ["*.pth", "*.pt"];

const HF_SEARCH_TYPE_CONFIG: Record<string, HuggingFaceSearchConfig> = {
  "hf.image_text_to_text": { pipeline_tag: ["image-to-text", "text-to-image"], tag: ["*image-text*"] },
  "hf.visual_question_answering": { pipeline_tag: ["visual-question-answering"], tag: ["*vqa*"] },
  "hf.minicpm": { tag: ["*minicpm*"] },
  "hf.gotocr": { tag: ["*ocr*", "*gotocr*"] },
  "hf.document_question_answering": { pipeline_tag: ["document-question-answering"], tag: ["*document-question-answering*"] },
  "hf.video_text_to_text": { pipeline_tag: ["text-to-video"], tag: ["*video-text*"] },
  "hf.computer_vision": { tag: ["*computer-vision*"] },
  "hf.depth_estimation": { pipeline_tag: ["depth-estimation"], tag: ["*depth*"] },
  "hf.image_classification": { pipeline_tag: ["image-classification"], tag: ["*image-classification*"] },
  "hf.object_detection": { pipeline_tag: ["object-detection"], tag: ["*object-detection*"] },
  "hf.image_segmentation": { pipeline_tag: ["image-segmentation"], tag: ["*segmentation*"] },
  "hf.text_to_image": { pipeline_tag: ["text-to-image"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.stable_diffusion": { pipeline_tag: ["text-to-image"], tag: ["*stable-diffusion*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.stable_diffusion_xl": { tag: ["diffusers:StableDiffusionXLPipeline", "*stable-diffusion-xl*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.stable_diffusion_xl_refiner": { tag: ["*refiner*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.stable_diffusion_3": { tag: ["*stable-diffusion-3*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.stable_diffusion_upscale": { tag: ["*upscale*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.flux": { tag: ["*flux*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.qwen_image": { tag: ["*qwen*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.qwen_image_edit": { pipeline_tag: ["image-to-image"], tag: ["*qwen*"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.controlnet": {
    repo_pattern: ["*control*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.controlnet_sdxl": {
    repo_pattern: ["*control*"],
    tag: ["*sdxl*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.controlnet_flux": {
    repo_pattern: ["*control*"],
    tag: ["*flux*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.ip_adapter": {
    repo_pattern: ["*IP-Adapter*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.style_model": { tag: ["*style*"] },
  "hf.lora_sd": { repo_pattern: ["*lora*"] },
  "hf.lora_sdxl": { repo_pattern: ["*lora*sdxl*", "*sdxl*lora*"] },
  "hf.lora_qwen_image": { repo_pattern: ["*lora*qwen*"] },
  "hf.image_to_text": { pipeline_tag: ["image-to-text"], tag: ["*caption*"] },
  "hf.image_to_image": { pipeline_tag: ["image-to-image"], filename_pattern: HF_DEFAULT_FILE_PATTERNS },
  "hf.inpainting": { pipeline_tag: ["image-inpainting"], tag: ["*inpaint*"] },
  "hf.outpainting": { tag: ["*outpaint*"] },
  "hf.image_to_video": { pipeline_tag: ["image-to-video"] },
  "hf.unconditional_image_generation": { pipeline_tag: ["unconditional-image-generation"], tag: ["*unconditional-image-generation*"] },
  "hf.unet": { repo_pattern: ["*unet*"], filename_pattern: ["*.safetensors", "*.bin"] },
  "hf.vae": { repo_pattern: ["*vae*"], filename_pattern: ["*.safetensors", "*.bin"] },
  "hf.clip": { tag: ["*clip*"] },
  "hf.clip_vision": { tag: ["*clip-vision*", "*vision-encoder*"] },
  "hf.video_classification": { pipeline_tag: ["video-classification"] },
  "hf.text_to_video": { pipeline_tag: ["text-to-video"] },
  "hf.zero_shot_image_classification": { pipeline_tag: ["zero-shot-image-classification"] },
  "hf.mask_generation": { pipeline_tag: ["mask-generation"] },
  "hf.zero_shot_object_detection": { pipeline_tag: ["zero-shot-object-detection"] },
  "hf.text_to_3d": { pipeline_tag: ["text-to-3d"] },
  "hf.image_to_3d": { pipeline_tag: ["image-to-3d"] },
  "hf.image_feature_extraction": { pipeline_tag: ["image-feature-extraction"] },
  "hf.natural_language_processing": { tag: ["*nlp*"] },
  "hf.text_classification": { pipeline_tag: ["text-classification"] },
  "hf.token_classification": { pipeline_tag: ["token-classification"] },
  "hf.table_question_answering": { pipeline_tag: ["table-question-answering"] },
  "hf.question_answering": { pipeline_tag: ["question-answering"] },
  "hf.zero_shot_classification": { pipeline_tag: ["zero-shot-classification"] },
  "hf.translation": { pipeline_tag: ["translation"] },
  "hf.summarization": { pipeline_tag: ["summarization"] },
  "hf.feature_extraction": { pipeline_tag: ["feature-extraction"] },
  "hf.text_generation": { pipeline_tag: ["text-generation"] },
  "hf.text2text_generation": { pipeline_tag: ["text2text-generation"] },
  "hf.fill_mask": { pipeline_tag: ["fill-mask"] },
  "hf.sentence_similarity": { pipeline_tag: ["sentence-similarity"] },
  "hf.reranker": { pipeline_tag: ["text-classification"], tag: ["*rerank*"] },
  "hf.text_to_speech": {
    pipeline_tag: ["text-to-speech"],
  },
  "hf.text_to_audio": { pipeline_tag: ["text-to-audio"] },
  "hf.automatic_speech_recognition": { pipeline_tag: ["automatic-speech-recognition"] },
  "hf.audio_to_audio": { pipeline_tag: ["audio-to-audio"] },
  "hf.audio_classification": { pipeline_tag: ["audio-classification"] },
  "hf.zero_shot_audio_classification": { pipeline_tag: ["zero-shot-audio-classification"] },
  "hf.real_esrgan": {
    tag: ["*esrgan*"],
    filename_pattern: HF_PTH_FILE_PATTERNS
  },
  "hf.voice_activity_detection": { pipeline_tag: ["voice-activity-detection"] },
  "hf.depth_generation": { pipeline_tag: ["depth-estimation"], tag: ["*depth*", "*depth-generation*"] },
  "hf.redux_generation": { tag: ["*redux*", "*reduction*"] }
};

const HF_FILE_PATTERN_TYPES = new Set(
  [
    "hf.text_to_image",
    "hf.image_to_image",
    "hf.stable_diffusion",
    "hf.stable_diffusion_xl",
    "hf.stable_diffusion_xl_refiner",
    "hf.stable_diffusion_3",
    "hf.flux",
    "hf.qwen_image",
    "hf.qwen_image_edit",
    "hf.controlnet",
    "hf.controlnet_sdxl",
    "hf.controlnet_flux",
    "hf.ip_adapter",
    "hf.lora_sd",
    "hf.lora_sdxl",
    "hf.lora_qwen_image",
    "hf.inpainting",
    "hf.outpainting",
    "hf.vae",
    "hf.unet",
    "hf.image_to_video",
    "hf.text_to_video",
    "hf.text_to_speech",
    "hf.text_to_text",
    "hf.image_to_text",
    "hf.text_to_audio",
    "hf.text_generation",
    "hf.sentence_similarity"
  ].map((value) => value.toLowerCase())
);

const HF_TYPE_KEYWORD_MATCHERS: Record<string, string[]> = {
  "hf.stable_diffusion": ["stable-diffusion", "sd15"],
  "hf.stable_diffusion_xl": ["sdxl", "stable-diffusion-xl"],
  "hf.stable_diffusion_xl_refiner": ["refiner", "sdxl"],
  "hf.stable_diffusion_3": ["sd3", "stable-diffusion-3"],
  "hf.flux": ["flux"],
  "hf.qwen_image": ["qwen"],
  "hf.qwen_image_edit": ["qwen"],
  "hf.controlnet": ["control"],
  "hf.controlnet_sdxl": ["control", "sdxl"],
  "hf.controlnet_flux": ["control", "flux"],
  "hf.ip_adapter": ["ip-adapter"],
  "hf.lora_sd": ["lora"],
  "hf.lora_sdxl": ["lora", "sdxl"],
  "hf.lora_qwen_image": ["lora", "qwen"],
  "hf.vae": ["vae"],
  "hf.unet": ["unet"]
};

/**
 * Internal hook responsible for translating `hf.*` model types
 * into calls to `/api/models/huggingface/search`.  Mirrors the backend
 * discovery flow (see `nodetool-core/.../huggingface_models.py`) so that the UI
 * can surface SD, Flux, Qwen, ControlNet, IP-Adapter, etc. consistently.
 * 
 * Steps:
 * 1. Map model type to repo/pipeline/file heuristics (see HF_SEARCH_TYPE_CONFIG).
 * 2. Serialize those heuristics into query params for the search endpoint.
 * 3. Fetch the resulting `UnifiedModel` entries and coerce them into ImageModels.
 * 4. Filter unsafe matches unless the backend returned a concrete `hf.*` type.
 */
const useHuggingFaceModelSearch = (opts?: {
  task?: "text_to_image" | "image_to_image";
  modelType?: string;
}) => {
  const searchConfig = useMemo(
    () => buildSearchConfigForType(opts?.modelType, opts?.task),
    [opts?.modelType, opts?.task]
  );
  const normalizedConfig = useMemo(
    () => (searchConfig ? normalizeSearchConfig(searchConfig) : null),
    [searchConfig]
  );
  const configKey = useMemo(
    () => (normalizedConfig ? stringifySearchConfig(normalizedConfig) : "none"),
    [normalizedConfig]
  );

  const query = useQuery({
    queryKey: ["hf-model-search", opts?.modelType ?? "all", opts?.task ?? "all", configKey],
    enabled: !!normalizedConfig,
    queryFn: async () => fetchHfModelsBySearch(normalizedConfig!),
    staleTime: 0,
    cacheTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });

  const models = useMemo(() => {
    if (!query.data) {
      return [] as ImageModel[];
    }
    const filtered = query.data.filter((model) => matchesModelType(model, opts?.modelType));
    return filtered.map((model) => convertUnifiedToImageModel(model));
  }, [query.data, opts?.modelType]);

  return {
    hasSearch: !!normalizedConfig,
    models,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error
  };
};

const buildSearchConfigForType = (
  modelType?: string,
  task?: "text_to_image" | "image_to_image"
): HuggingFaceSearchConfig | null => {
  const normalizedType = modelType?.toLowerCase();
  const baseConfig = normalizedType ? HF_SEARCH_TYPE_CONFIG[normalizedType] : undefined;
  if (!baseConfig && !task) {
    return null;
  }
  const config: HuggingFaceSearchConfig = {};

  if (baseConfig?.repo_pattern) {
    config.repo_pattern = [...baseConfig.repo_pattern];
  }
  if (baseConfig?.filename_pattern) {
    config.filename_pattern = [...baseConfig.filename_pattern];
  }
  if (baseConfig?.pipeline_tag) {
    config.pipeline_tag = [...baseConfig.pipeline_tag];
  }
  if (baseConfig?.tag) {
    config.tag = [...baseConfig.tag];
  }
  if (baseConfig?.author) {
    config.author = [...baseConfig.author];
  }
  if (baseConfig?.library_name) {
    config.library_name = baseConfig.library_name;
  }

  if (!config.pipeline_tag) {
    const derivedPipeline = derivePipelineTag(normalizedType, task);
    if (derivedPipeline) {
      config.pipeline_tag = Array.isArray(derivedPipeline)
        ? derivedPipeline
        : [derivedPipeline];
    }
  }

  if (
    !config.filename_pattern &&
    normalizedType &&
    HF_FILE_PATTERN_TYPES.has(normalizedType)
  ) {
    config.filename_pattern = [...HF_DEFAULT_FILE_PATTERNS];
  }

  return Object.keys(config).length > 0 ? config : null;
};

const derivePipelineTag = (
  normalizedType?: string,
  task?: "text_to_image" | "image_to_image"
): string | null => {
  if (task) {
    return task.replace(/_/g, "-");
  }
  if (!normalizedType) {
    return null;
  }
  const slug = normalizedType.startsWith("hf.") ? normalizedType.slice(3) : normalizedType;
  switch (slug) {
    case "stable_diffusion":
    case "stable_diffusion_xl":
    case "stable_diffusion_xl_refiner":
    case "stable_diffusion_3":
    case "flux":
    case "qwen_image":
    case "ip_adapter":
      return "text-to-image";
    case "qwen_image_edit":
    case "image_to_image":
    case "inpainting":
    case "outpainting":
      return "image-to-image";
    case "text_to_video":
      return "text-to-video";
    case "image_to_video":
      return "image-to-video";
    default:
      if (slug.includes("text_to_image")) {
        return "text-to-image";
      }
      if (slug.includes("image_to_image")) {
        return "image-to-image";
      }
      return slug.replace(/_/g, "-");
  }
};

const normalizeSearchConfig = (
  config: HuggingFaceSearchConfig
): HuggingFaceSearchConfig => {
  const normalized: HuggingFaceSearchConfig = {};
  if (config.repo_pattern) {
    normalized.repo_pattern = [...config.repo_pattern];
  }
  if (config.filename_pattern) {
    normalized.filename_pattern = [...config.filename_pattern];
  }
  if (config.pipeline_tag) {
    normalized.pipeline_tag = config.pipeline_tag.map((value) => value.toLowerCase());
  }
  if (config.tag) {
    normalized.tag = config.tag.map((value) => value.toLowerCase());
  }
  if (config.author) {
    normalized.author = config.author.map((value) => value.toLowerCase());
  }
  if (config.library_name) {
    normalized.library_name = config.library_name.toLowerCase();
  }
  return normalized;
};

const stringifySearchConfig = (config: HuggingFaceSearchConfig): string => {
  const entries = Object.entries(config).map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, [...value].sort()] as [string, string[]];
    }
    return [key, value] as [string, string | undefined];
  });
  const sortedEntries = entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(sortedEntries));
};

const fetchHfModelsBySearch = async (
  config: HuggingFaceSearchConfig
): Promise<UnifiedModel[]> => {
  const params = new URLSearchParams();

  (config.repo_pattern || []).forEach((value) => params.append("repo_pattern", value));
  (config.filename_pattern || []).forEach((value) =>
    params.append("filename_pattern", value)
  );
  (config.pipeline_tag || []).forEach((value) =>
    params.append("pipeline_tag", value.toLowerCase())
  );
  (config.tag || []).forEach((value) => params.append("tag", value.toLowerCase()));
  (config.author || []).forEach((value) => params.append("author", value.toLowerCase()));
  if (config.library_name) {
    params.append("library_name", config.library_name.toLowerCase());
  }

  const queryString = params.toString();
  const url = `${BASE_URL}/api/models/huggingface/search${queryString ? `?${queryString}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to search HuggingFace models: ${res.status} ${res.statusText} ${text}`
    );
  }
  return (await res.json()) as UnifiedModel[];
};

const GENERIC_HF_TYPES = new Set([
  "hf.text_to_image",
  "hf.image_to_image",
  "hf.model",
  "hf.model_generic"
]);

const matchesModelType = (model: UnifiedModel, modelType?: string): boolean => {
  if (!modelType) {
    return true;
  }
  const normalizedType = modelType.toLowerCase();
  const modelTypeLower = (model.type || "").toLowerCase();
  if (modelTypeLower) {
    if (modelTypeLower === normalizedType) {
      return true;
    }
    if (!GENERIC_HF_TYPES.has(modelTypeLower)) {
      return false;
    }
  }
  const tags = (model.tags || []).map((tag) => (tag || "").toLowerCase());
  const repoId = (model.repo_id || "").toLowerCase();
  const keywords = HF_TYPE_KEYWORD_MATCHERS[normalizedType];
  if (keywords) {
    if (
      keywords.some(
        (keyword) => repoId.includes(keyword) || tags.some((tag) => tag.includes(keyword))
      )
    ) {
      return true;
    }
  }
  const derivedPipeline = derivePipelineTag(normalizedType);
  if (derivedPipeline && model.pipeline_tag === derivedPipeline) {
    return true;
  }
  return false;
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
