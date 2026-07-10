/**
 * Base class for providers that speak the OpenAI Chat Completions dialect
 * against a non-OpenAI endpoint (Groq, Cerebras, xAI, Mistral, DeepSeek, …).
 *
 * Chat — the only surface these providers ever used the `openai` npm package
 * for — runs on the internal {@link OpenAICompatClient} over `fetch`. The SDK
 * client inherited from {@link OpenAIProvider} remains as a lazily-created
 * fallback for the OpenAI-compatible media/embedding endpoints some gateways
 * also expose (Together ASR, OpenRouter images, Mistral embeddings); it is
 * never constructed on the chat path.
 */
import OpenAI from "openai";
import type { Chunk } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { OpenAIProvider } from "./openai-provider.js";
import {
  OpenAICompatClient,
  type ChatCompletionsRequest
} from "./openai-compat/index.js";
import type {
  Message,
  ProviderId,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";
import type { BaseProvider } from "./base-provider.js";

const log = createLogger("nodetool.runtime.providers.openai-compat");

export interface OpenAICompatConfig {
  /** Provider id reported by this instance (e.g. `"groq"`). */
  providerId: ProviderId;
  apiKey: string;
  /** Chat endpoint root, e.g. `https://api.groq.com/openai/v1`. */
  baseURL: string;
  /** Extra headers on every chat request (gateway attribution etc.). */
  defaultHeaders?: Record<string, string>;
}

export interface OpenAICompatProviderOptions {
  /** SDK client used only by inherited non-chat surfaces (images, ASR, …). */
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
  /** Internal chat client override (tests). */
  compatClient?: OpenAICompatClient;
}

interface MutableToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class OpenAICompatProvider extends OpenAIProvider {
  private _compatClient: OpenAICompatClient | null;
  private readonly _compatConfig: OpenAICompatConfig;
  private readonly _compatFetch: typeof fetch;

  constructor(
    config: OpenAICompatConfig,
    options: OpenAICompatProviderOptions = {}
  ) {
    super(
      { OPENAI_API_KEY: config.apiKey },
      {
        providerId: config.providerId,
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: config.baseURL,
              ...(config.defaultHeaders
                ? { defaultHeaders: config.defaultHeaders }
                : {})
            })),
        fetchFn: options.fetchFn
      }
    );
    this._compatConfig = config;
    this._compatClient = options.compatClient ?? null;
    this._compatFetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  protected getCompatClient(): OpenAICompatClient {
    if (!this._compatClient) {
      this._compatClient = new OpenAICompatClient({
        baseURL: this._compatConfig.baseURL,
        apiKey: this._compatConfig.apiKey,
        defaultHeaders: this._compatConfig.defaultHeaders,
        fetchFn: this._compatFetch
      });
    }
    return this._compatClient;
  }

  /** Shared request assembly for both streaming and non-streaming chat. */
  private async buildChatRequest(
    args: {
      messages: Message[];
      model: string;
      tools?: ProviderTool[];
      toolChoice?: string | "any";
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
      audio?: Record<string, unknown>;
    },
    stream: boolean
  ): Promise<ChatCompletionsRequest> {
    const {
      model,
      tools = [],
      toolChoice,
      maxTokens = 16384,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty,
      audio
    } = args;

    const messages = this.convertSystemToUserForOModels(args.messages, model);
    const openaiMessages = await Promise.all(
      messages.map((m) => this.convertMessage(m))
    );

    const request: ChatCompletionsRequest = {
      model,
      messages: openaiMessages,
      max_completion_tokens: maxTokens,
      stream
    };
    if (stream) request.stream_options = { include_usage: true };

    if (temperature != null) request.temperature = temperature;
    if (topP != null) request.top_p = topP;
    if (presencePenalty != null) request.presence_penalty = presencePenalty;
    if (frequencyPenalty != null) request.frequency_penalty = frequencyPenalty;

    if (audio) {
      request.audio = audio;
      request.modalities = ["text", "audio"];
    }

    if (tools.length > 0 && (await this.hasToolSupport(model))) {
      request.tools = this.formatTools(tools);
      if (!stream && toolChoice) {
        request.tool_choice =
          toolChoice === "any"
            ? "required"
            : { type: "function", function: { name: toolChoice } };
      }
    }

    return request;
  }

  override async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    const { model } = args;
    const request = await this.buildChatRequest(args, true);

    log.debug("OpenAI-compatible chat request", {
      provider: this.provider,
      model
    });

    this.recordRequestPayload(request);
    const stream = this.getCompatClient().chatCompletionsStream(request);

    const deltaToolCalls = new Map<number, MutableToolCall>();

    for await (const chunk of stream) {
      if (chunk.usage) {
        this.trackUsage(model, {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
        });
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.audio?.data) {
        const audioChunk: Chunk = {
          type: "chunk",
          content_type: "audio",
          content: String(delta.audio.data)
        };
        yield audioChunk;
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const index = Number(tc.index ?? 0);
          const current = deltaToolCalls.get(index) ?? {
            id: String(tc.id ?? ""),
            name: String(tc.function?.name ?? ""),
            arguments: ""
          };

          if (tc.id) current.id = String(tc.id);
          if (tc.function?.name) current.name = String(tc.function.name);
          if (tc.function?.arguments)
            current.arguments += String(tc.function.arguments);

          deltaToolCalls.set(index, current);
        }
      }

      if (delta?.content !== undefined || choice.finish_reason === "stop") {
        const item: Chunk = {
          type: "chunk",
          content: String(delta?.content ?? ""),
          done: choice.finish_reason === "stop"
        };
        yield item;
      }

      if (choice.finish_reason === "tool_calls") {
        for (const call of deltaToolCalls.values()) {
          const toolCall: ToolCall = this.buildToolCall(
            call.id,
            call.name,
            call.arguments
          );
          yield toolCall;
        }
        deltaToolCalls.clear();
      }

      // Always emit a terminal `done: true` chunk when the completion
      // finishes, regardless of reason. "stop" already emits one above; for
      // every other terminal reason (tool_calls, length, content_filter)
      // emit one here so consumers get a consistent end-of-stream marker.
      if (choice.finish_reason && choice.finish_reason !== "stop") {
        const doneChunk: Chunk = { type: "chunk", content: "", done: true };
        yield doneChunk;
      }
    }
  }

  override async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    const { model } = args;
    const request = await this.buildChatRequest(args, false);

    log.debug("OpenAI-compatible chat request", {
      provider: this.provider,
      model
    });

    this.recordRequestPayload(request);
    const completion = await this.getCompatClient().chatCompletions(request);

    const choice = completion.choices?.[0];
    if (!choice) {
      throw new Error(`${this.provider} returned no choices`);
    }

    const usage = completion.usage;
    if (usage) {
      this.trackUsage(model, {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
      });
    }

    const responseMessage = choice.message;
    const toolCalls = Array.isArray(responseMessage?.tool_calls)
      ? responseMessage.tool_calls
          .filter((tc) => tc.type === "function")
          .map((tc) =>
            this.buildToolCall(
              String(tc.id ?? ""),
              String(tc.function?.name ?? ""),
              tc.function?.arguments ?? undefined
            )
          )
      : undefined;

    return {
      role: "assistant",
      content: responseMessage?.content ?? null,
      toolCalls
    };
  }
}
