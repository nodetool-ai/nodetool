/**
 * AKI.IO provider — wraps the official `@aki-io/aki-io` SDK.
 *
 * AKI models are exposed as endpoints (e.g. `llama3_chat`). Each request
 * targets one endpoint, so we spin up an `AkiClient` per model. Messages map
 * onto AKI's `chat_context` (system/user/assistant) and the last attached
 * image rides along in the `image` field.
 *
 * Docs: https://aki.io/docs
 */

import { AkiClient } from "@aki-io/aki-io";
import type {
  AkiClientConfig,
  ApiRequestParams,
  ChatMessage
} from "@aki-io/aki-io";
import type { Chunk } from "@nodetool/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  ImageModel,
  Message,
  ProviderStreamItem,
  ProviderTool
} from "./types.js";

interface AkiProviderOptions {
  clientFactory?: (config: AkiClientConfig) => AkiClient;
}

function uint8ToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

export class AkiProvider extends BaseProvider {
  private static readonly DEFAULT_LANGUAGE_MODELS: LanguageModel[] = [
    { id: "llama3_chat", name: "Llama 3 Chat", provider: "aki" }
  ];

  static override requiredSecrets(): string[] {
    return ["AKI_API_KEY"];
  }

  protected readonly apiKey: string;
  private readonly _clientFactory: (config: AkiClientConfig) => AkiClient;

  constructor(
    secrets: { AKI_API_KEY?: string },
    options: AkiProviderOptions = {}
  ) {
    super("aki");
    const apiKey = secrets.AKI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("AKI_API_KEY is not configured");
    }
    this.apiKey = apiKey;
    this._clientFactory =
      options.clientFactory ?? ((config) => new AkiClient(config));
  }

  override getContainerEnv(): Record<string, string> {
    return { AKI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return false;
  }

  /** Create a fresh AkiClient targeting the given endpoint (= model id). */
  private makeClient(endpointName: string): AkiClient {
    const config: AkiClientConfig = {
      endpointName,
      apiKey: this.apiKey,
      raiseExceptions: true,
      returnToolCallDict: true
    };
    return this._clientFactory(config);
  }

  /**
   * Convert NodeTool `Message[]` into AKI's chat format. AKI does not model
   * `tool` messages or multi-part content, so image parts are collapsed into
   * the single `image` field (last image wins) and text parts are joined.
   */
  private toChatContext(messages: Message[]): {
    chatContext: ChatMessage[];
    image: string | undefined;
  } {
    const chatContext: ChatMessage[] = [];
    let image: string | undefined;

    for (const msg of messages) {
      if (msg.role === "tool") continue;
      const role: ChatMessage["role"] =
        msg.role === "system"
          ? "system"
          : msg.role === "assistant"
            ? "assistant"
            : "user";

      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const parts: string[] = [];
        for (const part of msg.content) {
          if (part.type === "text") {
            parts.push(part.text);
          } else if (part.type === "image_url") {
            const data = part.image.data;
            if (typeof data === "string") {
              image = data;
            } else if (data instanceof Uint8Array) {
              image = uint8ToBase64(data);
            } else if (part.image.uri) {
              image = part.image.uri;
            }
          }
        }
        content = parts.join("\n");
      }

      chatContext.push({ role, content });
    }

    return { chatContext, image };
  }

  private buildParams(args: {
    messages: Message[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): ApiRequestParams {
    const { chatContext, image } = this.toChatContext(args.messages);
    const params: ApiRequestParams = { chat_context: chatContext };
    if (image) params.image = image;
    if (args.maxTokens != null) params.max_gen_tokens = args.maxTokens;
    if (args.temperature != null) params.temperature = args.temperature;
    if (args.topP != null) params.top_p = args.topP;
    return params;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): Promise<Message> {
    const client = this.makeClient(args.model);
    const params = this.buildParams(args);
    const response = await client.doApiRequest(params);
    if (!response.success) {
      throw new Error(
        response.error ??
          `Aki request failed (code ${response.error_code ?? "unknown"})`
      );
    }
    if (typeof response.num_generated_tokens === "number") {
      this.trackUsage(args.model, {
        inputTokens: response.prompt_length ?? 0,
        outputTokens: response.num_generated_tokens
      });
    }
    return {
      role: "assistant",
      content: response.text ?? ""
    };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): AsyncGenerator<ProviderStreamItem> {
    const client = this.makeClient(args.model);
    const params = this.buildParams(args);

    let emitted = "";
    let errorMessage: string | undefined;

    for await (const update of client.getApiRequestGenerator(params)) {
      const u = update as Record<string, unknown>;
      if (u.success === false && typeof u.error === "string") {
        errorMessage = u.error;
        break;
      }
      const progressData = (u.progress_data ?? u.result_data) as
        | Record<string, unknown>
        | undefined;
      const text =
        typeof progressData?.["text"] === "string"
          ? (progressData["text"] as string)
          : undefined;
      if (text && text.length > emitted.length) {
        const delta = text.slice(emitted.length);
        emitted = text;
        yield { type: "chunk", content: delta, done: false } as Chunk;
      }
    }

    if (errorMessage) throw new Error(errorMessage);
    yield { type: "chunk", content: "", done: true } as Chunk;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    // getEndpointList ignores the endpointName, but AkiClient requires one.
    const client = this.makeClient("llama3_chat");
    try {
      const endpoints = await client.getEndpointList();
      const list = endpoints
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.trim().length > 0 &&
            !AkiProvider.isImageEndpoint(id)
        )
        .map((id) => {
          const normalizedId = id.trim();
          return { id: normalizedId, name: normalizedId, provider: "aki" };
        });
      if (list.length > 0) {
        return list;
      }
    } catch {
      // Endpoint discovery can fail transiently; fall through to static default.
    }
    return AkiProvider.DEFAULT_LANGUAGE_MODELS;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    // getEndpointList ignores the endpointName, but AkiClient requires one.
    const client = this.makeClient("llama3_chat");
    try {
      const endpoints = await client.getEndpointList();
      return endpoints
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.trim().length > 0 &&
            AkiProvider.isImageEndpoint(id)
        )
        .map((id) => {
          const normalizedId = id.trim();
          return {
            id: normalizedId,
            name: normalizedId,
            provider: "aki",
            supportedTasks: ["text_to_image"]
          };
        });
    } catch {
      // If endpoint discovery fails, avoid breaking image-model consumers.
      return [];
    }
  }

  private static isImageEndpoint(endpointId: string): boolean {
    // AKI endpoint names typically encode modality in the suffix, e.g.
    // `llama3_chat` (language) vs `sdxl_img` / `flux-text2img` (image).
    // Keep this suffix list aligned with AKI endpoint naming conventions.
    const normalized = endpointId.trim().toLowerCase();
    // Drop empty tokens from leading/trailing delimiters like "model_".
    const parts = normalized.split(/[_-]+/).filter(Boolean);
    const tail = parts.length > 0 ? parts[parts.length - 1] : "";
    return (
      tail === "img" ||
      tail === "image" ||
      tail === "txt2img" ||
      tail === "text2img" ||
      tail === "img2img"
    );
  }
}
