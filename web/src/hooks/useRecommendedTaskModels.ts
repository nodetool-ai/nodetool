import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import type { ImageModel, LanguageModel, TTSModel, ASRModel, UnifiedModel, Provider } from "../stores/ApiTypes";

/**
 * Task type for model recommendations.
 */
type TaskType = "image" | "language" | "tts" | "asr";

/**
 * Infers the model provider from the unified model type and tags.
 * 
 * @param m - The unified model to analyze
 * @returns The provider identifier string
 */
const inferProvider = (m: UnifiedModel): string => {
  const t = (m.type || "").toLowerCase();
  const tags = (m.tags || []).map((x) => (x || "").toLowerCase());
  if (t === "mlx" || tags.includes("mlx") || tags.includes("mflux")) {return "mlx";}
  if (t.startsWith("hf.")) {return "huggingface";}
  if (t === "llama_cpp") {return "llama_cpp";}
  if (t === "vllm") {return "vllm";}
  return "huggingface";
};

/**
 * Maps a unified model to an ImageModel type.
 * 
 * @param u - The unified model to map
 * @returns ImageModel with inferred provider
 */
const mapUnifiedToImageModel = (u: UnifiedModel): ImageModel => ({
  type: "image_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as Provider,
});

/**
 * Maps a unified model to a LanguageModel type.
 * 
 * @param u - The unified model to map
 * @returns LanguageModel with inferred provider
 */
const mapUnifiedToLanguageModel = (u: UnifiedModel): LanguageModel => ({
  type: "language_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as Provider,
});

/**
 * Maps a unified model to an ASRModel type.
 * 
 * @param u - The unified model to map
 * @returns ASRModel with inferred provider
 */
const mapUnifiedToASRModel = (u: UnifiedModel): ASRModel => ({
  type: "asr_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as Provider,
});

/**
 * Maps a unified model to a TTSModel type.
 * 
 * @param u - The unified model to map
 * @returns TTSModel with inferred provider
 */
const mapUnifiedToTTSModel = (u: UnifiedModel): TTSModel => ({
  type: "tts_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as Provider,
  voices: [],
  selected_voice: "",
});

/**
 * Fetches recommended models for a specific task type from the server.
 * 
 * This hook retrieves curated model recommendations based on the task type,
 * mapping them to the appropriate NodeTool model format with inferred providers.
 * 
 * @param task - The task type for which to fetch recommended models
 * @returns Query result containing an array of recommended models for the task
 * 
 * @example
 * ```typescript
 * const { data: imageModels, isLoading } = useRecommendedTaskModels("image");
 * 
 * if (isLoading) return <Loading />;
 * return <ModelSelector models={imageModels} />;
 * ```
 */
export const useRecommendedTaskModels = <T extends TaskType>(task: T) => {
  return useQuery({
    queryKey: ["recommended", task],
    queryFn: async () => {
      let unified: UnifiedModel[];
      switch (task) {
        case "image":
          unified = (await trpc.models.recommendedImage.query()) as UnifiedModel[];
          return unified.map(mapUnifiedToImageModel);
        case "language":
          unified = (await trpc.models.recommendedLanguage.query()) as UnifiedModel[];
          return unified.map(mapUnifiedToLanguageModel);
        case "asr":
          unified = (await trpc.models.recommendedAsr.query()) as UnifiedModel[];
          return unified.map(mapUnifiedToASRModel);
        case "tts":
          unified = (await trpc.models.recommendedTts.query()) as UnifiedModel[];
          return unified.map(mapUnifiedToTTSModel);
        default:
          return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

