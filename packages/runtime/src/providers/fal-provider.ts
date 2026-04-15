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

type FalQueueUpdate = {
  status: string;
  logs?: Array<{ message: string }>;
};

type FalClient = {
  subscribe(
    endpoint: string,
    opts: {
      input: Record<string, unknown>;
      logs?: boolean;
      onQueueUpdate?: (update: FalQueueUpdate) => void;
    }
  ): Promise<{ data?: Record<string, unknown> }>;
  storage: {
    upload(file: Blob): Promise<string>;
  };
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

  /** Build an onQueueUpdate callback that forwards progress via emitMessage. */
  private makeQueueUpdateHandler(): (update: FalQueueUpdate) => void {
    let tick = 0;
    return (update) => {
if (update.status === "IN_PROGRESS") {
        tick++;
        const logs = update.logs ?? [];
        // Emit one message per log line; if no logs, emit a heartbeat tick
        if (logs.length > 0) {
          for (const entry of logs) {
            this.emitMessage({
              type: "node_progress",
              node_id: "",
              progress: tick,
              total: 0,
              chunk: entry.message
            });
          }
        } else {
          this.emitMessage({
            type: "node_progress",
            node_id: "",
            progress: tick,
            total: 0,
            chunk: ""
          });
        }
      }
    };
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
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const imageUrl = extractImageUrl(data);
    return downloadBytes(imageUrl);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const blob = new Blob([image], { type: "image/png" });
    const uploadedUrl = await client.storage.upload(blob);

    const args: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: uploadedUrl,
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
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
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
    if (params.durationSeconds != null)
      args.duration = params.durationSeconds;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL textToVideo", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const videoUrl = extractVideoUrl(data);
    return downloadBytes(videoUrl);
  }

  override async imageToImages(
    image: Uint8Array,
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (numImages <= 1) {
      return [await this.imageToImage(image, params)];
    }
    const client = await this.getClient();
    const blob = new Blob([image], { type: "image/png" });
    const uploadedUrl = await client.storage.upload(blob);

    const args: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: uploadedUrl,
      output_format: "png",
      num_images: numImages
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
    log.debug("FAL imageToImages", { model: modelId, numImages });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const urls = extractImageUrls(data);
    return Promise.all(urls.map(downloadBytes));
  }

  override async textToImages(
    params: TextToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (numImages <= 1) {
      return [await this.textToImage(params)];
    }
    const client = await this.getClient();
    const args: Record<string, unknown> = {
      prompt: params.prompt,
      output_format: "png",
      num_images: numImages
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
    log.debug("FAL textToImages", { model: modelId, numImages });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const urls = extractImageUrls(data);
    return Promise.all(urls.map(downloadBytes));
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const blob = new Blob([image], { type: "image/png" });
    const imageUrl = await client.storage.upload(blob);

    const args: Record<string, unknown> = {
      image_url: imageUrl
    };
    if (params.prompt) args.prompt = params.prompt;
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) args.aspect_ratio = params.aspectRatio;
    if (params.numFrames) args.num_frames = params.numFrames;
    if (params.durationSeconds != null)
      args.duration = params.durationSeconds;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL imageToVideo", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const videoUrl = extractVideoUrl(data);
    return downloadBytes(videoUrl);
  }
}

function extractImageUrls(result: Record<string, unknown>): string[] {
  const images = result.images as Array<Record<string, unknown>> | undefined;
  if (images && images.length > 0) {
    const urls = images.map((img) => img.url as string).filter(Boolean);
    if (urls.length > 0) return urls;
  }
  const image = result.image as Record<string, unknown> | undefined;
  if (image?.url) return [image.url as string];
  throw new Error(`Unexpected FAL image response: ${JSON.stringify(result)}`);
}

function extractImageUrl(result: Record<string, unknown>): string {
  return extractImageUrls(result)[0];
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
