/**
 * Provider factory for the chat CLI.
 *
 * Construction and credential wiring are delegated to the runtime provider
 * registry (`@nodetool-ai/runtime`), so every provider registered there is
 * reachable from the CLI without a hand-maintained switch. The curated lists
 * below (`KNOWN_PROVIDERS`, `DEFAULT_MODELS`) only drive the interactive
 * autocomplete and default-model hints for the common chat providers.
 */

import type {
  BaseProvider,
  GetSecret,
  Message,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import {
  BaseProvider as BaseProviderClass,
  createPythonBridge,
  getProvider,
  getProviderSecretKey,
  isProviderConfigured,
  listRegisteredProviderIds,
  PythonProvider,
  registerProvider
} from "@nodetool-ai/runtime";
import type { Chunk, UnifiedModel } from "@nodetool-ai/protocol";
import { getSecret } from "@nodetool-ai/models";
import type { WebSocketChatClient } from "./websocket-client.js";

/**
 * Chat-capable providers surfaced in interactive autocomplete (`/provider <tab>`)
 * and the `--provider` help text. This is a curated subset of the registry —
 * the well-known LLM chat APIs plus the local servers. Any other registered
 * provider (evolink, vllm, llama_cpp, …) still works when passed explicitly via
 * `--provider <id>`; it just isn't listed here.
 */
export const KNOWN_PROVIDERS = [
  "anthropic",
  "claude_agent_sdk",
  "openai",
  "codex",
  "gemini",
  "xai",
  "groq",
  "mistral",
  "deepseek",
  "moonshot",
  "minimax",
  "cerebras",
  "gmi",
  "together",
  "openrouter",
  "huggingface",
  "replicate",
  "kie",
  "aki",
  "ollama",
  "lmstudio",
  "mlx",
  "node_llama_cpp"
] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/**
 * Providers reachable without an API key: the local servers plus the Claude
 * Agent SDK (which authenticates with the machine's logged-in `claude` CLI
 * subscription instead of a key).
 */
const LOCAL_PROVIDERS: readonly string[] = [
  "lmstudio",
  "ollama",
  "mlx",
  "claude_agent_sdk",
  "node_llama_cpp"
];

/**
 * Providers served only through the local Python worker (no TS implementation).
 * They aren't in the runtime registry until the stdio bridge connects and
 * advertises them, so `createProvider` connects the bridge on demand for these.
 */
const PYTHON_ONLY_PROVIDERS: readonly string[] = ["mlx"];

/** MLX (and other Python-local models) only run on Apple Silicon. */
function isAppleSilicon(): boolean {
  return process.platform === "darwin" && process.arch === "arm64";
}

/** Default model shown when switching to a provider in interactive mode. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  claude_agent_sdk: "sonnet",
  openai: "gpt-5.4",
  codex: "gpt-5.5",
  gemini: "gemini-2.5-flash",
  xai: "grok-4",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  deepseek: "deepseek-chat",
  moonshot: "kimi-k2.7",
  minimax: "MiniMax-M2",
  cerebras: "llama-3.3-70b",
  gmi: "meta-llama/Llama-3.3-70B-Instruct",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  openrouter: "openai/gpt-5.4-mini",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  replicate: "meta/meta-llama-3-70b-instruct",
  kie: "gpt-5-5",
  aki: "llama3_chat",
  ollama: "qwen-3.5:4b",
  lmstudio: "qwen/qwen3.5-9b",
  mlx: "mlx-community/Qwen3.5-0.8B-OptiQ-4bit",
  node_llama_cpp: "qwen2.5-3b-instruct-q4_k_m.gguf"
};

/** Resolve a secret from the encrypted DB (user "1"); env fallback handled by the registry. */
const resolveForUser1: GetSecret = (key) => getSecret(key, "1");

/**
 * Lazily spawn the local Python worker bridge and register the Python-only
 * providers it advertises (e.g. `mlx`, local HuggingFace) into the runtime
 * registry. Idempotent: the bridge is connected once per process and the
 * promise cached. On failure the cache is cleared so a later call can retry,
 * and the error is rethrown so the caller can explain why the provider is
 * unavailable.
 */
let pythonProvidersPromise: Promise<void> | null = null;
async function ensurePythonProvidersRegistered(): Promise<void> {
  if (!pythonProvidersPromise) {
    pythonProvidersPromise = (async () => {
      const bridge = createPythonBridge();
      await bridge.connect();
      for (const info of await bridge.listProviders()) {
        // Don't shadow a TS-native provider that owns the same id (e.g. the
        // hosted HuggingFace provider vs. the Python local one).
        if (listRegisteredProviderIds().includes(info.id)) continue;
        registerProvider(info.id, PythonProvider as never, {
          _bridge: bridge,
          _id: info.id
        });
      }
    })().catch((err) => {
      pythonProvidersPromise = null;
      throw err;
    });
  }
  return pythonProvidersPromise;
}

/** Build a registered provider, rejecting unknown ids instead of falling back. */
export async function createProviderStrict(
  providerId: string
): Promise<BaseProvider> {
  const id = providerId.toLowerCase();
  if (
    PYTHON_ONLY_PROVIDERS.includes(id) &&
    !listRegisteredProviderIds().includes(id)
  ) {
    try {
      await ensurePythonProvidersRegistered();
    } catch (err) {
      throw new Error(
        `Provider "${id}" needs the local Python worker, which could not be started ` +
          `(${err instanceof Error ? err.message : String(err)}). Ensure the nodetool ` +
          `Python environment is installed and activated (e.g. \`conda activate nodetool\`).`
      );
    }
    if (!listRegisteredProviderIds().includes(id)) {
      throw new Error(
        `Provider "${id}" is not available from the Python worker on this machine` +
          (id === "mlx" && !isAppleSilicon() ? " (MLX requires Apple Silicon)." : ".")
      );
    }
  }
  if (!listRegisteredProviderIds().includes(id)) {
    throw new Error(`Unknown provider "${id}"`);
  }
  return getProvider(id, resolveForUser1);
}

/** Build a provider, preserving the chat CLI's Ollama fallback for unknown ids. */
export async function createProvider(
  providerId: string
): Promise<BaseProvider> {
  const id = providerId.toLowerCase();
  if (
    !PYTHON_ONLY_PROVIDERS.includes(id) &&
    !listRegisteredProviderIds().includes(id)
  ) {
    return getProvider("ollama", resolveForUser1);
  }
  return createProviderStrict(id);
}

/**
 * The secret/env key a provider needs (e.g. `"OPENROUTER_API_KEY"`), or null
 * for local/keyless providers. Used to tell the user which key to set when a
 * provider can't be constructed.
 */
export function providerSecretKey(providerId: string): string | null {
  return getProviderSecretKey(providerId.toLowerCase());
}

/**
 * Build a map of `{providerId -> BaseProvider}` for use by the agent's
 * `find_model` tool and media tool dispatch. Includes every registered
 * provider whose required credentials resolve (local providers have none, so
 * they're always present). Construction failures are skipped silently.
 */
export async function buildConfiguredProviders(): Promise<
  Record<string, BaseProvider>
> {
  const result: Record<string, BaseProvider> = {};
  for (const id of listRegisteredProviderIds()) {
    try {
      if (await isProviderConfigured(id, resolveForUser1)) {
        result[id] = await getProvider(id, resolveForUser1);
      }
    } catch {
      // Provider failed to construct (bad/missing config) — skip it.
    }
  }
  return result;
}

export type ProviderModelKind =
  | "llm"
  | "image"
  | "tts"
  | "asr"
  | "video"
  | "embedding";

export async function listConfiguredProviderInfo(): Promise<
  Array<{ provider: string; capabilities: string[] }>
> {
  const providers = await buildConfiguredProviders();
  return Object.entries(providers).map(([provider, instance]) => ({
    provider,
    capabilities: instance.getCapabilities()
  }));
}

function toUnifiedModel(
  model: {
    id: string;
    name: string;
    provider: string;
    voices?: string[];
    supportedTasks?: string[];
    durations?: number[];
    resolutions?: string[];
    aspectRatios?: string[];
  },
  type: string
): UnifiedModel {
  return {
    id: model.id,
    type,
    name: model.name,
    provider: model.provider,
    repo_id: null,
    path: null,
    downloaded:
      model.provider === "ollama" ||
      model.provider === "llama_cpp" ||
      model.provider === "node_llama_cpp",
    tags: [model.provider],
    voices: model.voices ?? null,
    supported_tasks: model.supportedTasks ?? null,
    durations: model.durations ?? null,
    resolutions: model.resolutions ?? null,
    aspect_ratios: model.aspectRatios ?? null
  };
}

export async function listProviderModels(
  providerId: string,
  kind: ProviderModelKind
): Promise<UnifiedModel[]> {
  const provider = await createProviderStrict(providerId);
  if (kind === "llm") {
    const models = await provider.getAvailableLanguageModels();
    const toolSupport = await Promise.all(
      models.map((model) => provider.hasToolSupport(model.id).catch(() => null))
    );
    return models.map((model, index) => ({
      ...toUnifiedModel(model, "language_model"),
      supports_tools: toolSupport[index]
    }));
  }

  switch (kind) {
    case "image":
      return (await provider.getAvailableImageModels()).map((model) =>
        toUnifiedModel(model, "image_model")
      );
    case "tts":
      return (await provider.getAvailableTTSModels()).map((model) =>
        toUnifiedModel(model, "tts_model")
      );
    case "asr":
      return (await provider.getAvailableASRModels()).map((model) =>
        toUnifiedModel(model, "asr_model")
      );
    case "video":
      return (await provider.getAvailableVideoModels()).map((model) =>
        toUnifiedModel(model, "video_model")
      );
    case "embedding":
      return (await provider.getAvailableEmbeddingModels()).map((model) =>
        toUnifiedModel(model, "embedding_model")
      );
  }
}

/**
 * The set of chat providers currently usable: local/keyless providers plus any
 * hosted provider whose key resolves from the encrypted DB or env. Async
 * because it consults the secret store; the interactive picker uses this to
 * disable providers that can't be selected. Mirrors `availableProviders()` but
 * also picks up DB-stored keys (not just env).
 */
export async function configuredProviderIds(): Promise<Set<string>> {
  const flags = await Promise.all(
    KNOWN_PROVIDERS.map((id) => {
      // mlx is keyless but registered lazily (via the Python bridge), so
      // isProviderConfigured() reports false until the bridge connects. Treat
      // it as selectable on the only platform that can run it.
      if (id === "mlx") return Promise.resolve(isAppleSilicon());
      return isProviderConfigured(id, resolveForUser1);
    })
  );
  return new Set(KNOWN_PROVIDERS.filter((_, i) => flags[i]));
}

/**
 * Which chat providers have credentials configured (env-only — a fast sync
 * check used by autocomplete). Local providers are always listed, with
 * `ollama` kept last for stable display ordering.
 */
export function availableProviders(): string[] {
  const available: string[] = [];
  for (const id of KNOWN_PROVIDERS) {
    if (LOCAL_PROVIDERS.includes(id)) continue;
    const key = getProviderSecretKey(id);
    if (key && process.env[key]) available.push(id);
  }
  if (isAppleSilicon()) available.push("mlx");
  // Keyless: surfaced like the local servers (the `claude` CLI carries its own
  // subscription auth).
  available.push("claude_agent_sdk");
  available.push("lmstudio");
  available.push("ollama");
  return available;
}

/**
 * A provider that routes all inference through the NodeTool WebSocket server.
 * Used in agent mode when --url is passed: the server handles LLM calls,
 * so no local API keys are required.
 */
export class WebSocketProvider extends BaseProviderClass {
  constructor(
    private readonly client: WebSocketChatClient,
    private readonly defaultModel: string,
    private readonly providerId: string
  ) {
    // ProviderId = "openai" | "anthropic" | ... | string, which collapses to string
    super(providerId as string);
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
  }): Promise<Message> {
    let content = "";
    for await (const item of this.generateMessages(args)) {
      if ("type" in item && item.type === "chunk") {
        content += (item as Chunk).content ?? "";
      }
    }
    return { role: "assistant", content };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
  }): AsyncGenerator<ProviderStreamItem> {
    const model = args.model || this.defaultModel;
    for await (const event of this.client.inference(
      args.messages,
      model,
      this.providerId,
      args.tools
    )) {
      if (event.type === "chunk") {
        yield { type: "chunk", content: event.content } as Chunk;
      } else if (event.type === "tool_call") {
        yield { id: event.id, name: event.name, args: event.args };
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }
}
