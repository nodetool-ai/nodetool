/**
 * FAL AI Provider — wraps the @fal-ai/client SDK to provide image generation
 * through the standard BaseProvider interface.
 *
 * Supports: textToImage, imageToImage, getAvailableImageModels
 */

import { createRequire } from "node:module";
import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
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

const FAL_MANIFEST_PKG = "@nodetool-ai/fal-nodes";
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

/**
 * fal endpoints differ widely in which params they accept and the shape of
 * inputs (e.g. FLUX-2 edit takes `image_urls: string[]` instead of the usual
 * `image_url: string`; some video endpoints want `video_size` not
 * `image_size`; `aspect_ratio` / `num_frames` / `duration` only exist on a
 * subset). Sending an unknown key or wrong shape returns 422. Drive the args
 * from the shipped manifest rather than guessing.
 */
interface FalManifestField {
  name: string;
  apiParamName?: string;
  propType: string;
}
interface FalManifestEntry {
  endpointId?: string;
  inputFields?: FalManifestField[];
}

let _falManifestByEndpoint: Map<string, FalManifestEntry> | null = null;

function getFalManifestEntry(modelId: string): FalManifestEntry | undefined {
  if (!_falManifestByEndpoint) {
    _falManifestByEndpoint = new Map();
    try {
      const req = createRequire(import.meta.url);
      const data = req(
        `${FAL_MANIFEST_PKG}/${FAL_MANIFEST_PATH}`
      ) as FalManifestEntry[];
      for (const entry of data) {
        if (entry.endpointId)
          _falManifestByEndpoint.set(entry.endpointId, entry);
      }
    } catch (err) {
      log.warn(`Could not load fal manifest for arg shaping: ${err}`);
    }
  }
  return _falManifestByEndpoint.get(modelId);
}

/**
 * Helper bound to one endpoint that adds keys only when the manifest declares
 * them, and attaches asset URLs to whatever field name/shape the endpoint
 * actually expects. Falls back to permissive behavior when the endpoint isn't
 * in the manifest, so unknown models keep working as before.
 */
class FalArgsBuilder {
  readonly args: Record<string, unknown> = {};
  private readonly fields: FalManifestField[];
  private readonly accepted: Map<string, FalManifestField>;
  private readonly known: boolean;

  constructor(modelId: string) {
    const entry = getFalManifestEntry(modelId);
    this.known = entry != null;
    this.fields = entry?.inputFields ?? [];
    this.accepted = new Map(
      this.fields.map((f) => [f.apiParamName ?? f.name, f])
    );
  }

  /** True when the endpoint declares `apiName` (or always-true for unknown endpoints). */
  has(apiName: string): boolean {
    return this.known ? this.accepted.has(apiName) : true;
  }

  /** propType for a manifest field by API name, lowercased. */
  propType(apiName: string): string | undefined {
    return this.accepted.get(apiName)?.propType.toLowerCase();
  }

  /** Set `apiName` to `value` only if the endpoint accepts it (or unknown). */
  set(apiName: string, value: unknown): this {
    if (value == null) return this;
    if (typeof value === "string" && value === "") return this;
    if (this.has(apiName)) this.args[apiName] = value;
    return this;
  }

  /** Same as set() but always writes (used for required canonical keys like prompt). */
  force(apiName: string, value: unknown): this {
    if (value != null) this.args[apiName] = value;
    return this;
  }

  /**
   * Attach an uploaded asset URL to whatever field (image/video/audio) the
   * endpoint declares. Handles list-typed fields (`list[image]` -> array).
   * If the endpoint isn't in the manifest, falls back to `${kind}_url`.
   */
  attachAsset(
    kind: "image" | "video" | "audio",
    url: string,
    fallbackApiName?: string
  ): this {
    const field = this.fields.find((f) => {
      const t = f.propType.toLowerCase();
      return t === kind || t === `list[${kind}]`;
    });
    if (field) {
      const apiName = field.apiParamName ?? field.name;
      this.args[apiName] = field.propType.toLowerCase().startsWith("list[")
        ? [url]
        : url;
    } else {
      this.args[fallbackApiName ?? `${kind}_url`] = url;
    }
    return this;
  }

  /**
   * Set `image_size`. fal endpoints typically declare it as an enum string
   * ("square_hd", ...) — passing `{width, height}` to those returns 422. Only
   * write the dict shape when the manifest field exists and isn't enum.
   */
  setImageSize(width?: number | null, height?: number | null): this {
    if (!width || !height) return this;
    const t = this.propType("image_size");
    if (!this.known) {
      this.args.image_size = { width, height };
    } else if (t && t !== "enum") {
      this.args.image_size = { width, height };
    }
    return this;
  }

  /**
   * Validate `value` against a manifest field's enum. Returns the value if
   * accepted, otherwise undefined (so we drop it rather than 422 the request).
   * Returns the value as-is when the endpoint isn't in the manifest or the
   * field isn't an enum, so we don't block unknown endpoints.
   */
  private acceptedEnumValue(
    apiName: string,
    value: string | null | undefined
  ): string | undefined {
    if (!value) return undefined;
    if (!this.known) return value;
    const field = this.accepted.get(apiName);
    if (!field) return undefined;
    if (field.propType.toLowerCase() !== "enum") return value;
    const enumValues = (field as FalManifestField & { enumValues?: string[] })
      .enumValues;
    if (!enumValues || enumValues.length === 0) return value;
    return enumValues.includes(value) ? value : undefined;
  }

  /**
   * Route an aspect ratio + resolution pair to whichever of the endpoint's
   * size-shaping enum fields it actually declares: `aspect_ratio`,
   * `resolution`, `video_size`, `image_size`. Values that don't match the
   * field's enum are dropped rather than sent (fal returns 422 for those).
   *
   *   aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9" | ...
   *   resolution:  "720p" | "1080p" | "1K" | ...
   */
  setSize(aspectRatio?: string | null, resolution?: string | null): this {
    const ar = this.acceptedEnumValue("aspect_ratio", aspectRatio);
    if (ar) this.args.aspect_ratio = ar;

    const res = this.acceptedEnumValue("resolution", resolution);
    if (res) this.args.resolution = res;

    // `video_size` / `image_size` enums share the orientation_NxM vocabulary
    // (square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, ...).
    // Derive from aspectRatio rather than asking the caller for yet another
    // distinct knob.
    const sized = aspectRatioToSizeEnum(aspectRatio);
    for (const apiName of ["video_size", "image_size"] as const) {
      // Only set if not already set (e.g. setImageSize() may have written
      // image_size as a dict for endpoints that accept that shape).
      if (apiName in this.args) continue;
      const v = this.acceptedEnumValue(apiName, sized);
      if (v) this.args[apiName] = v;
    }
    return this;
  }
}

/**
 * Map common aspect ratios to fal's image_size / video_size enum vocabulary.
 * Returns undefined for ratios fal doesn't have a native enum for; the caller
 * will then drop the field rather than risk a 422.
 */
function aspectRatioToSizeEnum(aspectRatio?: string | null): string | undefined {
  if (!aspectRatio) return undefined;
  switch (aspectRatio) {
    case "1:1":
      return "square_hd";
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "4:3":
      return "landscape_4_3";
    case "3:4":
      return "portrait_4_3";
    case "auto":
      return "auto";
    default:
      return undefined;
  }
}

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

  private buildTextToImageArgs(
    modelId: string,
    params: TextToImageParams
  ): Record<string, unknown> {
    const b = new FalArgsBuilder(modelId);
    b.force("prompt", params.prompt)
      .set("output_format", "png")
      .set("negative_prompt", params.negativePrompt)
      .set("guidance_scale", params.guidanceScale)
      .set("num_inference_steps", params.numInferenceSteps)
      .setImageSize(params.width, params.height)
      .setSize(params.aspectRatio, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b.args;
  }

  private async buildImageToImageArgs(
    modelId: string,
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Record<string, unknown>> {
    const client = await this.getClient();
    const blob = new Blob([image], { type: "image/png" });
    const uploadedUrl = await client.storage.upload(blob);

    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", uploadedUrl)
      .force("prompt", params.prompt)
      .set("output_format", "png")
      .set("negative_prompt", params.negativePrompt)
      .set("guidance_scale", params.guidanceScale)
      .set("num_inference_steps", params.numInferenceSteps)
      .set("strength", params.strength)
      .setImageSize(params.targetWidth, params.targetHeight)
      .setSize(params.aspectRatio, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b.args;
  }

  private buildTextToVideoArgs(
    modelId: string,
    params: TextToVideoParams
  ): Record<string, unknown> {
    const b = new FalArgsBuilder(modelId);
    b.force("prompt", params.prompt)
      .set("negative_prompt", params.negativePrompt)
      .set("num_frames", params.numFrames)
      .set("duration", params.durationSeconds)
      .set("guidance_scale", params.guidanceScale)
      .setSize(params.aspectRatio, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b.args;
  }

  private async buildImageToVideoArgs(
    modelId: string,
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Record<string, unknown>> {
    const client = await this.getClient();
    const blob = new Blob([image], { type: "image/png" });
    const uploadedUrl = await client.storage.upload(blob);

    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", uploadedUrl)
      .set("prompt", params.prompt)
      .set("negative_prompt", params.negativePrompt)
      .set("num_frames", params.numFrames)
      .set("duration", params.durationSeconds)
      .set("guidance_scale", params.guidanceScale)
      .setSize(params.aspectRatio, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b.args;
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = this.buildTextToImageArgs(modelId, params);
    log.debug("FAL textToImage", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractImageUrl(data));
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildImageToImageArgs(modelId, image, params);
    log.debug("FAL imageToImage", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractImageUrl(data));
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = this.buildTextToVideoArgs(modelId, params);
    log.debug("FAL textToVideo", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractVideoUrl(data));
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
    const modelId = params.model.id;
    const args = await this.buildImageToImageArgs(modelId, image, params);
    if (new FalArgsBuilder(modelId).has("num_images")) {
      args.num_images = numImages;
    }
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
    const modelId = params.model.id;
    const args = this.buildTextToImageArgs(modelId, params);
    if (new FalArgsBuilder(modelId).has("num_images")) {
      args.num_images = numImages;
    }
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
    const modelId = params.model.id;
    const args = await this.buildImageToVideoArgs(modelId, image, params);
    log.debug("FAL imageToVideo", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractVideoUrl(data));
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
