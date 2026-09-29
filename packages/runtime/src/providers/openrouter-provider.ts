import type OpenAI from "openai";
import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { bytesToImageDataUri } from "./image-mime.js";
import type {
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams
} from "./types.js";
import { isString } from "@nodetool-ai/protocol";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.openrouter");

/** Known image-capable models on OpenRouter. */
const OPENROUTER_IMAGE_MODELS: ImageModel[] = [
  {
    id: "stabilityai/stable-diffusion-xl",
    name: "Stable Diffusion XL",
    provider: "openrouter",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    provider: "openrouter",
    supportedTasks: ["text_to_image", "image_to_image"]
  }
];

export class OpenRouterProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["OPENROUTER_API_KEY"];
  }

  constructor(
    secrets: { OPENROUTER_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }

    super(
      {
        providerId: "openrouter",
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        // Attribution headers ride every chat request (and the SDK fallback);
        // the same header values are asserted on the /models fetch below.
        // Stryker disable next-line ObjectLiteral
        defaultHeaders: {
          // Stryker disable next-line StringLiteral
          "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
          // Stryker disable next-line StringLiteral
          "X-Title": "NodeTool"
        }
      },
      options
    );
  }

  override getContainerEnv() {
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
            content: `Instructions: ${isString(msg.content) ? msg.content : ""}`
          }
        : msg
    );
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
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
    const size = this.resolveImageSize(
      params.width ?? undefined,
      params.height ?? undefined
    );
    return this.generateImage(params, [], size);
  }

  /**
   * Edit or compose from source images. OpenRouter's image API takes them as
   * `input_references`; entity reference images arrive here already appended
   * to `images` by the base provider.
   */
  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const size = this.resolveImageSize(
      params.targetWidth ?? undefined,
      params.targetHeight ?? undefined
    );
    return this.generateImage(params, images, size);
  }

  private async generateImage(
    params: TextToImageParams | ImageToImageParams,
    inputs: readonly Uint8Array[],
    size: string | null
  ): Promise<Uint8Array> {
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

    if (size) request.size = size;
    if (params.quality) request.quality = params.quality;
    // Gemini image models ignore `size`; OpenRouter reads the shape from here.
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;
    if (inputs.length > 0) {
      request.input_references = inputs.map((bytes) => ({
        type: "image_url",
        image_url: { url: bytesToImageDataUri(bytes) }
      }));
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("OpenRouter image generation", {
      model: params.model.id,
      inputs: inputs.length
    });

    // SAFETY: a dictionary request against the OpenAI SDK's closed image
    // params; OpenRouter is driven through the same client.
    const response = (await this.getClient().images.generate(
      request as unknown as OpenAI.Images.ImageGenerateParams
    )) as OpenAI.Images.ImagesResponse;

    const item = response.data?.[0];
    if (!item) {
      throw new Error("OpenRouter image generation returned no image data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this.compatFetch(item.url);
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
    return this.listCompatModels();
  }
}
