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
  getProvider,
  getProviderSecretKey,
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
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
  "openai",
  "gemini",
  "xai",
  "groq",
  "mistral",
  "deepseek",
  "moonshot",
  "minimax",
  "cerebras",
  "together",
  "openrouter",
  "huggingface",
  "replicate",
  "kie",
  "aki",
  "ollama",
  "lmstudio"
] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/** Local providers that are always reachable without an API key. */
const LOCAL_PROVIDERS: readonly string[] = ["lmstudio", "ollama"];

/** Default model shown when switching to a provider in interactive mode. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4",
  gemini: "gemini-2.5-flash",
  xai: "grok-4",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  deepseek: "deepseek-chat",
  moonshot: "kimi-k2.7",
  minimax: "MiniMax-M2",
  cerebras: "llama-3.3-70b",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  openrouter: "openai/gpt-5.4-mini",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  replicate: "meta/meta-llama-3-70b-instruct",
  kie: "gpt-5-5",
  aki: "llama3_chat",
  ollama: "qwen-3.5:4b",
  lmstudio: "qwen/qwen3.5-9b"
};

/** Resolve a secret from the encrypted DB (user "1"); env fallback handled by the registry. */
const resolveForUser1: GetSecret = (key) => getSecret(key, "1");

/**
 * Build a provider instance by id, resolving credentials via the registry
 * (encrypted DB first, then `process.env`).
 *
 * An unknown/unregistered id (e.g. a typo) falls back to the local Ollama
 * daemon, preserving the CLI's historical default. A *registered* provider that
 * fails to construct — most commonly a missing API key, which several providers
 * enforce in their constructor — surfaces its error to the caller rather than
 * silently masquerading as Ollama (which would list Ollama's models under the
 * requested provider).
 */
export async function createProvider(
  providerId: string
): Promise<BaseProvider> {
  const id = providerId.toLowerCase();
  if (!listRegisteredProviderIds().includes(id)) {
    return getProvider("ollama", resolveForUser1);
  }
  return getProvider(id, resolveForUser1);
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

/**
 * The set of chat providers currently usable: local/keyless providers plus any
 * hosted provider whose key resolves from the encrypted DB or env. Async
 * because it consults the secret store; the interactive picker uses this to
 * disable providers that can't be selected. Mirrors `availableProviders()` but
 * also picks up DB-stored keys (not just env).
 */
export async function configuredProviderIds(): Promise<Set<string>> {
  const flags = await Promise.all(
    KNOWN_PROVIDERS.map((id) => isProviderConfigured(id, resolveForUser1))
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
