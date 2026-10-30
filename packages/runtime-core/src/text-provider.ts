import OpenAI from "openai";
import { safeFetch } from "./safe-url.js";

export interface TextUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface TextRequest {
  readonly model: string;
  readonly messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[];
  readonly signal: AbortSignal;
}

export type TextChunk =
  | { readonly done: false; readonly text: string }
  | { readonly done: true; readonly usage: TextUsage };

/** A remote text-only provider. Binary references remain outside this contract. */
export interface TextProvider {
  stream(request: TextRequest): AsyncIterable<TextChunk>;
}

/** OpenAI-compatible SDK adapter with the shared redirect and egress policy. */
export class OpenAITextProvider implements TextProvider {
  private readonly client: OpenAI;

  constructor(options: { readonly apiKey: string; readonly baseURL?: string; readonly fetch?: typeof fetch }) {
    const transport = options.fetch ?? globalThis.fetch;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: 0,
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return safeFetch(url, init, 5, transport);
      }
    });
  }

  /** List the remote catalog through the same authenticated, cancellable SDK transport. */
  async listModels(signal: AbortSignal): Promise<readonly { id: string; created: number; ownedBy: string }[]> {
    signal.throwIfAborted();
    const models: Array<{ id: string; created: number; ownedBy: string }> = [];
    for await (const model of this.client.models.list({ signal })) {
      signal.throwIfAborted();
      models.push({ id: model.id, created: model.created, ownedBy: model.owned_by });
    }
    signal.throwIfAborted();
    return models;
  }

  async *stream(request: TextRequest): AsyncIterable<TextChunk> {
    request.signal.throwIfAborted();
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: [...request.messages],
      stream: true,
      stream_options: { include_usage: true }
    }, { signal: request.signal });
    let usage: TextUsage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of stream) {
      request.signal.throwIfAborted();
      if (chunk.usage) {
        usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      }
      const text = chunk.choices[0]?.delta.content;
      if (text) {
        yield { done: false, text };
      }
    }
    request.signal.throwIfAborted();
    yield { done: true, usage };
  }
}
