/**
 * The `models` capability module — model discovery over the configured
 * providers.
 *
 * Three capabilities that used to be three `Tool` subclasses, one per file.
 * Wire names, descriptions and schemas are unchanged: a belt builds them
 * from `models.specs.ts` by name.
 *
 * The providers map was a constructor argument and is now `run.providers`. It
 * is read at call time, so a host that fills the map lazily — the MCP mount
 * does — still serves the models it resolved after construction.
 *
 * Design: docs/tool-class-retirement-design.md § Migration.
 */

import type {
  BaseProvider,
  JsonSchema,
  ProviderCapability,
  RecommendedUnifiedModel
} from "@nodetool-ai/runtime";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  findModelSpec,
  listModelsSpec,
  listProviderModelsSpec,
  SUPPORTED_CAPABILITIES,
  FIND_MODEL_INPUT_SCHEMA,
  MODEL_TYPES,
  LIST_MODELS_SCHEMA
} from "./models.specs.js";

export {
  SUPPORTED_CAPABILITIES,
  FIND_MODEL_INPUT_SCHEMA,
  MODEL_TYPES,
  LIST_MODELS_SCHEMA
} from "./models.specs.js";

/** Providers this run can reach. Empty when the host wired none. */
function providersOf(run: CapabilityRun): Record<string, BaseProvider> {
  return run.providers ?? {};
}

type SupportedCapability = (typeof SUPPORTED_CAPABILITIES)[number];

/**
 * A provider is treated as offering downloaded models when it runs locally.
 * Neither `find_model` nor `list_models` inspects the on-disk cache, so both
 * report the same `downloaded` for the same model.
 *
 * `huggingface` is not one of them: it is the HF Inference API, a remote call
 * like any other. Counting it as local gave every HF model the `downloaded`
 * bonus and put `FLUX.1-schnell` ahead of the fal_ai copy that could actually
 * run, on a host with no `@huggingface/inference` installed.
 */
const LOCAL_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "vllm",
  "llama_cpp",
  "node_llama_cpp"
]);

/**
 * Why a configured provider still cannot serve a call, or `null` when it can.
 * A provider that answers with a reason is dropped from the ranking and named
 * in the result's note — ranking a model nothing can run turns a discovery
 * call into a failed generation call.
 */
async function unavailableReasonOf(
  provider: BaseProvider
): Promise<string | null> {
  // Guarded rather than called outright: a provider from an older build has no
  // such method, and hiding every provider over that would be a far worse
  // failure than the one this prevents.
  if (typeof provider.unavailableReason !== "function") return null;
  try {
    return await provider.unavailableReason();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

interface AnyModel {
  id: string;
  name: string;
  provider: string;
  supportedTasks?: string[];
}

interface FindModelResult {
  provider: string;
  model_id: string;
  name: string;
  downloaded: boolean;
  recommended: boolean;
  score: number;
  /** Ready to assign to a node's model property — see {@link modelRef}. */
  ref: ModelRef;
}

interface ModelRef {
  type: string;
  provider: string;
  id: string;
  name: string;
}

/**
 * The typed-ref property shape a model-typed node property takes. A pick
 * result's flat fields (`model_id`) do not round-trip into a property — a
 * live session lost three rounds to exactly that — so every result carries
 * the assignable form too.
 */
const CAPABILITY_REF_TYPE = {
  generate_message: "language_model",
  text_to_image: "image_model",
  image_to_image: "image_model",
  text_to_video: "video_model",
  image_to_video: "video_model",
  text_to_speech: "tts_model",
  text_to_music: "tts_model",
  automatic_speech_recognition: "asr_model",
  generate_embedding: "embedding_model"
} satisfies Record<SupportedCapability, string>;

function modelRef(
  capability: SupportedCapability,
  provider: string,
  id: string,
  name: string
): ModelRef {
  return { type: CAPABILITY_REF_TYPE[capability], provider, id, name };
}

function getRecommendedSet(capability: SupportedCapability): Set<string> {
  const wantedTasks = capabilityToRecommendedTasks(capability);
  const wantedModalities = capabilityToRecommendedModalities(capability);
  const ids = new Set<string>();
  for (const m of RECOMMENDED_MODELS) {
    const taskMatch = !wantedTasks || (m.task && wantedTasks.has(m.task));
    const modalityMatch = wantedModalities.has(m.modality);
    if (modalityMatch && taskMatch && m.provider) {
      ids.add(`${m.provider}::${m.id}`);
    }
  }
  return ids;
}

function capabilityToRecommendedTasks(
  capability: SupportedCapability
): Set<string> | null {
  switch (capability) {
    case "text_to_image":
      return new Set(["text_to_image"]);
    case "image_to_image":
      return new Set(["image_to_image"]);
    case "text_to_video":
      return new Set(["text_to_video"]);
    case "image_to_video":
      return new Set(["image_to_video"]);
    case "generate_embedding":
      return new Set(["embedding"]);
    case "generate_message":
      return new Set(["text_generation"]);
    default:
      // tts/asr have no `task` set on recommended entries — fall back to
      // modality-only filtering.
      return null;
  }
}

function capabilityToRecommendedModalities(
  capability: SupportedCapability
): Set<RecommendedUnifiedModel["modality"]> {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
      return new Set(["image"]);
    case "text_to_video":
    case "image_to_video":
      return new Set(["video"]);
    case "text_to_speech":
      return new Set(["tts"]);
    case "text_to_music":
      return new Set(["music"]);
    case "automatic_speech_recognition":
      return new Set(["asr"]);
    case "generate_embedding":
    case "generate_message":
      return new Set(["language"]);
  }
}

async function fetchModelsForCapability(
  provider: BaseProvider,
  capability: SupportedCapability
): Promise<AnyModel[]> {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
      return await provider.getAvailableImageModels();
    case "text_to_video":
    case "image_to_video":
      return await provider.getAvailableVideoModels();
    case "text_to_speech":
      return await provider.getAvailableTTSModels();
    case "text_to_music":
      return await provider.getAvailableMusicModels();
    case "automatic_speech_recognition":
      return await provider.getAvailableASRModels();
    case "generate_embedding":
      return await provider.getAvailableEmbeddingModels();
    case "generate_message":
      return await provider.getAvailableLanguageModels();
  }
}

function taskMatch(model: AnyModel, task: string | undefined): boolean {
  if (!task) return true;
  if (!model.supportedTasks || model.supportedTasks.length === 0) return true;
  return model.supportedTasks.includes(task);
}

/**
 * Lowercase, with every separator collapsed to a single space, so a query
 * word matches across the punctuation a model id happens to use:
 * `black-forest-labs/FLUX.1-schnell` → `black forest labs flux 1 schnell`.
 */
function searchable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryWords(query: string): string[] {
  const words = searchable(query).split(" ").filter(Boolean);
  return words;
}

/** Every word of the query appears somewhere in the model's id or name. */
function queryMatch(model: AnyModel, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = ` ${searchable(`${model.id} ${model.name}`)} `;
  return words.every((w) => haystack.includes(w));
}

function hintMatch(model: AnyModel, hints: Set<string>): boolean {
  if (hints.size === 0) return false;
  const id = searchable(model.id);
  for (const hint of hints) {
    const h = searchable(hint);
    if (h && (id === h || id.includes(h))) return true;
  }
  return false;
}

const findModel: CapabilityExport = {
  spec: findModelSpec,
  impl: async (run, params) => {
    const capability = params["capability"] as SupportedCapability | undefined;
    if (!capability || !SUPPORTED_CAPABILITIES.includes(capability)) {
      return {
        capability,
        total: 0,
        results: [],
        error: `capability must be one of: ${SUPPORTED_CAPABILITIES.join(", ")}`
      };
    }

    const task =
      typeof params["task"] === "string"
        ? params["task"]
        : undefined;
    const query =
      typeof params["query"] === "string"
        ? params["query"]
        : undefined;
    const providerHint =
      typeof params["provider_hint"] === "string"
        ? params["provider_hint"]
        : undefined;
    const modelHintRaw = params["model_hint"];
    const modelHints: Set<string> = new Set(
      typeof modelHintRaw === "string"
        ? [modelHintRaw]
        : Array.isArray(modelHintRaw)
          ? modelHintRaw.filter((x) => typeof x === "string")
          : []
    );
    const preferLocal = params["prefer_local"] === true;
    const limit =
      typeof params["limit"] === "number" && params["limit"] > 0
        ? Math.floor(params["limit"])
        : 5;

    const providerEntries = Object.entries(providersOf(run));
    if (providerEntries.length === 0) {
      return {
        capability,
        total: 0,
        results: [],
        note: "No providers configured. Use nodetool.agents.Agent without a model property for AI work."
      };
    }

    const recommendedSet = getRecommendedSet(capability);
    const candidates: Array<{ providerId: string; model: AnyModel }> = [];
    const unavailable: string[] = [];

    for (const [providerId, instance] of providerEntries) {
      let supports: boolean;
      try {
        supports = instance
          .getCapabilities()
          .includes(capability);
      } catch {
        continue;
      }
      if (!supports) continue;

      const blocked = await unavailableReasonOf(instance);
      if (blocked) {
        unavailable.push(`${providerId} (${blocked})`);
        continue;
      }

      let models: AnyModel[];
      try {
        models = await fetchModelsForCapability(instance, capability);
      } catch {
        continue;
      }

      for (const m of models) {
        candidates.push({ providerId, model: m });
      }
    }

    const notes: string[] = [];
    if (unavailable.length > 0) {
      notes.push(
        `Skipped providers that cannot run here: ${unavailable.join(", ")}.`
      );
    }
    let words = queryWords(typeof query === "string" ? query : "");

    // The `task` filter reads `supportedTasks`. A caller who typed a model name
    // into it used to get an empty list — or, when no model declares tasks at
    // all, the unfiltered default ranking — and no way to tell why. A task no
    // model declares is read as a name search instead.
    const declaredTasks = new Set<string>();
    for (const { model } of candidates) {
      for (const t of model.supportedTasks ?? []) declaredTasks.add(t);
    }
    let pool: typeof candidates;
    if (task && !declaredTasks.has(task)) {
      pool = candidates;
      words = [...words, ...queryWords(task)];
      notes.push(
        `No model declares task '${task}'; searched model names for it instead. Use \`query\` to search by name.`
      );
    } else {
      pool = candidates.filter(({ model }) => taskMatch(model, task));
    }

    let queryMatched: boolean | undefined;
    if (words.length > 0) {
      const matched = pool.filter(({ model }) => queryMatch(model, words));
      queryMatched = matched.length > 0;
      if (matched.length > 0) {
        pool = matched;
      } else {
        notes.push(
          `No model name matched '${words.join(" ")}'. Showing the ranked models for ${capability} instead.`
        );
      }
    }

    const collected: FindModelResult[] = pool.map(({ providerId, model }) => {
      const recommended = recommendedSet.has(`${providerId}::${model.id}`);
      const downloaded = LOCAL_PROVIDER_IDS.has(providerId);

      let score = 0;
      if (recommended) score += 100;
      if (downloaded) score += 30;
      // Explicit user preferences outrank the default recommended bonus.
      if (providerHint && providerId === providerHint) score += 200;
      if (hintMatch(model, modelHints)) score += 250;
      if (preferLocal && LOCAL_PROVIDER_IDS.has(providerId)) score += 150;
      else if (preferLocal && !LOCAL_PROVIDER_IDS.has(providerId)) score -= 5;

      return {
        provider: providerId,
        model_id: model.id,
        name: model.name,
        downloaded,
        recommended,
        score,
        ref: modelRef(capability, providerId, model.id, model.name)
      };
    });

    collected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.provider !== b.provider)
        return a.provider.localeCompare(b.provider);
      return a.model_id.localeCompare(b.model_id);
    });

    const answer: FindModelAnswer = {
      capability,
      total: collected.length,
      results: collected.slice(0, limit)
    };
    if (queryMatched !== undefined) answer.query_matched = queryMatched;
    if (notes.length > 0) answer.note = notes.join(" ");
    return answer;
  }
};

/** One ranked candidate `find_model` returns. */
interface RankedModel {
  provider: string;
  model_id: string;
  name: string;
  downloaded: boolean;
  recommended: boolean;
  score: number;
  ref: ReturnType<typeof modelRef>;
}

/** `find_model`'s answer; each note appears only when there is one. */
interface FindModelAnswer {
  capability: string;
  total: number;
  results: RankedModel[];
  query_matched?: boolean;
  note?: string;
}

/** `list_models`' answer; the note names providers that could not be reached. */
interface ListModelsAnswer {
  total: number;
  truncated: boolean;
  results: ListedModel[];
  note?: string;
}

type ModelType = (typeof MODEL_TYPES)[number];

/** Names an agent is likely to guess, mapped onto the canonical type. */
const MODEL_TYPE_ALIASES: Record<string, ModelType> = {
  llm: "language",
  text: "language",
  language_model: "language",
  text_generation: "language",
  image_model: "image",
  video_model: "video",
  // The capability names `find_model` takes — a caller who knows one surface
  // should not have to learn the other's vocabulary to browse.
  generate_message: "language",
  text_to_image: "image",
  image_to_image: "image",
  text_to_video: "video",
  image_to_video: "video",
  text_to_music: "music",
  generate_embedding: "embedding",
  speech: "tts",
  text_to_speech: "tts",
  audio: "tts",
  transcription: "asr",
  automatic_speech_recognition: "asr",
  embeddings: "embedding"
};

interface ListedModelSource {
  id: string;
  name?: string;
  provider?: string;
}

interface ListedModel {
  provider: string;
  model_id: string;
  name: string;
  type: ModelType;
  downloaded: boolean;
}

/** The capability a provider must report before we ask it for this type. */
const TYPE_CAPABILITY = {
  language: "generate_message",
  image: "text_to_image",
  video: "text_to_video",
  tts: "text_to_speech",
  music: "text_to_music",
  asr: "automatic_speech_recognition",
  embedding: "generate_embedding"
} satisfies Record<ModelType, ProviderCapability>;

async function fetchModelsOfType(
  provider: BaseProvider,
  type: ModelType
): Promise<ListedModelSource[]> {
  switch (type) {
    case "language":
      return await provider.getAvailableLanguageModels();
    case "image":
      return await provider.getAvailableImageModels();
    case "video":
      return await provider.getAvailableVideoModels();
    case "tts":
      return await provider.getAvailableTTSModels();
    case "music":
      return await provider.getAvailableMusicModels();
    case "asr":
      return await provider.getAvailableASRModels();
    case "embedding":
      return await provider.getAvailableEmbeddingModels();
  }
}

function normalizeModelType(raw: unknown): ModelType | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const key = raw.trim().toLowerCase();
  if ((MODEL_TYPES as readonly string[]).includes(key)) return key as ModelType;
  return MODEL_TYPE_ALIASES[key] ?? "invalid";
}

const listModels: CapabilityExport = {
  spec: listModelsSpec,
  impl: async (run, params) => {
    const providers = providersOf(run);
    const modelType = normalizeModelType(params["model_type"]);
    if (modelType === "invalid") {
      return {
        total: 0,
        results: [],
        error: `model_type must be one of: ${MODEL_TYPES.join(", ")}`
      };
    }

    const providerFilterRaw = params["provider"];
    const providerFilter =
      typeof providerFilterRaw === "string" &&
      providerFilterRaw.trim() !== "" &&
      providerFilterRaw.trim().toLowerCase() !== "all"
        ? providerFilterRaw.trim()
        : undefined;
    const downloadedOnly = params["downloaded_only"] === true;
    const limit =
      typeof params["limit"] === "number" && params["limit"] > 0
        ? Math.floor(params["limit"])
        : 50;

    const entries = Object.entries(providers).filter(
      ([id]) => !providerFilter || id === providerFilter
    );

    if (entries.length === 0) {
      const configured = Object.keys(providers).sort();
      return {
        total: 0,
        results: [],
        note: providerFilter
          ? `Provider '${providerFilter}' is not configured. Configured providers: ${
              configured.length > 0 ? configured.join(", ") : "none"
            }.`
          : "No providers are configured. Add an API key in Settings → Models & Providers."
      };
    }

    const wantedTypes = modelType ? [modelType] : [...MODEL_TYPES];
    const collected: ListedModel[] = [];
    const unavailable: string[] = [];

    for (const [providerId, instance] of entries) {
      const downloaded = LOCAL_PROVIDER_IDS.has(providerId);
      if (downloadedOnly && !downloaded) continue;

      let capabilities: ProviderCapability[];
      try {
        capabilities = instance.getCapabilities();
      } catch {
        continue;
      }

      const blocked = await unavailableReasonOf(instance);
      if (blocked) {
        unavailable.push(`${providerId} (${blocked})`);
        continue;
      }

      for (const type of wantedTypes) {
        if (!capabilities.includes(TYPE_CAPABILITY[type])) continue;

        let models: ListedModelSource[];
        try {
          models = await fetchModelsOfType(instance, type);
        } catch {
          // A provider that can't be reached (no key, server down) drops out
          // of the listing rather than failing the whole call.
          continue;
        }

        for (const model of models) {
          if (!model?.id) continue;
          collected.push({
            provider: providerId,
            model_id: model.id,
            name: model.name ?? model.id,
            type,
            downloaded
          });
        }
      }
    }

    collected.sort((a, b) => {
      if (a.provider !== b.provider)
        return a.provider.localeCompare(b.provider);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.model_id.localeCompare(b.model_id);
    });

    const answer: ListModelsAnswer = {
      total: collected.length,
      truncated: collected.length > limit,
      results: collected.slice(0, limit)
    };
    if (unavailable.length > 0) {
      answer.note = `Skipped providers that cannot run here: ${unavailable.join(", ")}.`;
    }
    return answer;
  }
};

// ---------------------------------------------------------------------------
// list_provider_models
// ---------------------------------------------------------------------------

const listProviderModels: CapabilityExport = {
  spec: listProviderModelsSpec,
  impl: async (run, params) => {
    const providerId = params["provider"];
    if (typeof providerId !== "string") {
      return { success: false, error: "provider must be a string" };
    }

    const provider = providersOf(run)[providerId];
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (typeof provider.getAvailableLanguageModels !== "function") {
      return {
        success: false,
        error: `Provider ${providerId} does not support model listing`
      };
    }

    try {
      const models = await provider.getAvailableLanguageModels();
      return { success: true, provider: providerId, models };
    } catch (e) {
      return {
        success: false,
        error: `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/** Every model capability, in the order `getAllMcpTools` offered them. */
export const MODEL_CAPABILITIES: readonly CapabilityExport[] = [
  findModel,
  listModels,
  listProviderModels
];

export const module: CapabilityModule = {
  module: "models",
  exports: MODEL_CAPABILITIES
};

export { findModel, listModels, listProviderModels };
