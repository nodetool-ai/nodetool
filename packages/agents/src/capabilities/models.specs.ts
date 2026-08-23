/**
 * The `models` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `models.ts`, so nothing the
 * implementations pull in reaches the entry graph. `models.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const SUPPORTED_CAPABILITIES = [
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

export const FIND_MODEL_INPUT_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    capability: {
      type: "string" as const,
      enum: [...SUPPORTED_CAPABILITIES],
      description:
        "Provider capability needed by the generic AI node (e.g. text_to_image, generate_embedding)."
    },
    query: {
      type: "string" as const,
      description:
        "Free-text search over model id and name (e.g. 'flux schnell', 'gpt image'). All words must appear; separators are ignored, so 'flux 1 schnell' matches 'FLUX.1-schnell'. Matching models are returned first and ranked above everything else."
    },
    task: {
      type: "string" as const,
      description:
        "Optional task hint matched against model.supportedTasks (e.g. 'text_to_image' vs 'image_to_image'). This is NOT a search box — use `query` to search by name."
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
        "Optional preferred model ids. Strongly boosts matching models in the ranking. Matches a full id or a fragment of one."
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
  required: ["capability"]
};

export const MODEL_TYPES = [
  "language",
  "image",
  "video",
  "tts",
  "music",
  "asr",
  "embedding"
] as const;

export const LIST_MODELS_SCHEMA: JsonSchema = {
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
  required: []
};

export const findModelSpec: CapabilitySpec = {
  name: "find_model",
  description:
    "Find a real {provider, model_id} for a generic AI node by capability. Omit `query` and the first result is the best model for the job: image, video, speech and music candidates are ordered by their quality leaderboard for the task. Pass `query` only when the user named a model ('flux schnell'), or `provider_hint` / `model_hint` / `prefer_local` when they stated a preference — those outrank the leaderboard. Results are one row per model, not per route: a model several providers serve appears once, with the others under `alternate_routes`. Each result carries `ref` — the typed value to assign to a node's model property verbatim — and, for ranked models, `canonical`, `ranked_task`, `rank`/`of`, and `alternate_routes` (other providers serving the same model). Call this before adding any generic AI node (TextToImage, TextToVideo, TextToSpeech, etc.) — never guess a model id.",
  inputSchema: FIND_MODEL_INPUT_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Looking up models for capability: ${String(params["capability"])}`
};

export const listModelsSpec: CapabilitySpec = {
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
};

export const listProviderModelsSpec: CapabilitySpec = {
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
};

/** Every spec this module declares, in declaration order. */
export const modelsSpecs: readonly CapabilitySpec[] = [
  findModelSpec,
  listModelsSpec,
  listProviderModelsSpec
];
