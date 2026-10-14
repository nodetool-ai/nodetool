import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { extractResponsesText } from "./responses-api.js";
import type { ResponsesInputOptions } from "./responses-api.js";
import { bytesToImageDataUri } from "./image-mime.js";
import {
  displayedImageSize,
  samMasksFromOutput,
  samPromptText
} from "./meta-segmentation.js";
import {
  decodeTranscribeResponse,
  keywordsFromPrompt,
  languageBiasName,
  toTranscribeWav
} from "./meta-transcription.js";
import type { ProviderCapability } from "./base-provider.js";
import {
  PROVIDER_IDS,
  type ASRModel,
  type ASRResult,
  type ImageModel,
  type ImageSegmentationMask,
  type ImageToImageParams,
  type LanguageModel,
  type SegmentImageParams,
  type TextToImageParams
} from "./types.js";
import { isRecord, isString } from "@nodetool-ai/protocol";

const META_BASE_URL = "https://api.meta.ai/v1";

/** Muse Image: text-to-image and image editing. */
const MUSE_IMAGE_MODEL = "muse-image-1.0";
/** Muse Voice Transcribe: speech to text over `/v1/asr/transcribe`. */
const MUSE_TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
/** SAM 3.1: text- or object-prompted segmentation over the Responses API. */
const SAM_MODEL = "sam-3.1";

/** Images per request on `/v1/images/generations` and `/v1/images/edits`. */
const MAX_IMAGES_PER_REQUEST = 10;

/**
 * Models Meta serves when `/v1/models` cannot be reached (no network, key not
 * yet accepted). Keeps the model menu usable so a user can pick one and let
 * the call itself report the real error. See https://dev.meta.ai/docs/models.
 */
const META_FALLBACK_MODELS = [
  "muse-spark-1.3",
  "muse-spark-1.2",
  "muse-spark-1.2-contributor",
  "muse-spark-1.1"
] as const;

/**
 * Whether `model` is a Muse Spark chat model rather than one of the media
 * models the same `/v1/models` listing can carry.
 */
function isMetaChatModel(model: string): boolean {
  return !/^(muse-image|muse-voice|sam-)/i.test(model);
}

/**
 * Meta's Images API reads `size` as an aspect ratio, not exact pixels. Pixel
 * sizes pass through; a ratio becomes a size with a 1024-pixel short side.
 */
function imageSize(
  width: number | null | undefined,
  height: number | null | undefined,
  aspectRatio: string | null | undefined
): string | undefined {
  if (width && height && width > 0 && height > 0) {
    return `${Math.round(width)}x${Math.round(height)}`;
  }
  const match = aspectRatio ? /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio.trim()) : null;
  if (!match) return undefined;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0 && h > 0)) return undefined;
  return w >= h
    ? `${Math.round((1024 * w) / h)}x1024`
    : `1024x${Math.round((1024 * h) / w)}`;
}

function promptWithNegative(
  prompt: string,
  negativePrompt: string | null | undefined
): string {
  return negativePrompt?.trim()
    ? `${prompt.trim()}\n\nDo not include: ${negativePrompt.trim()}`
    : prompt;
}

function imageCount(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > MAX_IMAGES_PER_REQUEST) {
    throw new Error(
      `Meta image requests return 1 to ${MAX_IMAGES_PER_REQUEST} images, got ${n}.`
    );
  }
  return n;
}

/**
 * Meta AI provider for the Muse family at https://api.meta.ai/v1.
 *
 * Chat runs on Meta's Responses API, the only protocol that serves its hosted
 * tools: a `web_search` tool is answered by Meta's own search grounding, and
 * tools marked `deferLoading` are loaded on demand by its hosted
 * `tool_search`. Muse Spark reads video and audio parts natively.
 *
 * Media runs on Meta's dedicated endpoints: Muse Image for text-to-image and
 * editing, Muse Voice Transcribe for speech to text, and SAM 3.1 for image
 * segmentation. See https://dev.meta.ai/docs/overview.
 */
export class MetaProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["META_API_KEY"];
  }

  constructor(
    secrets: { META_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.META_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("META_API_KEY is required");
    }

    super(
      {
        providerId: PROVIDER_IDS.META,
        apiKey: apiKey.trim(),
        baseURL: META_BASE_URL
      },
      options
    );
  }

  override getContainerEnv() {
    return { META_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /**
   * Muse Spark chat goes through the Responses API. Search grounding and tool
   * search exist only there, not on Meta's Chat Completions endpoint.
   */
  protected override usesResponsesApi(model: string): boolean {
    return isMetaChatModel(model);
  }

  override get supportsNativeWebSearch(): boolean {
    return true;
  }

  protected override get supportsNativeToolSearch(): boolean {
    return true;
  }

  override get supportsVideoInput(): boolean {
    return true;
  }

  protected override responsesInputOptions(): ResponsesInputOptions {
    return { video: true, audio: true };
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "segment_image",
      "automatic_speech_recognition"
    ];
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const models = (await this.listCompatModels()).filter((model) =>
      isMetaChatModel(model.id)
    );
    return models.length > 0 ? models : this.fallbackLanguageModels();
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: MUSE_IMAGE_MODEL,
        name: "Muse Image 1.0",
        provider: PROVIDER_IDS.META,
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: SAM_MODEL,
        name: "SAM 3.1",
        provider: PROVIDER_IDS.META,
        supportedTasks: ["segment"]
      }
    ];
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      {
        id: MUSE_TRANSCRIBE_MODEL,
        name: "Muse Voice Transcribe 1.0",
        provider: PROVIDER_IDS.META
      }
    ];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const [image] = await this.textToImages(params, 1);
    return image;
  }

  override async textToImages(
    params: TextToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (!params.prompt?.trim()) {
      throw new Error("The input prompt cannot be empty.");
    }
    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: promptWithNegative(params.prompt, params.negativePrompt),
      n: imageCount(numImages),
      response_format: "b64_json",
      output_format: "png"
    };
    const size = imageSize(params.width, params.height, params.aspectRatio);
    if (size) request.size = size;
    return this.requestImages(
      "images/generations",
      request,
      params.model.id,
      params.signal
    );
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const [image] = await this.imageToImages(images, params, 1);
    return image;
  }

  /**
   * Edit or compose 1–10 source images. The edits endpoint's JSON form takes
   * each image as a data URL; it rejects masks.
   */
  override async imageToImages(
    images: Uint8Array[],
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const sources = images.filter((image) => image && image.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty.");
    }
    if (sources.length > MAX_IMAGES_PER_REQUEST) {
      throw new Error(
        `Meta image edits accept at most ${MAX_IMAGES_PER_REQUEST} source images, got ${sources.length}.`
      );
    }
    if (!params.prompt?.trim()) {
      throw new Error("The input prompt cannot be empty.");
    }
    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: promptWithNegative(params.prompt, params.negativePrompt),
      images: sources.map((image) => ({
        image_url: bytesToImageDataUri(image)
      })),
      n: imageCount(numImages),
      response_format: "b64_json",
      output_format: "png"
    };
    const size = imageSize(
      params.targetWidth,
      params.targetHeight,
      params.aspectRatio
    );
    if (size) request.size = size;
    return this.requestImages(
      "images/edits",
      request,
      params.model.id,
      params.signal
    );
  }

  /**
   * Transcribe a recording with Muse Voice Transcribe. ENDPOINTING mode splits
   * the transcript into turns, which come back as timed chunks.
   */
  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    if (!args.audio || args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    if (args.word_timestamps) {
      throw new Error(
        "Meta transcription has no word-level timestamps; it returns turn timings."
      );
    }
    const wav = await toTranscribeWav(args.audio);

    const settings: Record<string, unknown> = {
      mode: "ENDPOINTING",
      model: args.model,
      audioEncoding: "WAV"
    };
    if (args.language?.trim()) {
      settings.languageBias = [languageBiasName(args.language)];
    }
    const keywords = args.prompt ? keywordsFromPrompt(args.prompt) : [];
    if (keywords.length > 0) settings.keywords = keywords;

    const form = new FormData();
    form.append(
      "request",
      new Blob([JSON.stringify(settings)], { type: "application/json" })
    );
    form.append(
      "audio",
      new Blob([Buffer.from(wav)], { type: "audio/wav" }),
      "audio.wav"
    );

    this.recordRequestPayload(settings);
    const response = await this.compatFetch(`${META_BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json"
      },
      body: form
    });
    const payload = await this.readJson(response, "transcription");
    const { result, audioDurationMs } = decodeTranscribeResponse(payload);
    if (audioDurationMs !== null) {
      // Billed per whole second of audio, rounded down.
      this.trackUsage(args.model, {
        durationSeconds: Math.floor(audioDurationMs / 1000)
      });
    }
    return result;
  }

  /**
   * Segment an image with SAM 3.1. A text prompt finds every instance of a
   * concept; a box or points pick out one object.
   */
  override async segmentImage(
    image: Uint8Array,
    params: SegmentImageParams
  ): Promise<ImageSegmentationMask[]> {
    if (image.length === 0) {
      throw new Error("segmentImage requires a non-empty image");
    }
    const size = await displayedImageSize(image);
    const promptText = samPromptText(params, size);
    const request = {
      model: params.model.id,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: promptText },
            { type: "input_image", image_url: bytesToImageDataUri(image) }
          ]
        }
      ],
      stream: false
    };
    const payload = await this.postJson(
      "responses",
      request,
      "segmentation",
      params.signal
    );
    const outputText =
      isRecord(payload) && isString(payload.output_text)
        ? payload.output_text
        : extractResponsesText(isRecord(payload) ? payload.output : undefined);

    let masks = await samMasksFromOutput(outputText, size, {
      label: params.prompt?.trim() || null
    });
    const minConfidence = params.minConfidence;
    if (minConfidence != null) {
      masks = masks.filter(
        (mask) => mask.confidence == null || mask.confidence >= minConfidence
      );
    }
    if (params.maxMasks != null && params.maxMasks >= 0) {
      masks = masks.slice(0, params.maxMasks);
    }
    return masks;
  }

  private async requestImages(
    endpoint: "images/generations" | "images/edits",
    request: Record<string, unknown>,
    model: string,
    signal?: AbortSignal
  ): Promise<Uint8Array[]> {
    const payload = await this.postJson(endpoint, request, "image", signal);
    const data = isRecord(payload) ? payload.data : undefined;
    const images = (Array.isArray(data) ? data : [])
      .filter(isRecord)
      .map((item) => item.b64_json)
      .filter(isString)
      .map((b64) => new Uint8Array(Buffer.from(b64, "base64")));
    if (images.length === 0) {
      throw new Error("Meta image generation returned no image data.");
    }
    this.trackUsage(model, { imageCount: images.length });
    return images;
  }

  private async postJson(
    endpoint: string,
    body: Record<string, unknown>,
    what: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    this.recordRequestPayload(body);
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
    if (signal) init.signal = signal;
    const response = await this.compatFetch(
      `${META_BASE_URL}/${endpoint}`,
      init
    );
    return this.readJson(response, what);
  }

  private async readJson(response: Response, what: string): Promise<unknown> {
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Meta ${what} request failed: ${response.status}${detail ? ` ${detail}` : ""}`
      );
    }
    return response.json();
  }

  private fallbackLanguageModels(): LanguageModel[] {
    return META_FALLBACK_MODELS.map((id) => ({
      id,
      name: id,
      provider: PROVIDER_IDS.META
    }));
  }
}
