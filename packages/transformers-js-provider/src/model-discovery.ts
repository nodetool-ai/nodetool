import {
  KOKORO_VOICES,
  getTransformersJsCacheDir,
  isKokoroRepo,
  recommendedFor,
  scanTransformersJsCache,
  type CachedTjsModel
} from "@nodetool-ai/transformers-js-nodes";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  ModelAdapterInfo,
  ProviderId,
  RerankModel,
  TTSModel
} from "@nodetool-ai/runtime";

const PROVIDER_ID: ProviderId = "transformers_js";

interface DiscoveredEntry {
  repo_id: string;
  cached: boolean;
  /** Path within the repo, if the recommended ref specified one. */
  path?: string | null;
}

/**
 * The repository the model loads. The server compares it with the
 * Transformers.js cache to decide if the picker offers a download.
 */
function adapterFor(repoId: string, modelType: string): ModelAdapterInfo {
  return {
    state: "installed",
    artifactRef: { source: "huggingface", repoId, modelType }
  };
}

async function unionRecommendedAndCache(
  taskTypes: string[]
): Promise<DiscoveredEntry[]> {
  const recommended = new Map<string, DiscoveredEntry>();
  for (const t of taskTypes) {
    for (const ref of recommendedFor(t)) {
      if (!recommended.has(ref.repo_id)) {
        recommended.set(ref.repo_id, {
          repo_id: ref.repo_id,
          cached: false,
          path: ref.path ?? null
        });
      }
    }
  }

  let cached: CachedTjsModel[] = [];
  try {
    cached = await scanTransformersJsCache(getTransformersJsCacheDir());
  } catch {
    // Cache scan failures are non-fatal; we still surface recommended models.
  }

  // We can only annotate recommended repos with their cached status: a cached
  // repo that is not on any recommended list carries no task metadata on disk,
  // so we cannot know which modality (text-gen vs ASR vs …) it belongs to and
  // must not surface it under an arbitrary task.
  for (const c of cached) {
    const existing = recommended.get(c.repo_id);
    if (existing) {
      existing.cached = true;
    }
  }

  return Array.from(recommended.values());
}

export async function discoverLanguageModels(): Promise<LanguageModel[]> {
  const entries = await unionRecommendedAndCache(["tjs.text_generation"]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID
  }));
}

export async function discoverTTSModels(): Promise<TTSModel[]> {
  const entries = await unionRecommendedAndCache(["tjs.text_to_speech"]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID,
    voices: isKokoroRepo(e.repo_id) ? [...KOKORO_VOICES] : undefined,
    adapter: adapterFor(e.repo_id, "tjs.text_to_speech")
  }));
}

export async function discoverASRModels(): Promise<ASRModel[]> {
  const entries = await unionRecommendedAndCache([
    "tjs.automatic_speech_recognition"
  ]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID,
    adapter: adapterFor(e.repo_id, "tjs.automatic_speech_recognition")
  }));
}

export async function discoverEmbeddingModels(): Promise<EmbeddingModel[]> {
  const entries = await unionRecommendedAndCache(["tjs.feature_extraction"]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID,
    adapter: adapterFor(e.repo_id, "tjs.feature_extraction")
  }));
}

/** The provider capability each image catalog type serves. */
const IMAGE_TASKS: ReadonlyArray<readonly [string, string]> = [
  ["tjs.background_removal", "remove_background"],
  ["tjs.depth_estimation", "estimate_depth"]
];

export async function discoverImageModels(): Promise<ImageModel[]> {
  const models: ImageModel[] = [];
  for (const [modelType, task] of IMAGE_TASKS) {
    for (const e of await unionRecommendedAndCache([modelType])) {
      models.push({
        id: e.repo_id,
        name: e.repo_id,
        provider: PROVIDER_ID,
        supportedTasks: [task],
        adapter: adapterFor(e.repo_id, modelType)
      });
    }
  }
  return models;
}

export async function discoverRerankModels(): Promise<RerankModel[]> {
  const entries = await unionRecommendedAndCache(["tjs.text_ranking"]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID,
    adapter: adapterFor(e.repo_id, "tjs.text_ranking")
  }));
}
