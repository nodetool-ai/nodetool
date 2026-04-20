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

import { readFileSync } from "node:fs";
import { AkiClient, decodeBinary } from "@aki-io/aki-io";
import type {
  AkiClientConfig,
  ApiRequestParams,
  ApiResponse,
  ChatMessage
} from "@aki-io/aki-io";
import { createLogger } from "@nodetool/config";
import type { Chunk } from "@nodetool/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.aki");

interface AkiManifestEntry {
  endpointId: string;
  title: string;
  outputType: string;
  supportedTasks?: string[];
}

function isAkiManifestEntry(value: unknown): value is AkiManifestEntry {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as AkiManifestEntry).endpointId === "string" &&
    typeof (value as AkiManifestEntry).title === "string" &&
    typeof (value as AkiManifestEntry).outputType === "string"
  );
}

const AKI_MANIFEST_URL = new URL("./aki-manifest.json", import.meta.url);

const AKI_FALLBACK_IMAGE_MODELS: ImageModel[] = [
  {
    id: "sdxl_img",
    name: "SDXL",
    provider: "aki",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "flux-text2img",
    name: "FLUX Text to Image",
    provider: "aki",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "flux-img2img",
    name: "FLUX Image to Image",
    provider: "aki",
    supportedTasks: ["image_to_image"]
  }
];

const AKI_FALLBACK_LANGUAGE_MODELS: LanguageModel[] = [
  { id: "llama3_chat", name: "Llama 3 Chat", provider: "aki" }
];
const AKI_DISCOVERY_ENDPOINT = "llama3_chat";

let akiManifestCache: AkiManifestEntry[] | null = null;

interface AkiProviderOptions {
  clientFactory?: (config: AkiClientConfig) => AkiClient;
}

function uint8ToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function dataUriToBase64(uri: string): string {
  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) {
    return uri;
  }
  const header = uri.slice(0, commaIndex);
  const payload = uri.slice(commaIndex + 1);
  if (header.includes(";base64")) {
    return payload;
  }
  return Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");
}

function isLikelyImageEndpoint(endpointId: string): boolean {
  const normalized = endpointId.trim().toLowerCase();
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

function loadAkiManifest(): AkiManifestEntry[] {
  if (akiManifestCache) {
    return akiManifestCache;
  }

  try {
    const raw = Buffer.from(readFileSync(AKI_MANIFEST_URL)).toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      akiManifestCache = [];
      return akiManifestCache;
    }
    akiManifestCache = parsed.filter(isAkiManifestEntry);
    return akiManifestCache;
  } catch (error) {
    log.warn("Failed to load AKI manifest, falling back to defaults", error);
    akiManifestCache = [];
    return akiManifestCache;
  }
}

function manifestLanguageModels(): LanguageModel[] {
  const models = loadAkiManifest()
    .filter((entry) => entry.outputType === "text")
    .map((entry) => ({
      id: entry.endpointId,
      name: entry.title,
      provider: "aki" as const
    }));

  return models.length > 0 ? models : AKI_FALLBACK_LANGUAGE_MODELS;
}

function manifestImageModels(): ImageModel[] {
  const models = loadAkiManifest()
    .filter((entry) => entry.outputType === "image")
    .map((entry) => ({
      id: entry.endpointId,
      name: entry.title,
      provider: "aki" as const,
      supportedTasks:
        entry.supportedTasks && entry.supportedTasks.length > 0
          ? entry.supportedTasks
          : undefined
    }));

  return models.length > 0 ? models : AKI_FALLBACK_IMAGE_MODELS;
}

function getManifestEntryMap(): Map<string, AkiManifestEntry> {
  const map = new Map<string, AkiManifestEntry>();
  for (const entry of loadAkiManifest()) {
    map.set(entry.endpointId, entry);
  }
  return map;
}

function responseImageToBytes(images: ApiResponse["images"]): Uint8Array | null {
  const firstValue: unknown = Array.isArray(images) ? images[0] : images;
  if (!firstValue) {
    return null;
  }
  if (firstValue instanceof Uint8Array) {
    return firstValue;
  }
  if (Buffer.isBuffer(firstValue)) {
    return new Uint8Array(firstValue);
  }
  if (typeof firstValue === "string") {
    const [, decoded] = decodeBinary(firstValue);
    return decoded ? new Uint8Array(decoded) : null;
  }
  return null;
}

export class AkiProvider extends BaseProvider {

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
      outputBinaryFormat: "byteString",
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
  private async toChatContext(messages: Message[]): Promise<{
    chatContext: ChatMessage[];
    image: string | undefined;
  }> {
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
              image = data.startsWith("data:")
                ? dataUriToBase64(data)
                : data;
            } else if (data instanceof Uint8Array) {
              image = uint8ToBase64(data);
            } else if (part.image.uri) {
              image = await this.resolveImageUri(part.image.uri);
            }
          }
        }
        content = parts.join("\n");
      }

      chatContext.push({ role, content });
    }

    return { chatContext, image };
  }

  private async buildParams(args: {
    messages: Message[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): Promise<ApiRequestParams> {
    const { chatContext, image } = await this.toChatContext(args.messages);
    const params: ApiRequestParams = { chat_context: chatContext };
    if (image) params.image = image;
    if (args.maxTokens != null) params.max_gen_tokens = args.maxTokens;
    if (args.temperature != null) params.temperature = args.temperature;
    if (args.topP != null) params.top_p = args.topP;
    return params;
  }

  private async resolveImageUri(uri: string): Promise<string | undefined> {
    const resolved = await this.resolveUri(uri);
    if (resolved.startsWith("data:")) {
      return dataUriToBase64(resolved);
    }
    if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
      try {
        const response = await fetch(resolved);
        if (!response.ok) {
          return undefined;
        }
        return Buffer.from(await response.arrayBuffer()).toString("base64");
      } catch (error) {
        log.debug("Failed to fetch remote AKI image URI", {
          uri: resolved,
          error
        });
        // Best-effort URI normalization; keep request flowing without image.
        return undefined;
      }
    }
    return resolved;
  }

  private async listDiscoveredEndpoints(): Promise<string[]> {
    // SDK requires an endpoint to construct the client, even for listing.
    const client = this.makeClient(AKI_DISCOVERY_ENDPOINT);
    try {
      const endpoints = await client.getEndpointList();
      return endpoints.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      );
    } catch (error) {
      log.debug("AKI endpoint discovery failed", { error });
      // Discovery is optional; caller falls back to manifest/default model lists.
      return [];
    }
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
    const params = await this.buildParams(args);
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
    const params = await this.buildParams(args);

    let emitted = "";
    let errorMessage: string | undefined;
    let promptTokens: number | undefined;
    let generatedTokens: number | undefined;

    for await (const update of client.getApiRequestGenerator(params)) {
      const u = update as Record<string, unknown>;
      if (u.success === false && typeof u.error === "string") {
        errorMessage = u.error;
        break;
      }
      const progressData = (u.progress_data ?? u.result_data) as
        | Record<string, unknown>
        | undefined;
      const promptLength = progressData?.["prompt_length"] ?? u["prompt_length"];
      if (typeof promptLength === "number") {
        promptTokens = promptLength;
      }
      const generatedLength =
        progressData?.["num_generated_tokens"] ?? u["num_generated_tokens"];
      if (typeof generatedLength === "number") {
        generatedTokens = Math.max(generatedTokens ?? 0, generatedLength);
      }
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
    if (typeof generatedTokens === "number") {
      this.trackUsage(args.model, {
        inputTokens: promptTokens ?? 0,
        outputTokens: generatedTokens
      });
    }
    yield { type: "chunk", content: "", done: true } as Chunk;
  }

  private buildImageRequest(
    prompt: string,
    params:
      | TextToImageParams
      | ImageToImageParams,
    image?: Uint8Array
  ): ApiRequestParams {
    const request: ApiRequestParams = {
      prompt_input: prompt
    };
    if (image) {
      request.image = uint8ToBase64(image);
    }

    const width =
      "width" in params
        ? params.width
        : (params as ImageToImageParams).targetWidth;
    const height =
      "height" in params
        ? params.height
        : (params as ImageToImageParams).targetHeight;
    if (width != null) {request.width = width;}
    if (height != null) {request.height = height;}
    if (params.negativePrompt) {request.negative_prompt = params.negativePrompt;}
    if (params.guidanceScale != null) {request.guidance_scale = params.guidanceScale;}
    if (params.numInferenceSteps != null) {
      request.num_inference_steps = params.numInferenceSteps;
    }
    if (params.seed != null && params.seed !== -1) {request.seed = params.seed;}
    if (params.scheduler) {request.scheduler = params.scheduler;}
    if ("safetyCheck" in params && params.safetyCheck != null) {
      request.safety_check = params.safetyCheck;
    }
    if (params.quality) {request.quality = params.quality;}
    if ("strength" in params && params.strength != null) {
      request.strength = params.strength;
    }
    return request;
  }

  private async runImageRequest(
    modelId: string,
    request: ApiRequestParams
  ): Promise<Uint8Array> {
    const client = this.makeClient(modelId);
    const response = await client.doApiRequest(request);
    if (!response.success) {
      throw new Error(
        response.error ??
          `Aki image request failed (code ${response.error_code ?? "unknown"})`
      );
    }

    const bytes = responseImageToBytes(response.images);
    if (!bytes) {
      throw new Error("AKI image generation returned no image data");
    }
    return bytes;
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const request = this.buildImageRequest(prompt, params);
    return this.runImageRequest(params.model.id, request);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    if (!image.length) {
      throw new Error("Image is required");
    }

    const request = this.buildImageRequest(prompt, params, image);
    return this.runImageRequest(params.model.id, request);
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const endpoints = await this.listDiscoveredEndpoints();
    const manifestById = getManifestEntryMap();
    const models = endpoints
      .filter((id) => {
        const entry = manifestById.get(id);
        if (entry?.outputType === "image") {
          return false;
        }
        if (entry?.outputType === "text") {
          return true;
        }
        return !isLikelyImageEndpoint(id);
      })
      .map((id) => {
        const entry = manifestById.get(id);
        return {
          id,
          name: entry?.title ?? id,
          provider: "aki" as const
        };
      });

    return models.length > 0 ? models : manifestLanguageModels();
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const endpoints = await this.listDiscoveredEndpoints();
    const manifestById = getManifestEntryMap();
    const models = endpoints
      .filter((id) => {
        const entry = manifestById.get(id);
        if (entry?.outputType === "image") {
          return true;
        }
        if (entry?.outputType === "text") {
          return false;
        }
        return isLikelyImageEndpoint(id);
      })
      .map((id) => {
        const entry = manifestById.get(id);
        return {
          id,
          name: entry?.title ?? id,
          provider: "aki" as const,
          supportedTasks:
            entry?.supportedTasks && entry.supportedTasks.length > 0
              ? entry.supportedTasks
              : undefined
        };
      });

    return models.length > 0 ? models : manifestImageModels();
  }
}
