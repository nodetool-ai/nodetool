/**
 * Provider factory for the chat CLI.
 * Creates the right BaseProvider instance based on name + available API keys.
 */

import type {
  BaseProvider,
  Message,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import {
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  GeminiProvider,
  MistralProvider,
  GroqProvider,
  MoonshotProvider,
  AkiProvider,
  LMStudioProvider,
  ClaudeAgentProvider,
  BaseProvider as BaseProviderClass
} from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import { getSecret } from "@nodetool-ai/models";
import type { WebSocketChatClient } from "./websocket-client.js";

export const KNOWN_PROVIDERS = [
  "anthropic",
  "openai",
  "ollama",
  "gemini",
  "mistral",
  "lmstudio",
  "groq",
  "moonshot",
  "aki",
  "claude_agent"
] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/** Default models for each provider. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4",
  ollama: "qwen-3.5:4b",
  gemini: "gemini-2.5-flash",
  mistral: "mistral-large-latest",
  lmstudio: "qwen/qwen3.5-9b",
  groq: "llama-3.3-70b-versatile",
  moonshot: "kimi-k2.5",
  aki: "llama3_chat",
  claude_agent: "claude-opus-4-6"
};

/** Resolve a secret: encrypted DB first (user "1"), then env var. */
async function resolveKey(key: string): Promise<string | undefined> {
  return (await getSecret(key, "1")) ?? undefined;
}

export async function createProvider(
  providerId: string
): Promise<BaseProvider> {
  switch (providerId.toLowerCase()) {
    case "anthropic":
      return new AnthropicProvider({
        ANTHROPIC_API_KEY: await resolveKey("ANTHROPIC_API_KEY")
      });
    case "openai":
      return new OpenAIProvider({
        OPENAI_API_KEY: await resolveKey("OPENAI_API_KEY")
      });
    case "ollama":
      return new OllamaProvider({
        OLLAMA_API_URL:
          (await resolveKey("OLLAMA_API_URL")) ?? "http://127.0.0.1:11434"
      });
    case "gemini":
      return new GeminiProvider({
        GEMINI_API_KEY: await resolveKey("GEMINI_API_KEY")
      });
    case "lmstudio":
      return new LMStudioProvider({}, { baseURL: "http://127.0.0.1:1234" })
    case "mistral":
      return new MistralProvider({
        MISTRAL_API_KEY: await resolveKey("MISTRAL_API_KEY")
      });
    case "groq":
      return new GroqProvider({
        GROQ_API_KEY: await resolveKey("GROQ_API_KEY")
      });
    case "moonshot":
      return new MoonshotProvider({
        KIMI_API_KEY: await resolveKey("KIMI_API_KEY")
      });
    case "aki":
      return new AkiProvider({
        AKI_API_KEY: await resolveKey("AKI_API_KEY")
      });
    case "claude_agent":
      return new ClaudeAgentProvider();
    default:
      return new OllamaProvider({
        OLLAMA_API_URL:
          (await resolveKey("OLLAMA_API_URL")) ?? "http://127.0.0.1:11434"
      });
  }
}

/**
 * Build a map of `{providerId -> BaseProvider}` for use by the agent's
 * `find_model` tool. Includes local providers (always reachable) plus any
 * hosted provider with a resolved API key in env or the secrets DB.
 *
 * Provider instances are constructed eagerly. If a key is wrong/expired,
 * the model-listing call inside `FindModelTool` is wrapped in try/catch
 * and the provider is silently skipped at lookup time.
 */
export async function buildConfiguredProviders(): Promise<
  Record<string, BaseProvider>
> {
  const result: Record<string, BaseProvider> = {};
  // Local providers — always available.
  result["ollama"] = await createProvider("ollama");
  result["lmstudio"] = await createProvider("lmstudio");
  // Hosted — include only when a key resolves.
  const hostedChecks: Array<[string, string]> = [
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["gemini", "GEMINI_API_KEY"],
    ["mistral", "MISTRAL_API_KEY"],
    ["groq", "GROQ_API_KEY"],
    ["moonshot", "KIMI_API_KEY"],
    ["aki", "AKI_API_KEY"]
  ];
  for (const [id, key] of hostedChecks) {
    const value = await resolveKey(key);
    if (value) {
      result[id] = await createProvider(id);
    }
  }
  return result;
}

/** Check which providers have API keys configured (env only — fast sync check). */
export function availableProviders(): string[] {
  const available: string[] = [];
  if (process.env["ANTHROPIC_API_KEY"]) available.push("anthropic");
  if (process.env["OPENAI_API_KEY"]) available.push("openai");
  if (process.env["GEMINI_API_KEY"]) available.push("gemini");
  if (process.env["MISTRAL_API_KEY"]) available.push("mistral");
  if (process.env["GROQ_API_KEY"]) available.push("groq");
  if (process.env["KIMI_API_KEY"]) available.push("moonshot");
  if (process.env["AKI_API_KEY"]) available.push("aki");
  available.push("lmstudio"); // always available (local)
  available.push("ollama"); // always available (local)
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
