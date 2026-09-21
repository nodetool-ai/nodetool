/**
 * MuAPI provider — exposes MuAPI's asynchronous media API through the standard
 * {@link BaseProvider} interface, so MuAPI models reach every surface that goes
 * through `runProviderPrediction` / `getAvailable*Models()`: the generic Text to
 * Video and Image to Video nodes, chat media generation, the media inference
 * endpoint, CLI generation, agent media capabilities, and the model pickers.
 *
 *   - textToVideo  → POST /api/v1/flux-3-text-to-video
 *   - imageToVideo → POST /api/v1/flux-3-image-to-video  (one source image,
 *                    uploaded first and referenced by URL in `image_url`)
 *
 * Image generation is deliberately absent: MuAPI's FLUX 3 image routes
 * (`flux-3-text-to-image`, `flux-3-dev`) are marked coming soon in its catalog,
 * so `getAvailableImageModels()` returns nothing and `textToImage` falls through
 * to `BaseProvider`'s "not supported" error rather than advertising a route that
 * cannot run. Add the models here when the routes go live.
 *
 * Transport, billing and SSRF rules live in `muapi-transport.ts`, shared with
 * the `@nodetool-ai/muapi-nodes` pack.
 */

import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import {
  muapiUploadImage,
  runMuapiMedia,
  MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
  MUAPI_TEXT_TO_VIDEO_ENDPOINT,
  MUAPI_VIDEO_ASPECT_RATIOS,
  MUAPI_VIDEO_DURATIONS,
  MUAPI_VIDEO_RESOLUTIONS,
  type MuapiPollOptions
} from "./muapi-transport.js";
import type {
  ImageToVideoParams,
  Message,
  ProviderStreamItem,
  TextToVideoParams,
  VideoModel
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.muapi");

/** Wait between polls. A clip takes tens of seconds to minutes. */
const POLL_INTERVAL_MS = 5000;
/** Default polling window: 30 minutes at {@link POLL_INTERVAL_MS}. */
const DEFAULT_MAX_ATTEMPTS = 360;

/**
 * The live video routes. Both are listed with the option sets the endpoints
 * document, so a picker cannot offer a value the route rejects with a 422.
 */
const MUAPI_VIDEO_MODELS: VideoModel[] = [
  {
    id: MUAPI_TEXT_TO_VIDEO_ENDPOINT,
    name: "FLUX 3 (Text to Video)",
    provider: "muapi",
    supportedTasks: ["text_to_video"],
    durations: MUAPI_VIDEO_DURATIONS,
    resolutions: MUAPI_VIDEO_RESOLUTIONS,
    aspectRatios: MUAPI_VIDEO_ASPECT_RATIOS
  },
  {
    id: MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
    name: "FLUX 3 (Image to Video)",
    provider: "muapi",
    supportedTasks: ["image_to_video"],
    durations: MUAPI_VIDEO_DURATIONS,
    resolutions: MUAPI_VIDEO_RESOLUTIONS,
    aspectRatios: MUAPI_VIDEO_ASPECT_RATIOS
  }
];

const MIN_DURATION = Math.min(...MUAPI_VIDEO_DURATIONS);
const MAX_DURATION = Math.max(...MUAPI_VIDEO_DURATIONS);

/** Clamp a requested clip length onto the window {@link MUAPI_VIDEO_DURATIONS} declares. */
function normalizeMuapiDuration(
  params: Pick<TextToVideoParams, "durationSeconds" | "numFrames">
): number {
  const requested =
    params.durationSeconds && params.durationSeconds > 0
      ? params.durationSeconds
      : params.numFrames && params.numFrames > 0
        ? params.numFrames / 24
        : 5;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(requested)));
}

/**
 * MuAPI's video routes take no negative-prompt field, so an unsupported
 * negative prompt joins the prompt text instead of being silently dropped.
 */
function composeMuapiPrompt(
  prompt: string,
  negativePrompt?: string | null
): string {
  const base = prompt.trim();
  const negative = negativePrompt?.trim();
  return negative ? `${base}\n\nDo not include: ${negative}` : base;
}

function requireOneOf(
  value: string | null | undefined,
  allowed: string[],
  field: string
): string | undefined {
  if (!value) return undefined;
  if (!allowed.includes(value)) {
    throw new Error(
      `MuAPI does not support ${field} "${value}". Supported: ${allowed.join(", ")}.`
    );
  }
  return value;
}

/** Build the flat JSON body both video routes take. */
function buildMuapiVideoPayload(
  params: TextToVideoParams | ImageToVideoParams,
  prompt: string,
  imageUrl?: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: composeMuapiPrompt(prompt, params.negativePrompt),
    duration: normalizeMuapiDuration(params)
  };

  const aspectRatio = requireOneOf(
    params.aspectRatio,
    MUAPI_VIDEO_ASPECT_RATIOS,
    "aspect ratio"
  );
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  const resolution = requireOneOf(
    params.resolution,
    MUAPI_VIDEO_RESOLUTIONS,
    "resolution"
  );
  if (resolution) payload.resolution = resolution;

  if (params.seed != null && params.seed !== -1) payload.seed = params.seed;
  if (imageUrl) payload.image_url = imageUrl;
  return payload;
}

export interface MuapiProviderOptions {
  /** Wait between polls. Injectable so a test does not sit through real ones. */
  pollIntervalMs?: number;
}

export class MuapiProvider extends BaseProvider {
  private readonly apiKey: string;
  private readonly pollIntervalMs: number;

  static override requiredSecrets(): string[] {
    return ["MUAPI_API_KEY"];
  }

  constructor(
    secrets: Record<string, unknown> = {},
    options: MuapiProviderOptions = {}
  ) {
    super("muapi");
    this.apiKey = ((secrets["MUAPI_API_KEY"] as string) ?? "").trim();
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  override getContainerEnv() {
    return { MUAPI_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error("MUAPI_API_KEY is not configured");
    }
    return this.apiKey;
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("muapi does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("muapi does not support chat generation");
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    if (!this.apiKey) return [];
    return MUAPI_VIDEO_MODELS;
  }

  /**
   * Translate a per-call timeout into a polling budget. The budget is sized
   * against the documented {@link POLL_INTERVAL_MS} cadence, not the injected
   * one, so shortening the interval in a test does not silently buy more
   * attempts than a real call would get.
   */
  private pollOptions(
    params: TextToVideoParams | ImageToVideoParams
  ): MuapiPollOptions {
    const options: MuapiPollOptions = {
      pollIntervalMs: this.pollIntervalMs,
      maxAttempts:
        params.timeoutSeconds && params.timeoutSeconds > 0
          ? Math.max(
              1,
              Math.ceil((params.timeoutSeconds * 1000) / POLL_INTERVAL_MS)
            )
          : DEFAULT_MAX_ATTEMPTS
    };
    if (params.signal) options.signal = params.signal;
    return options;
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const prompt = params.prompt?.trim();
    if (!prompt) {
      throw new Error("The input prompt cannot be empty.");
    }
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("MuAPI textToVideo", { model: params.model.id });
    return runMuapiMedia({
      apiKey: this.requireApiKey(),
      endpoint: params.model.id,
      payload: buildMuapiVideoPayload(params, prompt),
      kind: "video",
      ...this.pollOptions(params)
    });
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const image = images.find((bytes) => bytes && bytes.length > 0);
    if (!image) {
      throw new Error("The input image cannot be empty.");
    }
    const apiKey = this.requireApiKey();
    const imageUrl = await muapiUploadImage(apiKey, image, params.signal);
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("MuAPI imageToVideo", { model: params.model.id });
    return runMuapiMedia({
      apiKey,
      endpoint: params.model.id,
      payload: buildMuapiVideoPayload(params, params.prompt ?? "", imageUrl),
      kind: "video",
      ...this.pollOptions(params)
    });
  }
}
