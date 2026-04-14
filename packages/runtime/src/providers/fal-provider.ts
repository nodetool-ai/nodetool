/**
 * FAL AI Provider — wraps the @fal-ai/client SDK to provide image generation
 * through the standard BaseProvider interface.
 *
 * Supports: textToImage, imageToImage, getAvailableImageModels
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool/config";
import type {
  ImageModel,
  VideoModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  ImageToImageParams,
  TextToVideoParams,
  ImageToVideoParams
} from "./types.js";
import { loadImageModels, loadVideoModels } from "./manifest-models.js";

const log = createLogger("nodetool.runtime.providers.fal");

const FAL_MANIFEST_PKG = "@nodetool/fal-nodes";
const FAL_MANIFEST_PATH = "fal-manifest.json";

type FalClient = {
  subscribe(
    endpoint: string,
    opts: { input: Record<string, unknown>; logs?: boolean }
  ): Promise<{ data?: Record<string, unknown> }>;
};

export class FalProvider extends BaseProvider {
  private apiKey: string;
  private _client: FalClient | null = null;

  static override requiredSecrets(): string[] {
    return ["FAL_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("fal_ai");
    this.apiKey = (secrets["FAL_API_KEY"] as string) ?? "";
  }

  private async getClient(): Promise<FalClient> {
    if (this._client) return this._client;
    const { createFalClient } = await import("@fal-ai/client");
    this._client = createFalClient({
      credentials: this.apiKey
    }) as unknown as FalClient;
    return this._client;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(FAL_MANIFEST_PKG, FAL_MANIFEST_PATH, "fal_ai");
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(FAL_MANIFEST_PKG, FAL_MANIFEST_PATH, "fal_ai");
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("fal_ai does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("fal_ai does not support chat generation");
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const args: Record<string, unknown> = {
      prompt: params.prompt,
      output_format: "png"
    };
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.width && params.height) {
      args.image_size = { width: params.width, height: params.height };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL textToImage", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const imageUrl = extractImageUrl(data);
    return downloadBytes(imageUrl);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const b64 = Buffer.from(image).toString("base64");
    const imageDataUri = `data:image/png;base64,${b64}`;

    const args: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: imageDataUri,
      output_format: "png"
    };
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.strength != null) args.strength = params.strength;
    if (params.targetWidth && params.targetHeight) {
      args.image_size = {
        width: params.targetWidth,
        height: params.targetHeight
      };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL imageToImage", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const imageUrl = extractImageUrl(data);
    return downloadBytes(imageUrl);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const args: Record<string, unknown> = {
      prompt: params.prompt
    };
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) args.aspect_ratio = params.aspectRatio;
    if (params.numFrames) args.num_frames = params.numFrames;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL textToVideo", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const videoUrl = extractVideoUrl(data);
    return downloadBytes(videoUrl);
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const b64 = Buffer.from(image).toString("base64");
    const imageDataUri = `data:image/png;base64,${b64}`;

    const args: Record<string, unknown> = {
      image_url: imageDataUri
    };
    if (params.prompt) args.prompt = params.prompt;
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) args.aspect_ratio = params.aspectRatio;
    if (params.numFrames) args.num_frames = params.numFrames;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL imageToVideo", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const videoUrl = extractVideoUrl(data);
    return downloadBytes(videoUrl);
  }
}

function extractImageUrl(result: Record<string, unknown>): string {
  const images = result.images as Array<Record<string, unknown>> | undefined;
  if (images && images.length > 0) {
    const url = images[0].url as string | undefined;
    if (url) return url;
  }
  const image = result.image as Record<string, unknown> | undefined;
  if (image?.url) return image.url as string;
  throw new Error(`Unexpected FAL image response: ${JSON.stringify(result)}`);
}

function extractVideoUrl(result: Record<string, unknown>): string {
  // FAL video endpoints return { video: { url } } or { video_url } or { url }
  const video = result.video as Record<string, unknown> | undefined;
  if (video?.url) return video.url as string;
  if (typeof result.video_url === "string") return result.video_url;
  if (typeof result.url === "string") return result.url;
  // Some endpoints return an array of videos
  const videos = result.videos as Array<Record<string, unknown>> | undefined;
  if (videos && videos.length > 0) {
    const url = videos[0].url as string | undefined;
    if (url) return url;
  }
  throw new Error(`Unexpected FAL video response: ${JSON.stringify(result)}`);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download FAL result: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
