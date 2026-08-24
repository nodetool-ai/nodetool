/**
 * Model ids a provider ships in a bundled manifest, for callers that must
 * decide whether a saved model id is real without touching the network.
 *
 * Two things narrow what this can answer, and both fail toward silence:
 *
 * - Only manifest-backed providers appear here. Everything else enumerates its
 *   catalog over the wire (Anthropic, Gemini, Groq) or from a local daemon
 *   (Ollama, LM Studio, HuggingFace).
 * - Only the model types a manifest actually classifies are covered. ASR and
 *   language models are not among them — a fal ASR id like
 *   `openai/whisper-large-v3` appears nowhere in the fal manifest, so a lookup
 *   that ignored model type would call every real ASR selection a typo.
 *
 * Both cases return `undefined`, which means "cannot tell" — never "no such
 * model". The manifests are where a typo is most likely and least visible:
 * generated catalogs of hundreds of long, slash-separated ids
 * (`fal-ai/ltx-2/image-to-video/fast`), where a wrong one fails only once the
 * node runs, after the rest of the graph has already been paid for.
 */
import {
  getRequiredTextInputNames,
  loadImageModels,
  loadVideoModels,
  loadTTSModels,
  loadMusicModels
} from "./manifest-models.js";

interface ManifestSource {
  pkg: string;
  path: string;
}

/**
 * Kept in step with the `load*Models` call sites in each provider. A provider
 * missing here is treated as un-enumerable rather than empty, so forgetting to
 * add one costs a missed check, never a false "unknown model".
 */
const MANIFEST_SOURCES: Record<string, ManifestSource> = {
  fal_ai: { pkg: "@nodetool-ai/fal-nodes", path: "fal-manifest.json" },
  kie: { pkg: "@nodetool-ai/kie-nodes", path: "kie-manifest.json" },
  replicate: {
    pkg: "@nodetool-ai/replicate-nodes",
    path: "replicate-manifest.json"
  },
  together: {
    pkg: "@nodetool-ai/together-nodes",
    path: "together-manifest.json"
  },
  atlascloud: {
    pkg: "@nodetool-ai/atlascloud-nodes",
    path: "atlascloud-manifest.json"
  },
  topaz: { pkg: "@nodetool-ai/topaz-nodes", path: "topaz-manifest.json" }
};

/**
 * The model-ref `type` tags a manifest can answer for. A type absent here is
 * un-enumerable offline no matter which provider is asked.
 */
const LOADER_BY_MODEL_TYPE: Record<
  string,
  (pkg: string, path: string, provider: string) => { id: string }[]
> = {
  image_model: loadImageModels,
  video_model: loadVideoModels,
  tts_model: loadTTSModels,
  music_model: loadMusicModels
};

const cache = new Map<string, readonly string[] | undefined>();

/**
 * Every model id `provider` offers of `modelType` (an `image_model`-style tag),
 * or `undefined` when that cannot be established offline.
 */
export function listOfflineModelIds(
  provider: string,
  modelType: string
): readonly string[] | undefined {
  const key = `${provider}\u0000${modelType}`;
  if (cache.has(key)) return cache.get(key);

  const source = MANIFEST_SOURCES[provider];
  const load = LOADER_BY_MODEL_TYPE[modelType];
  if (!source || !load) {
    cache.set(key, undefined);
    return undefined;
  }

  let result: readonly string[] | undefined;
  try {
    const ids = [...new Set(load(source.pkg, source.path, provider).map((m) => m.id).filter(Boolean))];
    // An empty result means the manifest failed to resolve, or carries nothing
    // of this type — a packaging fault or a gap, not proof of a bad id.
    result = ids.length > 0 ? ids : undefined;
  } catch {
    // A manifest that will not load cannot prove a model absent.
    result = undefined;
  }

  cache.set(key, result);
  return result;
}

/**
 * Text inputs `modelId` declares it will not run without, or `undefined` when
 * that cannot be established offline.
 *
 * Same silence rules as {@link listOfflineModelIds}: an unknown provider, an
 * unclassified model type, an unreadable manifest, or a model the manifest does
 * not carry all answer `undefined`. An entry that declares no required text
 * input answers `[]` — that one is knowledge, not a gap.
 */
export function listOfflineRequiredTextInputs(
  provider: string,
  modelType: string,
  modelId: string
): readonly string[] | undefined {
  const source = MANIFEST_SOURCES[provider];
  if (!source || !LOADER_BY_MODEL_TYPE[modelType]) return undefined;
  try {
    return getRequiredTextInputNames(source.pkg, source.path, modelId);
  } catch {
    return undefined;
  }
}

/** Providers whose ids {@link listOfflineModelIds} can check. */
export function offlineModelIndexProviders(): readonly string[] {
  return Object.keys(MANIFEST_SOURCES);
}

/** Model-ref type tags {@link listOfflineModelIds} can check. */
export function offlineModelIndexTypes(): readonly string[] {
  return Object.keys(LOADER_BY_MODEL_TYPE);
}
