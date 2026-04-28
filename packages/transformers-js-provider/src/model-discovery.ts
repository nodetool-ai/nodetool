import {
  KOKORO_VOICES,
  getTransformersJsCacheDir,
  isKokoroRepo,
  recommendedFor,
  scanTransformersJsCache,
  type CachedTjsModel,
  type TjsModelRef
} from "@nodetool-ai/transformers-js-nodes";
import type {
  ASRModel,
  EmbeddingModel,
  LanguageModel,
  ProviderId,
  TTSModel
} from "@nodetool-ai/runtime";

const PROVIDER_ID: ProviderId = "transformers_js";

interface DiscoveredEntry {
  repo_id: string;
  cached: boolean;
  /** Path within the repo, if the recommended ref specified one. */
  path?: string | null;
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

  for (const c of cached) {
    const existing = recommended.get(c.repo_id);
    if (existing) {
      existing.cached = true;
    } else if (matchesAny(c.repo_id, taskTypes)) {
      // Off-list cached repos that happen to be recommended under one of the
      // requested task types only — i.e. the same repo appears under another
      // recommended task. Skip the rest; they belong to other modalities.
      recommended.set(c.repo_id, { repo_id: c.repo_id, cached: true });
    }
  }

  return Array.from(recommended.values());
}

function matchesAny(repoId: string, taskTypes: string[]): boolean {
  for (const t of taskTypes) {
    if (recommendedFor(t).some((r: TjsModelRef) => r.repo_id === repoId)) {
      return true;
    }
  }
  return false;
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
    voices: isKokoroRepo(e.repo_id) ? [...KOKORO_VOICES] : undefined
  }));
}

export async function discoverASRModels(): Promise<ASRModel[]> {
  const entries = await unionRecommendedAndCache([
    "tjs.automatic_speech_recognition"
  ]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID
  }));
}

export async function discoverEmbeddingModels(): Promise<EmbeddingModel[]> {
  const entries = await unionRecommendedAndCache(["tjs.feature_extraction"]);
  return entries.map((e) => ({
    id: e.repo_id,
    name: e.repo_id,
    provider: PROVIDER_ID
  }));
}
