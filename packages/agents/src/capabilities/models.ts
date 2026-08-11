/**
 * The `models` capability module — model discovery over the configured
 * providers.
 *
 * Three capabilities that used to be three `Tool` subclasses
 * (`../tools/find-model-tool.ts`, `../tools/list-models-tool.ts`,
 * `../tools/model-tools.ts`). Wire names, descriptions and schemas are
 * unchanged: `getAllMcpTools` builds them through `toolFromCapability`.
 *
 * The providers map was a constructor argument and is now `run.providers`. It
 * is read at call time, so a host that fills the map lazily — the MCP mount
 * does — still serves the models it resolved after construction.
 *
 * Design: docs/tool-class-retirement-design.md § Migration.
 */

import type {
  ASRModel,
  BaseProvider,
  EmbeddingModel,
  ImageModel,
  JsonSchema,
  LanguageModel,
  MusicModel,
  ProviderCapability,
  RecommendedUnifiedModel,
  TTSModel,
  VideoModel
} from "@nodetool-ai/runtime";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";

/** Providers this run can reach. Empty when the host wired none. */
function providersOf(run: CapabilityRun): Record<string, BaseProvider> {
  return run.providers ?? {};
}

// ---------------------------------------------------------------------------
// find_model
// ---------------------------------------------------------------------------

const SUPPORTED_CAPABILITIES = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "text_to_speech",
  "text_to_music",
  "automatic_speech_recognition",
  "generate_embedding",
  "generate_message"
] as const;

type SupportedCapability = (typeof SUPPORTED_CAPABILITIES)[number];

/**
 * A provider is treated as offering downloaded models when it runs locally.
 * Neither `find_model` nor `list_models` inspects the on-disk cache, so both
 * report the same `downloaded` for the same model.
 */
const LOCAL_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "vllm",
  "llama_cpp",
  "node_llama_cpp",
  "huggingface"
]);

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
}

const FIND_MODEL_INPUT_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    capability: {
      type: "string" as const,
      enum: [...SUPPORTED_CAPABILITIES],
      description:
        "Provider capability needed by the generic AI node (e.g. text_to_image, generate_embedding)."
    },
    task: {
      type: "string" as const,
      description:
        "Optional task hint matched against model.supportedTasks (e.g. 'text_to_image' vs 'image_to_image')."
    },
    provider_hint: {
      type: "string" as const,
      description:
        "Optional preferred provider id (e.g. 'openai'). Boosts matching providers."
    },
    model_hint: {
      type: "array" as const,
      items: { type: "string" as const },
      description:
        "Optional preferred model ids. Strongly boosts matching models in the ranking."
    },
    prefer_local: {
      type: "boolean" as const,
      description:
        "If true, ranks local providers (ollama, lmstudio, vllm, llama_cpp, node_llama_cpp, huggingface) above hosted ones.",
      default: false
    },
    limit: {
      type: "number" as const,
      description: "Maximum number of results to return (default 5).",
      default: 5
    }
  },
  required: ["capability"] as string[]
};

function getRecommendedSet(capability: SupportedCapability): Set<string> {
  const wantedTasks = capabilityToRecommendedTasks(capability);
  const wantedModalities = capabilityToRecommendedModalities(capability);
  const ids = new Set<string>();
  for (const m of RECOMMENDED_MODELS as RecommendedUnifiedModel[]) {
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
      return (await provider.getAvailableImageModels()) as ImageModel[];
    case "text_to_video":
    case "image_to_video":
      return (await provider.getAvailableVideoModels()) as VideoModel[];
    case "text_to_speech":
      return (await provider.getAvailableTTSModels()) as TTSModel[];
    case "text_to_music":
      return (await provider.getAvailableMusicModels()) as MusicModel[];
    case "automatic_speech_recognition":
      return (await provider.getAvailableASRModels()) as ASRModel[];
    case "generate_embedding":
      return (await provider.getAvailableEmbeddingModels()) as EmbeddingModel[];
    case "generate_message":
      return (await provider.getAvailableLanguageModels()) as LanguageModel[];
  }
}

function taskMatch(model: AnyModel, task: string | undefined): boolean {
  if (!task) return true;
  if (!model.supportedTasks || model.supportedTasks.length === 0) return true;
  return model.supportedTasks.includes(task);
}

const findModel: CapabilityExport = {
  spec: {
    name: "find_model",
    description:
      "Find a real {provider, model_id} for a generic AI node by capability. Returns models from providers the user has configured, ranked by recommended/downloaded/preferences. Call this before adding any generic AI node (TextToImage, TextToVideo, TextToSpeech, etc.).",
    inputSchema: FIND_MODEL_INPUT_SCHEMA,
    category: "read",
    userMessage: (params) =>
      `Looking up models for capability: ${String(params["capability"])}`
  },
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
        ? (params["task"] as string)
        : undefined;
    const providerHint =
      typeof params["provider_hint"] === "string"
        ? (params["provider_hint"] as string)
        : undefined;
    const modelHintRaw = params["model_hint"];
    const modelHints: Set<string> = new Set(
      typeof modelHintRaw === "string"
        ? [modelHintRaw]
        : Array.isArray(modelHintRaw)
          ? (modelHintRaw.filter((x) => typeof x === "string") as string[])
          : []
    );
    const preferLocal = params["prefer_local"] === true;
    const limit =
      typeof params["limit"] === "number" && params["limit"] > 0
        ? Math.floor(params["limit"] as number)
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
    const collected: FindModelResult[] = [];

    for (const [providerId, instance] of providerEntries) {
      let supports: boolean;
      try {
        supports = instance
          .getCapabilities()
          .includes(capability as ProviderCapability);
      } catch {
        continue;
      }
      if (!supports) continue;

      let models: AnyModel[];
      try {
        models = await fetchModelsForCapability(instance, capability);
      } catch {
        continue;
      }

      for (const m of models) {
        if (!taskMatch(m, task)) continue;
        const recommended = recommendedSet.has(`${providerId}::${m.id}`);
        const downloaded = LOCAL_PROVIDER_IDS.has(providerId);

        let score = 0;
        if (recommended) score += 100;
        if (downloaded) score += 30;
        // Explicit user preferences outrank the default recommended bonus.
        if (providerHint && providerId === providerHint) score += 200;
        if (modelHints.has(m.id)) score += 250;
        if (preferLocal && LOCAL_PROVIDER_IDS.has(providerId)) score += 150;
        else if (preferLocal && !LOCAL_PROVIDER_IDS.has(providerId)) score -= 5;

        collected.push({
          provider: providerId,
          model_id: m.id,
          name: m.name,
          downloaded,
          recommended,
          score
        });
      }
    }

    collected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.provider !== b.provider)
        return a.provider.localeCompare(b.provider);
      return a.model_id.localeCompare(b.model_id);
    });

    return {
      capability,
      total: collected.length,
      results: collected.slice(0, limit)
    };
  }
};

// ---------------------------------------------------------------------------
// list_models
// ---------------------------------------------------------------------------

const MODEL_TYPES = [
  "language",
  "image",
  "video",
  "tts",
  "music",
  "asr",
  "embedding"
] as const;

type ModelType = (typeof MODEL_TYPES)[number];

/** Names an agent is likely to guess, mapped onto the canonical type. */
const MODEL_TYPE_ALIASES: Record<string, ModelType> = {
  llm: "language",
  text: "language",
  language_model: "language",
  text_generation: "language",
  image_model: "image",
  video_model: "video",
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
const TYPE_CAPABILITY: Record<ModelType, ProviderCapability> = {
  language: "generate_message",
  image: "text_to_image",
  video: "text_to_video",
  tts: "text_to_speech",
  music: "text_to_music",
  asr: "automatic_speech_recognition",
  embedding: "generate_embedding"
};

async function fetchModelsOfType(
  provider: BaseProvider,
  type: ModelType
): Promise<ListedModelSource[]> {
  switch (type) {
    case "language":
      return (await provider.getAvailableLanguageModels()) as LanguageModel[];
    case "image":
      return (await provider.getAvailableImageModels()) as ImageModel[];
    case "video":
      return (await provider.getAvailableVideoModels()) as VideoModel[];
    case "tts":
      return (await provider.getAvailableTTSModels()) as TTSModel[];
    case "music":
      return (await provider.getAvailableMusicModels()) as MusicModel[];
    case "asr":
      return (await provider.getAvailableASRModels()) as ASRModel[];
    case "embedding":
      return (await provider.getAvailableEmbeddingModels()) as EmbeddingModel[];
  }
}

function normalizeModelType(raw: unknown): ModelType | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const key = raw.trim().toLowerCase();
  if ((MODEL_TYPES as readonly string[]).includes(key)) return key as ModelType;
  return MODEL_TYPE_ALIASES[key] ?? "invalid";
}

const LIST_MODELS_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description:
        "Filter by provider id (e.g. openai, anthropic, ollama). Omit or pass 'all' for every configured provider.",
      default: "all"
    },
    model_type: {
      type: "string" as const,
      enum: [...MODEL_TYPES],
      description:
        "Filter by model type. Omit to list every type the providers offer."
    },
    downloaded_only: {
      type: "boolean" as const,
      description:
        "Only return models served by a local provider (ollama, lmstudio, vllm, llama.cpp, huggingface).",
      default: false
    },
    limit: {
      type: "number" as const,
      description: "Maximum number of models to return (default 50).",
      default: 50
    }
  },
  required: [] as string[]
};

const listModels: CapabilityExport = {
  spec: {
    name: "list_models",
    description:
      "List the AI models available from the providers the user has configured, " +
      "optionally filtered by provider, model type, and download status. Use " +
      "`find_model` instead when you need one model for a specific capability.",
    inputSchema: LIST_MODELS_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const provider = params["provider"] ?? "all";
      const type = params["model_type"];
      return type
        ? `Listing ${String(type)} models from ${String(provider)}`
        : `Listing models from ${String(provider)}`;
    }
  },
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
        ? Math.floor(params["limit"] as number)
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

    for (const [providerId, instance] of entries) {
      const downloaded = LOCAL_PROVIDER_IDS.has(providerId);
      if (downloadedOnly && !downloaded) continue;

      let capabilities: ProviderCapability[];
      try {
        capabilities = instance.getCapabilities();
      } catch {
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

    return {
      total: collected.length,
      truncated: collected.length > limit,
      results: collected.slice(0, limit)
    };
  }
};

// ---------------------------------------------------------------------------
// list_provider_models
// ---------------------------------------------------------------------------

const listProviderModels: CapabilityExport = {
  spec: {
    name: "list_provider_models",
    description: "List available language models from a provider.",
    inputSchema: {
      type: "object" as const,
      properties: {
        provider: {
          type: "string" as const,
          description: "Provider ID (e.g. 'openai', 'anthropic')"
        }
      },
      required: ["provider"]
    },
    category: "read"
  },
  impl: async (run, params) => {
    const providerId = params["provider"];
    if (typeof providerId !== "string") {
      return { success: false, error: "provider must be a string" };
    }

    const provider = providersOf(run)[providerId];
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (
      typeof (provider as unknown as Record<string, unknown>)
        .getAvailableLanguageModels !== "function"
    ) {
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
