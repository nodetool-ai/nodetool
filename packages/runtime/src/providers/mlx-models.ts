/**
 * MLX models the picker offers to download. The MLX worker lists chat and
 * image models only when their repository is already in the Hugging Face
 * cache, so without these lists a fresh install shows no MLX model at all.
 * Its speech lists are fixed, and each row gets its repository as a download
 * target here, so the picker can tell a cached model from a missing one.
 */
import type { ImageModel, LanguageModel, ModelAdapterInfo } from "./types.js";

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
