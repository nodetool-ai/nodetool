import OpenAI from "openai";
import { createLogger } from "@nodetool/config";
import { OpenAIProvider } from "./openai-provider.js";
import type {
  ImageModel,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.openrouter");

interface OpenRouterProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/** Known image-capable models on OpenRouter. */
const OPENROUTER_IMAGE_MODELS: ImageModel[] = [
  {
    id: "openai/dall-e-3",
    name: "DALL-E 3",
    provider: "openrouter",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "openai/dall-e-2",
    name: "DALL-E 2",
    provider: "openrouter",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "stabilityai/stable-diffusion-xl",
    name: "Stable Diffusion XL",
    provider: "openrouter",
    supportedTasks: ["text_to_image"]
  }
];

export class OpenRouterProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["OPENROUTER_API_KEY"];
  }

  private _routerFetch: typeof fetch;

  constructor(
    secrets: { OPENROUTER_API_KEY?: string },
    options: OpenRouterProviderOptions = {}
  ) {
    const apiKey = secrets.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: "https://openrouter.ai/api/v1",
              defaultHeaders: {
                "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
                "X-Title": "NodeTool"
              }
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "openrouter";
    this._routerFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { OPENROUTER_API_KEY: this.apiKey };
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    const lower = model.toLowerCase();
    if (lower.includes("o1") || lower.includes("o3")) {
      return false;
    }
    return true;
  }

  /**
   * Convert system messages to user messages for o1/o3 models
   * which do not support the system role.
   */
  private convertSystemToUserForReasoningModels(
    messages: Message[],
    model: string
  ): Message[] {
    const lower = model.toLowerCase();
    if (!lower.includes("o1") && !lower.includes("o3")) {
      return messages;
    }
    return messages.map((msg) =>
      msg.role === "system"
        ? {
            ...msg,
            role: "user" as const,
            content: `Instructions: ${typeof msg.content === "string" ? msg.content : ""}`
          }
        : msg
    );
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const convertedMessages = this.convertSystemToUserForReasoningModels(
      args.messages,
      args.model
    );
    return super.generateMessage({ ...args, messages: convertedMessages });
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const convertedMessages = this.convertSystemToUserForReasoningModels(
      args.messages,
      args.model
    );
    yield* super.generateMessages({ ...args, messages: convertedMessages });
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt
    };

    const size = this.resolveImageSize(
      params.width ?? undefined,
      params.height ?? undefined
    );
    if (size) request.size = size;
    if (params.quality) request.quality = params.quality;

    log.debug("OpenRouter textToImage", { model: params.model.id });

    const response = await this.getClient().images.generate(
      request as unknown as OpenAI.Images.ImageGenerateParams
    );

    const item = response.data?.[0];
    if (!item) {
      throw new Error("OpenRouter image generation returned no image data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this._routerFetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("OpenRouter image generation returned no image data.");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return OPENROUTER_IMAGE_MODELS;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._routerFetch(
      "https://openrouter.ai/api/v1/models",
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
          "X-Title": "NodeTool"
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "openrouter"
      }));
  }
}
