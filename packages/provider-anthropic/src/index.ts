import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { MessageCreateParamsStreaming } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { safeFetch, type TextChunk, type TextProvider, type TextRequest, type TextUsage } from "@nodetool-ai/runtime-core";
import type { CoreNodeDefinition } from "@nodetool-ai/nodes-core";
import type { ServerFeature } from "@nodetool-ai/server-features";

export interface AnthropicTextOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly maxTokens?: number;
  readonly fetch?: typeof fetch;
}

/** Optional official-SDK text adapter using the shared egress policy. */
export class AnthropicTextProvider implements TextProvider {
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(options: AnthropicTextOptions) {
    this.maxTokens = options.maxTokens ?? 4096;
    if (!Number.isSafeInteger(this.maxTokens) || this.maxTokens < 1) {
      throw new Error("Anthropic maxTokens must be a positive integer");
    }
    const transport = options.fetch ?? globalThis.fetch;
    const clientOptions: ClientOptions = {
      apiKey: options.apiKey,
      maxRetries: 0,
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return safeFetch(url, init, 5, transport);
      }
    };
    if (options.baseURL) {
      clientOptions.baseURL = options.baseURL;
    }
    this.client = new Anthropic(clientOptions);
  }

  async *stream(request: TextRequest): AsyncIterable<TextChunk> {
    request.signal.throwIfAborted();
    const system = request.messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
    const messages = request.messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content
    }));
    const parameters: MessageCreateParamsStreaming = {
      model: request.model,
      max_tokens: this.maxTokens,
      messages,
      stream: true
    };
    if (system) {
      parameters.system = system;
    }
    const stream = await this.client.messages.create(parameters, { signal: request.signal });
    let usage: TextUsage = { inputTokens: 0, outputTokens: 0 };
    let stopped = false;
    for await (const event of stream) {
      request.signal.throwIfAborted();
      if (event.type === "message_start") {
        usage = { inputTokens: event.message.usage.input_tokens, outputTokens: event.message.usage.output_tokens };
      } else if (event.type === "message_delta") {
        usage = { ...usage, outputTokens: event.usage.output_tokens };
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { done: false, text: event.delta.text };
      } else if (event.type === "message_stop") {
        stopped = true;
      }
    }
    request.signal.throwIfAborted();
    if (!stopped) {
      throw new Error("Anthropic stream ended without a terminal message");
    }
    yield { done: true, usage };
  }
}

export interface InstalledAnthropicFeatureHost extends AnthropicFeatureHost {
  readonly readSecret: (userId: string, key: string) => Promise<string | undefined>;
}

const installedFeature: ServerFeature<InstalledAnthropicFeatureHost> = {
  descriptor: { id: "provider-anthropic", apiVersion: 1, capabilities: ["provider:anthropic"], nodeTypes: ["anthropic.text.ChatComplete"] },
  activate: host => createAnthropicFeature(async userId => {
    const apiKey = await host.readSecret(userId, "ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("Configure ANTHROPIC_API_KEY in the authenticated user's secrets");
    }
    return new AnthropicTextProvider({ apiKey });
  }).activate(host)
};

export default installedFeature;

export interface AnthropicFeatureHost {
  readonly execution: { readonly register: (definition: CoreNodeDefinition) => void };
}

/** Register the text node only when this installed feature is explicitly configured. */
export function createAnthropicFeature(
  provider: TextProvider | ((userId: string) => TextProvider | Promise<TextProvider>)
): ServerFeature<AnthropicFeatureHost> {
  return {
    descriptor: { id: "provider-anthropic", apiVersion: 1, capabilities: ["provider:anthropic"], nodeTypes: ["anthropic.text.ChatComplete"] },
    activate: host => {
      host.execution.register({
        type: { nodeType: "anthropic.text.ChatComplete", supportsDynamicInputs: true, outputs: { output: "str" }, descriptorDefaults: { input_mode: "buffered", is_streaming_output: true } },
        create: (_node, request) => ({
          process: async () => { throw new Error("Remote text nodes require streaming execution"); },
          async *genProcess(inputs, context) {
            const selected = typeof provider === "function" ? await provider(request.userId) : provider;
            const model = typeof inputs.model === "object" && inputs.model !== null && "id" in inputs.model ? String(inputs.model.id) : String(inputs.model ?? "");
            let output = "";
            for await (const chunk of selected.stream({ model, messages: [{ role: "user", content: String(inputs.prompt ?? inputs.text ?? "") }], signal: context?.signal ?? request.signal })) {
              if (!chunk.done) {
                output += chunk.text;
                yield { output };
              } else {
                request.recordUsage?.(chunk.usage);
              }
            }
          }
        })
      });
    }
  };
}
