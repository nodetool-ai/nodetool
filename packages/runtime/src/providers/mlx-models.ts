/**
 * MLX models the picker offers to download. The MLX worker lists chat and
 * image models only when their repository is already in the Hugging Face
 * cache, so without these lists a fresh install shows no MLX model at all.
 * Video models load files from several repositories or parts of one, so
 * each carries its exact download targets. Its speech lists are fixed, and each row gets its repository as a download
 * target here, so the picker can tell a cached model from a missing one.
 */
import type {
  ImageModel,
  LanguageModel,
  ModelAdapterInfo,
  ModelArtifactRef,
  VideoModel
} from "./types.js";

export interface RecommendedMlxModel {
  repoId: string;
  name: string;
  /** Download size in GB, rounded. */
  sizeGb: number;
}

export interface RecommendedMlxImageModel extends RecommendedMlxModel {
  supportedTasks: ("text_to_image" | "image_to_image")[];
}

export const RECOMMENDED_MLX_LANGUAGE_MODELS: readonly RecommendedMlxModel[] = [
  { repoId: "mlx-community/Qwen3-4B-Instruct-2507-4bit", name: "Qwen3 4B Instruct 2507", sizeGb: 2.3 },
  { repoId: "mlx-community/Llama-3.2-3B-Instruct-4bit", name: "Llama 3.2 3B Instruct", sizeGb: 1.8 },
  { repoId: "mlx-community/Qwen3-8B-4bit", name: "Qwen3 8B", sizeGb: 4.6 },
  { repoId: "mlx-community/gpt-oss-20b-MXFP4-Q8", name: "gpt-oss 20B", sizeGb: 12.1 },
  { repoId: "mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit", name: "Qwen3 30B A3B Instruct 2507", sizeGb: 17.2 }
];

const BOTH: RecommendedMlxImageModel["supportedTasks"] = ["text_to_image", "image_to_image"];

/**
 * Pre-quantized mflux builds of the families the worker dispatches by name:
 * FLUX.1, FLUX.2 klein, Z-Image and Qwen Image.
 */
export const RECOMMENDED_MLX_IMAGE_MODELS: readonly RecommendedMlxImageModel[] = [
  { repoId: "mflux-community/flux2-klein-4b-mflux-q4", name: "FLUX.2 klein 4B", sizeGb: 4.6, supportedTasks: BOTH },
  { repoId: "mflux-community/z-image-turbo-mflux-q4", name: "Z-Image Turbo", sizeGb: 5.9, supportedTasks: BOTH },
  { repoId: "mflux-community/flux-1-schnell-mflux-q4", name: "FLUX.1 schnell", sizeGb: 9.6, supportedTasks: BOTH },
  { repoId: "mflux-community/flux-1-dev-mflux-q4", name: "FLUX.1 dev", sizeGb: 9.6, supportedTasks: BOTH },
  { repoId: "mflux-community/flux-1-krea-dev-mflux-q4", name: "FLUX.1 Krea dev", sizeGb: 9.6, supportedTasks: BOTH },
  { repoId: "mflux-community/flux2-klein-9b-mflux-q4", name: "FLUX.2 klein 9B", sizeGb: 9.5, supportedTasks: BOTH },
  { repoId: "mflux-community/qwen-image-2512-mflux-q4", name: "Qwen Image 2512", sizeGb: 27.6, supportedTasks: BOTH },
  {
    repoId: "mflux-community/qwen-image-edit-2509-mflux-q4",
    name: "Qwen Image Edit 2509",
    sizeGb: 29,
    supportedTasks: ["image_to_image"]
  }
];

/**
 * The files the distilled LTX-2.5 flow loads from a dgrauet pack. The dev
 * transformer and the distilled LoRA (about 29 GB in q8) are left out.
 */
const LTX25_MLX_FILES = [
  "*.json",
  "*.jinja",
  "LICENSE",
  "README.md",
  "audio_vae.safetensors",
  "connector.safetensors",
  "duration_head.safetensors",
  "spatial_upscaler_*",
  "temporal_upscaler_*",
  "text_encoder.safetensors",
  "tokenizer*",
  "transformer-distilled.safetensors",
  "vae_*",
  "vocoder.safetensors"
];

/** The weights minimax-h3-mlx reads, as its scripts/download_selected.py fetches them. */
const MINIMAX_H3_MLX_ARTIFACTS: ModelArtifactRef[] = [
  {
    source: "huggingface",
    repoId: "DeepBeepMeep/MiniMax-H3",
    allowPatterns: ["MiniMax-H3-FL2VA-pruned_bf16.safetensors"]
  },
  {
    source: "huggingface",
    repoId: "ddalcu/MiniMax-H3-FL2VA-MLX-Serve-8bit",
    allowPatterns: [
      "text_encoder.safetensors",
      "video_vae.safetensors",
      "audio_vae.safetensors",
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.json",
      "merges.txt",
      "LICENSE",
      "NOTICE",
      "MODIFICATIONS.md"
    ]
  },
  {
    source: "huggingface",
    repoId: "MiniMaxAI/MiniMax-H3",
    allowPatterns: ["FL2VA/text_encoder/config.json", "FL2VA/model_index.json"]
  }
];

export interface RecommendedMlxVideoModel {
  id: string;
  name: string;
  /** Download size in GB, rounded. */
  sizeGb: number;
  artifacts: ModelArtifactRef[];
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
}

const ltxPack = (quantization: "q8" | "q4", sizeGb: number): RecommendedMlxVideoModel => {
  const repoId = `dgrauet/ltx-2.5-mlx-${quantization}`;
  return {
    id: repoId,
    name: `LTX-2.5 MLX ${quantization}`,
    sizeGb,
    artifacts: [{ source: "huggingface", repoId, allowPatterns: LTX25_MLX_FILES }],
    durations: [2, 4, 6, 8, 10],
    resolutions: ["448p", "704p", "1024p"],
    aspectRatios: ["16:9", "9:16", "1:1"]
  };
};

const minimaxH3 = (id: string, name: string): RecommendedMlxVideoModel => ({
  id,
  name,
  sizeGb: 75,
  artifacts: MINIMAX_H3_MLX_ARTIFACTS,
  durations: [5, 10, 15],
  resolutions: ["384p", "448p", "576p"],
  aspectRatios: ["16:9", "9:16"]
});

/**
 * The video models the nodetool-mlx provider runs: dgrauet's LTX-2.5 packs and
 * MiniMax H3 on Phosphene's pinned engine, Best and Fast. Ids match the ones
 * the worker lists once the files are cached. The resolution values are the
 * short sides the worker maps to its canvases.
 */
export const RECOMMENDED_MLX_VIDEO_MODELS: readonly RecommendedMlxVideoModel[] = [
  ltxPack("q4", 27),
  ltxPack("q8", 46),
  minimaxH3("MiniMaxAI/MiniMax-H3:fast", "MiniMax H3 MLX Fast"),
  minimaxH3("MiniMaxAI/MiniMax-H3", "MiniMax H3 MLX")
];

/** A download target for a whole repository. */
export function mlxRepoAdapter(repoId: string): ModelAdapterInfo {
  return { state: "installed", artifactRef: { source: "huggingface", repoId } };
}

/** Whether a model id is a Hugging Face repository id. */
const isRepoId = (id: string): boolean => /^[\w.-]+\/[\w.-]+$/.test(id);

/**
 * The recommended models first, then every other model the worker found. A
 * recommended repository the worker already lists keeps one row. The server
 * marks a row ready once its repository is cached.
 */
function withRecommended<T extends { id: string }>(recommended: T[], listed: readonly T[]): T[] {
  const ids = new Set(recommended.map((model) => model.id));
  return [...recommended, ...listed.filter((model) => !ids.has(model.id))];
}

export function withRecommendedMlxModels(
  provider: string,
  listed: readonly LanguageModel[]
): LanguageModel[] {
  return withRecommended<LanguageModel>(
    RECOMMENDED_MLX_LANGUAGE_MODELS.map((model) => ({
      id: model.repoId,
      name: `${model.name} (${model.sizeGb} GB)`,
      provider,
      adapter: mlxRepoAdapter(model.repoId)
    })),
    listed
  );
}

export function withRecommendedMlxImageModels(
  provider: string,
  listed: readonly ImageModel[]
): ImageModel[] {
  return withRecommended<ImageModel>(
    RECOMMENDED_MLX_IMAGE_MODELS.map((model) => ({
      id: model.repoId,
      name: `${model.name} (${model.sizeGb} GB)`,
      provider,
      supportedTasks: model.supportedTasks,
      adapter: mlxRepoAdapter(model.repoId)
    })),
    listed
  );
}

/** Give each listed model without an adapter its repository as a download target. */
export function withMlxRepoAdapters<T extends { id: string; adapter?: ModelAdapterInfo }>(
  listed: readonly T[]
): T[] {
  return listed.map((model) =>
    model.adapter || !isRepoId(model.id) ? model : { ...model, adapter: mlxRepoAdapter(model.id) }
  );
}

export function withRecommendedMlxVideoModels(
  provider: string,
  listed: readonly VideoModel[]
): VideoModel[] {
  return withRecommended<VideoModel>(
    RECOMMENDED_MLX_VIDEO_MODELS.map((model) => {
      const [artifactRef, ...extraArtifactRefs] = model.artifacts;
      const adapter: ModelAdapterInfo = { state: "installed", artifactRef };
      if (extraArtifactRefs.length > 0) {
        adapter.extraArtifactRefs = extraArtifactRefs;
      }
      return {
        id: model.id,
        name: `${model.name} (${model.sizeGb} GB)`,
        provider,
        supportedTasks: ["text_to_video", "image_to_video"],
        durations: model.durations,
        resolutions: model.resolutions,
        aspectRatios: model.aspectRatios,
        endFrame: "optional",
        adapter
      };
    }),
    listed
  );
}
