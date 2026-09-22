import { loadPackageAssetJson, createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import { BaseProvider } from "./base-provider.js";
import { providerGeneration, type ProviderGeneration, type ProviderGenerationLookup } from "./provider-generations.js";
import type { ExtendVideoParams, ImageModel, ImageToImageParams, ImageToVideoParams, Message, ProviderStreamItem, ReferenceToVideoInputs, ReferenceToVideoParams, TextToImageParams, TextToVideoParams, VideoModel, VideoToVideoParams } from "./types.js";
import { higgsfieldAwaitResult, higgsfieldCancelByRequestId, higgsfieldCreateUploadUrl, higgsfieldDownloadResult, higgsfieldEstimate, higgsfieldGetStatusByRequestId, higgsfieldOutputUrls, higgsfieldSubmit, higgsfieldUploadMedia, type HiggsfieldCredentials, type HiggsfieldEstimate } from "./higgsfield-transport.js";

const log = createLogger("nodetool.runtime.providers.higgsfield");
interface ManifestEntry { modelId: string; outputType: "image" | "video"; title: string; task: string; supportedTasks?: string[]; timeoutSeconds: number; }
function manifest(): ManifestEntry[] {
  return loadPackageAssetJson<ManifestEntry[]>({ pkg: "@nodetool-ai/higgsfield-nodes", path: "higgsfield-manifest.json" }, import.meta.url);
}

function asCredentials(secrets: Record<string, unknown>): HiggsfieldCredentials {
  const keyId = typeof secrets.HIGGSFIELD_API_KEY_ID === "string" ? secrets.HIGGSFIELD_API_KEY_ID : "";
  const secret = typeof secrets.HIGGSFIELD_API_KEY_SECRET === "string" ? secrets.HIGGSFIELD_API_KEY_SECRET : "";
  if (!keyId || !secret) throw new Error("HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET are required");
  return { keyId, secret };
}

function model(id: string, task: string, title: string, supportedTasks?: string[]): ImageModel & VideoModel {
  return { id, name: title, provider: PROVIDER_IDS.HIGGSFIELD, supportedTasks: supportedTasks ?? [task] };
}

function clean(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

export class HiggsfieldProvider extends BaseProvider {
  private readonly credentials: HiggsfieldCredentials;
  static override requiredSecrets(): string[] { return ["HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"]; }
  constructor(secrets: Record<string, unknown> = {}) { super(PROVIDER_IDS.HIGGSFIELD); this.credentials = asCredentials(secrets); }
  override getContainerEnv(): Record<string, string> { return { HIGGSFIELD_API_KEY_ID: this.credentials.keyId, HIGGSFIELD_API_KEY_SECRET: this.credentials.secret }; }
  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> { throw new Error("higgsfield does not support chat generation"); }
  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> { throw new Error("higgsfield does not support chat generation"); }
  override async getAvailableImageModels(): Promise<ImageModel[]> { return manifest().filter((entry) => entry.outputType === "image").map((entry) => model(entry.modelId, entry.task, entry.title, entry.supportedTasks)); }
  override async getAvailableVideoModels(): Promise<VideoModel[]> { return manifest().filter((entry) => entry.outputType === "video").map((entry) => model(entry.modelId, entry.task, entry.title, entry.supportedTasks)); }

  override async getGeneration(requestId: string, options: ProviderGenerationLookup = {}): Promise<ProviderGeneration | null> {
    const result = await higgsfieldGetStatusByRequestId(this.credentials, requestId, options.signal);
    if (!result) return null;
    const status = result.status === "completed" ? "completed" : result.status === "canceled" ? "cancelled" : result.status === "failed" || result.status === "nsfw" ? "failed" : "running";
    return providerGeneration({
      provider: PROVIDER_IDS.HIGGSFIELD,
      request_id: requestId,
      model: options.model ?? null,
      status,
      output_urls: higgsfieldOutputUrls(result),
      error: result.error ?? null
    });
  }

  async cancel(requestId: string, signal?: AbortSignal): Promise<void> {
    await higgsfieldCancelByRequestId(this.credentials, requestId, signal);
  }

  async estimate(modelId: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<HiggsfieldEstimate> {
    return higgsfieldEstimate(this.credentials, modelId, input, signal);
  }

  private async run(modelId: string, input: Record<string, unknown>, signal?: AbortSignal, timeoutSeconds?: number): Promise<Uint8Array> {
    const entry = manifest().find((candidate) => candidate.modelId === modelId);
    if (!entry) throw new Error(`Unknown Higgsfield model: ${modelId}`);
    const submission = await higgsfieldSubmit(this.credentials, modelId, input, signal);
    await recordGenerationReceiptAsync({ provider_request_id: submission.request_id });
    const result = await higgsfieldAwaitResult(this.credentials, submission.status_url, { signal, timeoutMs: (timeoutSeconds ?? entry.timeoutSeconds) * 1000 });
    const url = higgsfieldOutputUrls(result)[0];
    if (!url) throw new Error(`Higgsfield ${modelId} completed without a result URL`);
    log.debug("Higgsfield generation completed", { model: modelId, requestId: submission.request_id });
    return higgsfieldDownloadResult(url, signal);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.run(params.model.id, clean({ prompt: params.prompt, aspect_ratio: params.aspectRatio, resolution: params.resolution, quality: params.quality, seed: params.seed }), params.signal);
  }
  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    const urls = await Promise.all(images.map(async (bytes) => {
      const upload = await higgsfieldCreateUploadUrl(this.credentials, "image/png", params.signal);
      return higgsfieldUploadMedia(upload, bytes, "image/png", params.signal);
    }));
    return this.run(params.model.id, clean({ prompt: params.prompt, image_urls: urls, aspect_ratio: params.aspectRatio, resolution: params.resolution, quality: params.quality, seed: params.seed }), params.signal);
  }
  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const isKling = params.model.id.startsWith("kling-video/");
    return this.run(params.model.id, clean({ prompt: params.prompt, duration: params.durationSeconds, aspect_ratio: params.aspectRatio, resolution: params.resolution, sound: isKling ? "on" : undefined, cfg_scale: isKling ? params.guidanceScale : undefined }), params.signal, params.timeoutSeconds ?? undefined);
  }
  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    const upload = await higgsfieldCreateUploadUrl(this.credentials, "image/png", params.signal);
    const imageUrl = await higgsfieldUploadMedia(upload, image, "image/png", params.signal);
    const isKling = params.model.id.startsWith("kling-video/");
    return this.run(params.model.id, clean({ prompt: params.prompt, image_url: imageUrl, duration: params.durationSeconds, aspect_ratio: params.aspectRatio, resolution: params.resolution, sound: isKling ? "on" : undefined, cfg_scale: isKling ? params.guidanceScale : undefined }), params.signal, params.timeoutSeconds ?? undefined);
  }
  override async referenceToVideo(inputs: ReferenceToVideoInputs, params: ReferenceToVideoParams): Promise<Uint8Array> {
    const images = await this.uploadImages(inputs.images, params.signal);
    const videos = await this.uploadVideos(inputs.videos, params.signal);
    const audios = await this.uploadAudios(inputs.audios ?? [], params.signal);
    const isGrokImagine = params.model.id === "xai/grok-imagine-video/v1.5/reference-to-video";
    if (isGrokImagine && videos.length > 0) throw new Error("Grok Imagine Video 1.5 does not accept video reference inputs");
    return this.run(params.model.id, clean({ prompt: params.prompt, image_urls: images, video_urls: isGrokImagine ? undefined : videos, audio_urls: isGrokImagine ? undefined : audios, audio_url: isGrokImagine && audios.length === 1 ? audios[0] : undefined, duration: params.durationSeconds, aspect_ratio: params.aspectRatio, resolution: params.resolution, generate_audio: params.useReferenceVideoAudio }), params.signal, params.timeoutSeconds ?? undefined);
  }
  override async videoToVideo(video: Uint8Array, params: VideoToVideoParams): Promise<Uint8Array> {
    const [videoUrl, referenceImages] = await Promise.all([
      this.uploadVideo(video, params.signal),
      this.uploadImages(params.referenceImages ?? [], params.signal)
    ]);
    return this.run(params.model.id, clean({ prompt: params.prompt, video_url: videoUrl, image_urls: referenceImages, resolution: params.resolution }), params.signal);
  }
  override async extendVideo(video: Uint8Array, params: ExtendVideoParams): Promise<Uint8Array> {
    if (params.mode !== "end") throw new Error("Higgsfield video extension currently supports mode=end only");
    if (!Number.isInteger(params.durationSeconds) || params.durationSeconds < 4 || params.durationSeconds > 30) throw new Error("Higgsfield video extension duration must be an integer between 4 and 30 seconds");
    const videoUrl = await this.uploadVideo(video, params.signal);
    return this.run(params.model.id, { prompt: params.prompt, video_url: videoUrl, duration: params.durationSeconds }, params.signal);
  }
  private async uploadImages(images: readonly Uint8Array[], signal?: AbortSignal): Promise<string[]> {
    return Promise.all(images.map(async (bytes) => {
      const upload = await higgsfieldCreateUploadUrl(this.credentials, "image/png", signal);
      return higgsfieldUploadMedia(upload, bytes, "image/png", signal);
    }));
  }
  private async uploadVideo(video: Uint8Array, signal?: AbortSignal): Promise<string> {
    const upload = await higgsfieldCreateUploadUrl(this.credentials, "video/mp4", signal);
    return higgsfieldUploadMedia(upload, video, "video/mp4", signal);
  }
  private async uploadVideos(videos: readonly Uint8Array[], signal?: AbortSignal): Promise<string[]> {
    return Promise.all(videos.map((video) => this.uploadVideo(video, signal)));
  }
  private async uploadAudios(audios: readonly Uint8Array[], signal?: AbortSignal): Promise<string[]> {
    return Promise.all(audios.map(async (bytes) => {
      const upload = await higgsfieldCreateUploadUrl(this.credentials, "audio/wav", signal);
      return higgsfieldUploadMedia(upload, bytes, "audio/wav", signal);
    }));
  }
}
