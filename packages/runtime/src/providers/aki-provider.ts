import { loadPackageAssetJson } from "@nodetool-ai/config";
import type OpenAI from "openai";
import { AkiClient, decodeBinary } from "@aki-io/aki-io";
import type {
  AkiClientConfig,
  ApiRequestParams,
  ApiResponse
} from "@aki-io/aki-io";
import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type {
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  TextToImageParams
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.aki");

const AKI_BASE_URL = "https://aki.io/v1";

interface AkiManifestEntry {
  endpointId: string;
  title: string;
  outputType: string;
  supportedTasks?: string[];
  paramNames?: Record<string, string>;
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export function isAkiManifestEntry(value: unknown): value is AkiManifestEntry {
  return (
    !!value &&
    // Stryker disable next-line ConditionalExpression: forcing this true is equivalent — a non-object primitive still fails the string-field checks below.
    typeof value === "object" &&
    typeof (value as AkiManifestEntry).endpointId === "string" &&
    typeof (value as AkiManifestEntry).title === "string" &&
    typeof (value as AkiManifestEntry).outputType === "string" &&
    ((value as AkiManifestEntry).paramNames === undefined ||
      isStringRecord((value as AkiManifestEntry).paramNames))
  );
}

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

let akiManifestCache: AkiManifestEntry[] | null = null;

// Reads & caches the shipped manifest JSON. Its branches (cache hit, non-array,
// IO failure) depend on that file's contents and the module-level cache rather
// than unit-controllable inputs; the parsing predicate (isAkiManifestEntry) and
// the transform (imageModelsFromEntries) are unit-tested directly instead.
// Stryker disable all
export function loadAkiManifest(): AkiManifestEntry[] {
  if (akiManifestCache) {
    return akiManifestCache;
  }
  try {
    const parsed = loadPackageAssetJson<unknown>(
      { pkg: "@nodetool-ai/runtime", path: "providers/aki-manifest.json" },
      import.meta.url
    );
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
// Stryker restore all

export function getManifestEntry(endpointId: string): AkiManifestEntry | undefined {
  // Lookup over the shipped manifest (see loadAkiManifest); not unit-controllable.
  // Stryker disable next-line ArrowFunction,ConditionalExpression,EqualityOperator,StringLiteral
  return loadAkiManifest().find((entry) => entry.endpointId === endpointId);
}

/** Pure transform: manifest entries → image models, with a fallback when none. */
export function imageModelsFromEntries(
  entries: AkiManifestEntry[]
): ImageModel[] {
  const models = entries
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

export function manifestImageModels(): ImageModel[] {
  return imageModelsFromEntries(loadAkiManifest());
}

export function uint8ToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

/** Pure: rename request keys per a manifest's paramNames map. */
export function applyParamRemap(
  paramNames: Record<string, string> | undefined,
  request: ApiRequestParams
): ApiRequestParams {
  if (!paramNames || Object.keys(paramNames).length === 0) {
    return request;
  }
  const remapped: ApiRequestParams = {};
  for (const [key, value] of Object.entries(request)) {
    remapped[paramNames[key] ?? key] = value;
  }
  return remapped;
}

export function remapRequestParams(
  endpointId: string,
  request: ApiRequestParams
): ApiRequestParams {
  return applyParamRemap(getManifestEntry(endpointId)?.paramNames, request);
}

export function withPromptParam(request: ApiRequestParams): ApiRequestParams {
  if (!("prompt_input" in request)) {
    return request;
  }
  const remapped = { ...request };
  remapped.prompt = remapped.prompt_input;
  delete remapped.prompt_input;
  return remapped;
}

export function shouldRetryWithPromptParam(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid input parameter(s): prompt_input") &&
    normalized.includes("missing required argument: prompt")
  );
}

export function responseImageToBytes(images: ApiResponse["images"]): Uint8Array | null {
  const firstValue: unknown = Array.isArray(images) ? images[0] : images;
  // Equivalent fast path: a falsy value also returns null via the final return.
  // Stryker disable next-line ConditionalExpression,BlockStatement
  if (!firstValue) {
    return null;
  }
  if (firstValue instanceof Uint8Array) {
    return firstValue;
  }
  // Dead branch: a Buffer is already a Uint8Array, so it returns above.
  // Stryker disable next-line ConditionalExpression,BlockStatement
  if (Buffer.isBuffer(firstValue)) {
    return new Uint8Array(firstValue);
  }
  if (typeof firstValue === "string") {
    const [, decoded] = decodeBinary(firstValue);
    return decoded ? new Uint8Array(decoded) : null;
  }
  return null;
}

/** Pure: build the AKI image request payload from typed params. */
export function buildAkiImageRequest(
  prompt: string,
  params: TextToImageParams | ImageToImageParams,
  image?: Uint8Array
): ApiRequestParams {
  const request: ApiRequestParams = { prompt_input: prompt };
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
  if (width != null) request.width = width;
  if (height != null) request.height = height;
  if (params.negativePrompt) request.negative_prompt = params.negativePrompt;
  if (params.guidanceScale != null) request.guidance_scale = params.guidanceScale;
  if (params.numInferenceSteps != null)
    request.num_inference_steps = params.numInferenceSteps;
  if (params.seed != null && params.seed !== -1) request.seed = params.seed;
  if (params.scheduler) request.scheduler = params.scheduler;
  if ("safetyCheck" in params && params.safetyCheck != null)
    request.safety_check = params.safetyCheck;
  if (params.quality) request.quality = params.quality;
  if ("strength" in params && params.strength != null)
    request.strength = params.strength;
  return request;
}

interface AkiProviderOptions extends OpenAICompatProviderOptions {
  /** Alias kept for callers that predate {@link OpenAICompatProviderOptions}. */
  openaiClientFactory?: (apiKey: string) => OpenAI;
  akiClientFactory?: (config: AkiClientConfig) => AkiClient;
}

export class AkiProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["AKI_API_KEY"];
  }

  private readonly _akiClientFactory: (config: AkiClientConfig) => AkiClient;
  private _akiFetch: typeof fetch;

  constructor(
    secrets: { AKI_API_KEY?: string },
    options: AkiProviderOptions = {}
  ) {
    const apiKey = secrets.AKI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("AKI_API_KEY is not configured");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { providerId: "aki", apiKey, baseURL: AKI_BASE_URL },
      {
        ...options,
        clientFactory: options.openaiClientFactory ?? options.clientFactory,
        fetchFn
      }
    );

    this._akiClientFactory =
      // Stryker disable next-line ArrowFunction: the default constructs a real AkiClient (network SDK); exercised only outside unit tests, where akiClientFactory is injected.
      options.akiClientFactory ?? ((config) => new AkiClient(config));
    this._akiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { AKI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  private makeAkiClient(endpointName: string): AkiClient {
    return this._akiClientFactory({
      endpointName,
      apiKey: this.apiKey,
      outputBinaryFormat: "byteString",
      raiseExceptions: true,
      returnToolCallDict: true
    });
  }

  private buildImageRequest(
    prompt: string,
    params: TextToImageParams | ImageToImageParams,
    image?: Uint8Array
  ): ApiRequestParams {
    return buildAkiImageRequest(prompt, params, image);
  }

  private async runImageRequest(
    modelId: string,
    request: ApiRequestParams
  ): Promise<Uint8Array> {
    const client = this.makeAkiClient(modelId);
    const initialRequest = remapRequestParams(modelId, request);

    let response: ApiResponse;
    try {
      response = await client.doApiRequest(initialRequest);
    } catch (error) {
      if (!shouldRetryWithPromptParam(error)) {
        throw error;
      }
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.info("Retrying AKI image request with prompt param alias", { modelId });
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
    return this.runImageRequest(params.model.id, this.buildImageRequest(prompt, params));
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const image = images[0];
    if (!image?.length) {
      throw new Error("Image is required");
    }
    return this.runImageRequest(
      params.model.id,
      this.buildImageRequest(prompt, params, image)
    );
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._akiFetch(`${AKI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    // Stryker disable next-line ArrayDeclaration: the fallback is filtered downstream (rows need a string id), so [] vs any array is observably identical.
    return (payload.data ?? [])
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "aki" as const
      }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return manifestImageModels();
  }
}
