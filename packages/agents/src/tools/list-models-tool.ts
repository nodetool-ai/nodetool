/**
 * ListModelsTool — enumerate the models the configured providers offer.
 *
 * In-process by design, like {@link FindModelTool}: it asks each configured
 * `BaseProvider` for its models rather than going over HTTP, so it works
 * identically from the CLI, the WebSocket runner, and the MCP server.
 *
 * `find_model` answers "which model should I use for capability X" and returns
 * a short ranked list. This one answers "what is available", unranked and
 * filterable — the browsing counterpart.
 */
import type {
  ASRModel,
  BaseProvider,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  MusicModel,
  ProcessingContext,
  ProviderCapability,
  TTSModel,
  VideoModel
} from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

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

/**
 * A provider is treated as offering downloaded models when it runs locally.
 * Same approximation `find_model` makes — neither tool inspects the on-disk
 * cache, so both report the same `downloaded` for the same model.
 */
const LOCAL_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "vllm",
  "llama_cpp",
  "node_llama_cpp",
  "huggingface"
]);

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

interface AnyModel {
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
): Promise<AnyModel[]> {
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

export class ListModelsTool extends Tool {
  readonly name = "list_models";
  readonly description =
    "List the AI models available from the providers the user has configured, " +
    "optionally filtered by provider, model type, and download status. Use " +
    "`find_model` instead when you need one model for a specific capability.";
  readonly jsonSchema = {
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

  constructor(private readonly providers: Record<string, BaseProvider>) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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

    const entries = Object.entries(this.providers).filter(
      ([id]) => !providerFilter || id === providerFilter
    );

    if (entries.length === 0) {
      const configured = Object.keys(this.providers).sort();
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

        let models: AnyModel[];
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
      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.model_id.localeCompare(b.model_id);
    });

    return {
      total: collected.length,
      truncated: collected.length > limit,
      results: collected.slice(0, limit)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const provider = params["provider"] ?? "all";
    const type = params["model_type"];
    return type
      ? `Listing ${String(type)} models from ${String(provider)}`
      : `Listing models from ${String(provider)}`;
  }
}
