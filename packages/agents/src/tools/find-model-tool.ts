/**
 * FindModelTool — pick a real {provider, model_id} for a generic AI node.
 *
 * The workflow-building agent calls this before adding any of the generic AI
 * nodes (`nodetool.image.TextToImage`, `nodetool.video.TextToVideo`, etc.).
 * It walks the configured providers, asks each one for its capability set,
 * collects models from the providers that support the requested capability,
 * and returns a small ranked list.
 *
 * In-process by design — uses the runtime `BaseProvider` instances directly
 * rather than going over HTTP, so it works identically from the CLI and the
 * WebSocket runner.
 */
import type {
  ASRModel,
  BaseProvider,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  ProcessingContext,
  ProviderCapability,
  TTSModel,
  VideoModel
} from "@nodetool-ai/runtime";
import {
  RECOMMENDED_MODELS,
  providerCapabilities
} from "@nodetool-ai/runtime";
import type { RecommendedUnifiedModel } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

const SUPPORTED_CAPABILITIES = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "text_to_speech",
  "automatic_speech_recognition",
  "generate_embedding",
  "generate_message"
] as const;

type SupportedCapability = (typeof SUPPORTED_CAPABILITIES)[number];

const LOCAL_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "vllm",
  "llama_cpp",
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

const FIND_MODEL_INPUT_SCHEMA = {
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
        "If true, ranks local providers (ollama, lmstudio, vllm, llama_cpp, huggingface) above hosted ones.",
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

function getRecommendedSet(
  capability: SupportedCapability
): Set<string> {
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

export class FindModelTool extends Tool {
  readonly name = "find_model";
  readonly description =
    "Find a real {provider, model_id} for a generic AI node by capability. Returns models from providers the user has configured, ranked by recommended/downloaded/preferences. Call this before adding any generic AI node (TextToImage, TextToVideo, TextToSpeech, etc.).";
  readonly inputSchema: Record<string, unknown> = FIND_MODEL_INPUT_SCHEMA;

  constructor(private readonly providers: Record<string, BaseProvider>) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      typeof params["task"] === "string" ? (params["task"] as string) : undefined;
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

    const providerEntries = Object.entries(this.providers);
    if (providerEntries.length === 0) {
      return {
        capability,
        total: 0,
        results: [],
        note: "No providers configured. Use nodetool.agents.AgentStep for AI work."
      };
    }

    const recommendedSet = getRecommendedSet(capability);
    const collected: FindModelResult[] = [];

    for (const [providerId, instance] of providerEntries) {
      let supports: boolean;
      try {
        supports = providerCapabilities(instance).includes(
          capability as ProviderCapability
        );
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
      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
      return a.model_id.localeCompare(b.model_id);
    });

    return {
      capability,
      total: collected.length,
      results: collected.slice(0, limit)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Looking up models for capability: ${String(params["capability"])}`;
  }
}
