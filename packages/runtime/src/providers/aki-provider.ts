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

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { AkiClient, decodeBinary } from "@aki-io/aki-io";
import type {
  AkiClientConfig,
  ApiRequestParams,
  ApiResponse,
  ChatMessage
} from "@aki-io/aki-io";
import { createLogger } from "@nodetool-ai/config";
import type { Chunk } from "@nodetool-ai/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.aki");

interface AkiManifestEntry {
  endpointId: string;
  title: string;
  outputType: string;
  supportedTasks?: string[];
  paramNames?: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

function isAkiManifestEntry(value: unknown): value is AkiManifestEntry {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as AkiManifestEntry).endpointId === "string" &&
    typeof (value as AkiManifestEntry).title === "string" &&
    typeof (value as AkiManifestEntry).outputType === "string" &&
    ((value as AkiManifestEntry).paramNames === undefined ||
      isStringRecord((value as AkiManifestEntry).paramNames))
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

function getManifestEntry(endpointId: string): AkiManifestEntry | undefined {
  return loadAkiManifest().find((entry) => entry.endpointId === endpointId);
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

function remapRequestParams(
  endpointId: string,
  request: ApiRequestParams
): ApiRequestParams {
  const paramNames = getManifestEntry(endpointId)?.paramNames;
  if (!paramNames || Object.keys(paramNames).length === 0) {
    return request;
  }

  const remapped: ApiRequestParams = {};
  for (const [key, value] of Object.entries(request)) {
    remapped[paramNames[key] ?? key] = value;
  }
  return remapped;
}

function withPromptParam(request: ApiRequestParams): ApiRequestParams {
  if (!("prompt_input" in request)) {
    return request;
  }

  const remapped = { ...request };
  remapped.prompt = remapped.prompt_input;
  delete remapped.prompt_input;
  return remapped;
}

function shouldRetryWithPromptParam(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid input parameter(s): prompt_input") &&
    normalized.includes("missing required argument: prompt")
  );
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
    return true;
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

  private formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    return tools.map((tool) => {
      if (
        tool.type === "code_interpreter" ||
        tool.name === "code_interpreter"
      ) {
        return { type: "code_interpreter" };
      }

      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.inputSchema ?? { type: "object", properties: {} }
        }
      };
    });
  }

  private parseToolCalls(raw: unknown): ToolCall[] {
    if (raw == null) {
      return [];
    }

    const candidates = Array.isArray(raw) ? raw : [raw];
    const toolCalls: ToolCall[] = [];

    for (const candidate of candidates) {
      let parsed = candidate;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed) as unknown;
        } catch {
          continue;
        }
      }
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      const nestedFunction =
        record.function && typeof record.function === "object"
          ? (record.function as Record<string, unknown>)
          : null;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof nestedFunction?.name === "string"
            ? nestedFunction.name
            : "";
      if (!name) {
        continue;
      }

      const rawArgs =
        record.arguments ?? nestedFunction?.arguments ?? record.args ?? {};
      let args: Record<string, unknown> = {};
      if (typeof rawArgs === "string") {
        args = this.parseToolCallArgs(rawArgs);
      } else if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
        args = rawArgs as Record<string, unknown>;
      }

      toolCalls.push({
        id:
          typeof record.id === "string"
            ? record.id
            : typeof record.tool_call_id === "string"
              ? record.tool_call_id
              : randomUUID(),
        name,
        args
      });
    }

    return toolCalls;
  }

  private async buildParams(args: {
    messages: Message[];
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): Promise<ApiRequestParams> {
    const { chatContext, image } = await this.toChatContext(args.messages);
    const params: ApiRequestParams = { chat_context: chatContext };
    if (image) params.image = image;
    if (args.tools && args.tools.length > 0) {
      params.tools = this.formatTools(args.tools);
    }
    // AKI accepts tool definitions but currently rejects `tool_choice`, so we
    // intentionally do not send it.
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
      content: response.text ?? "",
      toolCalls: this.parseToolCalls(response.tool_calls)
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

    const stream = client.getApiRequestGenerator(params) as AsyncGenerator<
      Record<string, unknown>,
      void,
      unknown
    >;

    let emitted = "";
    let errorMessage: string | undefined;
    let promptTokens: number | undefined;
    let generatedTokens: number | undefined;
    const emittedToolCallIds = new Set<string>();

    for await (const update of stream) {
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

      const toolCalls = this.parseToolCalls(
        progressData?.["tool_calls"] ?? u["tool_calls"]
      );
      for (const toolCall of toolCalls) {
        if (emittedToolCallIds.has(toolCall.id)) {
          continue;
        }
        emittedToolCallIds.add(toolCall.id);
        yield toolCall;
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

    let response: ApiResponse;
    const initialRequest = remapRequestParams(modelId, request);
    try {
      response = await client.doApiRequest(initialRequest);
    } catch (error) {
      if (!shouldRetryWithPromptParam(error)) {
        throw error;
      }

      log.info("Retrying AKI image request with prompt param alias", {
        modelId
      });
      response = await client.doApiRequest(withPromptParam(initialRequest));
    }

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
    return manifestLanguageModels();
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return manifestImageModels();
  }
}
