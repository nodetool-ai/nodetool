/**
 * FAL AI Provider — wraps the @fal-ai/client SDK to provide image generation
 * through the standard BaseProvider interface.
 *
 * Supports: textToImage, imageToImage, getAvailableImageModels
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageModel,
  VideoModel,
  TTSModel,
  MusicModel,
  EncodedAudioResult,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  TextToMusicParams,
  ImageToImageParams,
  InpaintingParams,
  TextToVideoParams,
  ImageToVideoParams,
  UpscaleImageParams,
  RemoveBackgroundParams,
  RelightImageParams,
  VectorizeImageParams,
  VideoToVideoParams,
  LipSyncParams
} from "./types.js";
import {
  loadImageModels,
  loadManifest,
  loadMusicModels,
  loadTTSModels,
  loadVideoModels,
  selectPrimaryImageInput,
  sizeEnumToAspect,
  type ModelImageInput
} from "./manifest-models.js";
import { sniffAudioMime } from "./audio-mime.js";
import { safeFetch } from "./safe-url.js";

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
    const data = loadManifest(
      FAL_MANIFEST_PKG,
      FAL_MANIFEST_PATH
    ) as FalManifestEntry[];
    for (const entry of data) {
      if (entry.endpointId) {
        _falManifestByEndpoint.set(entry.endpointId, entry);
      }
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

  /**
   * Set `apiName` to `value` only if the endpoint accepts it (or unknown),
   * coercing to the manifest's declared type. fal returns 422 when a value's
   * type doesn't match the field — notably numeric `duration`/`seed`/
   * `num_frames` sent to fields the endpoint declares as `enum`/`str` (e.g.
   * `duration` enums are `"5"`/`"10"`, not `5`). Enum values that aren't in
   * the field's vocabulary are dropped rather than sent.
   */
  set(apiName: string, value: unknown): this {
    if (value == null) return this;
    if (typeof value === "string" && value === "") return this;
    if (!this.has(apiName)) return this;
    const t = this.propType(apiName);
    if (t === "enum") {
      const v = this.acceptedEnumValue(apiName, String(value));
      if (v !== undefined) this.args[apiName] = v;
      return this;
    }
    if (t === "str" && typeof value !== "string") {
      this.args[apiName] = String(value);
      return this;
    }
    this.args[apiName] = value;
    return this;
  }

  /** Same as set() but always writes (used for required canonical keys like prompt). */
  force(apiName: string, value: unknown): this {
    if (value != null) this.args[apiName] = value;
    return this;
  }

  /**
   * The `kind`-typed asset inputs the endpoint declares, as {@link
   * ModelImageInput}s (apiName / isList / name), in manifest order.
   */
  private assetInputs(kind: "image" | "video" | "audio"): ModelImageInput[] {
    return this.fields
      .filter((f) => {
        const t = f.propType.toLowerCase();
        return t === kind || t === `list[${kind}]`;
      })
      .map((f) => ({
        apiName: f.apiParamName ?? f.name,
        isList: f.propType.toLowerCase().startsWith("list["),
        name: f.name
      }));
  }

  /**
   * Pick the field a source asset should attach to. For images this is the
   * primary source field, skipping auxiliary slots (mask/control/reference/
   * style/pose/end-frame, …) that must never receive the source image — the
   * same {@link selectPrimaryImageInput} the model picker uses. For video/audio
   * (endpoints with a single such field) it's the first declared field.
   */
  private selectAssetField(
    kind: "image" | "video" | "audio",
    count: number
  ): ModelImageInput | undefined {
    const inputs = this.assetInputs(kind);
    if (inputs.length === 0) return undefined;
    if (kind === "image") return selectPrimaryImageInput(inputs, count);
    return inputs[0];
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
    const field = this.selectAssetField(kind, 1);
    if (field) {
      this.args[field.apiName] = field.isList ? [url] : url;
    } else {
      this.args[fallbackApiName ?? `${kind}_url`] = url;
    }
    return this;
  }

  /**
   * Attach one or more uploaded asset URLs to whatever field (image/video/
   * audio) the endpoint declares. When the endpoint declares a list-typed field
   * (e.g. `image_urls`), every URL is sent; otherwise only the first URL is
   * attached to the single-valued field. Auxiliary image slots (mask, control,
   * reference/style/end-frame, …) are skipped so the source never lands there.
   * Falls back to `${kind}_url` (first URL) for endpoints not in the manifest.
   */
  attachAssets(
    kind: "image" | "video" | "audio",
    urls: string[],
    fallbackApiName?: string
  ): this {
    if (urls.length === 0) return this;
    const field = this.selectAssetField(kind, urls.length);
    if (field) {
      this.args[field.apiName] = field.isList ? urls : urls[0];
    } else {
      this.args[fallbackApiName ?? `${kind}_url`] = urls[0];
    }
    return this;
  }

  /**
   * Attach an inpaint mask URL to whatever mask field the endpoint declares.
   * Endpoints name it `mask_url`, `mask_image_url`, `static_mask_url`, etc. —
   * all `image`-typed fields whose name contains "mask". Falls back to
   * `mask_url` for endpoints not in the manifest.
   */
  attachMask(url: string): this {
    const field = this.fields.find((f) => {
      const t = f.propType.toLowerCase();
      const apiName = (f.apiParamName ?? f.name).toLowerCase();
      return (t === "image" || t === "list[image]") && apiName.includes("mask");
    });
    if (field) {
      const apiName = field.apiParamName ?? field.name;
      this.args[apiName] = field.propType.toLowerCase().startsWith("list[")
        ? [url]
        : url;
    } else {
      this.args.mask_url = url;
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

  /** Declared enum vocabulary for an enum-typed field, or undefined. */
  private enumValuesOf(apiName: string): string[] | undefined {
    const field = this.accepted.get(apiName);
    if (!field || field.propType.toLowerCase() !== "enum") return undefined;
    return (field as FalManifestField & { enumValues?: string[] }).enumValues;
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

    // `video_size` / `image_size` are enums whose vocabulary varies per endpoint
    // (square_hd, landscape_16_9, landscape_3_2, 1536x1024, ...). Pick the value
    // the endpoint ITSELF declares whose ratio matches `aspectRatio`, using the
    // same size→aspect map the model picker derives its options from — so any
    // ratio the picker offers round-trips to a value fal accepts. Unknown
    // endpoints (no declared enum) fall back to the canonical short list.
    for (const apiName of ["video_size", "image_size"] as const) {
      // Only set if not already set (e.g. setImageSize() may have written
      // image_size as a dict for endpoints that accept that shape).
      if (apiName in this.args) continue;
      const declared = this.enumValuesOf(apiName);
      const sized = declared
        ? pickSizeEnumForAspect(declared, aspectRatio)
        : aspectRatioToSizeEnum(aspectRatio);
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

/**
 * Given the size-enum values an endpoint declares, pick the one whose aspect
 * ratio matches `aspectRatio` (via {@link sizeEnumToAspect} — the same map the
 * model picker uses to build its option list, so extraction and request-shaping
 * agree). When several declared values share the ratio (e.g. `square` and
 * `square_hd`), prefer the higher-resolution variant. Returns undefined when
 * the endpoint declares no value for that ratio.
 */
function pickSizeEnumForAspect(
  declared: string[],
  aspectRatio?: string | null
): string | undefined {
  if (!aspectRatio) return undefined;
  const matches = declared.filter((v) => sizeEnumToAspect(v) === aspectRatio);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => sizeEnumRank(b) - sizeEnumRank(a))[0];
}

/** Rough quality ordering so "square_hd" beats "square", "…_uhd" beats both. */
function sizeEnumRank(value: string): number {
  const v = value.toLowerCase();
  if (v.includes("uhd")) return 3;
  if (v.includes("hd")) return 2;
  const dims = v.match(/(\d+)x(\d+)/);
  if (dims) return 1 + (Number(dims[1]) * Number(dims[2])) / 1e9;
  return 1;
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

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return loadTTSModels(FAL_MANIFEST_PKG, FAL_MANIFEST_PATH, "fal_ai");
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return loadMusicModels(FAL_MANIFEST_PKG, FAL_MANIFEST_PATH, "fal_ai");
  }

  /**
   * Generate music as an encoded audio file. FAL music endpoints (Stable Audio,
   * MiniMax Music, ACE-Step, DiffRhythm, …) return a file URL, so this mirrors
   * {@link textToSpeechEncoded}: shape the request from the manifest, run it,
   * and download the resulting audio bytes.
   */
  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    if (!params.prompt) throw new Error("prompt must not be empty");
    const client = await this.getClient();
    const modelId = params.model.id;
    const input = this.buildTextToMusicArgs(modelId, params);
    this.recordRequestPayload(input);
    log.debug("FAL textToMusic", { model: modelId });
    const result = await client.subscribe(modelId, {
      input,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const bytes = await downloadBytes(extractAudioUrl(data));
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  /**
   * Shape music inputs for whatever the endpoint declares. The text prompt
   * lands in `prompt`; lyrics (for vocal models) and duration land in whichever
   * of the heterogeneous duration/lyrics fields the endpoint accepts.
   * {@link FalArgsBuilder.set} drops keys the endpoint doesn't declare.
   */
  private buildTextToMusicArgs(
    modelId: string,
    params: TextToMusicParams
  ): Record<string, unknown> {
    const b = new FalArgsBuilder(modelId);
    b.force("prompt", params.prompt)
      .set("style_prompt", params.prompt)
      .set("lyrics", params.lyrics)
      .set("lyrics_prompt", params.lyrics);
    if (params.durationSeconds != null) {
      b.set("duration", params.durationSeconds)
        .set("seconds_total", params.durationSeconds)
        .set("music_duration", params.durationSeconds);
    }
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b.args;
  }

  /**
   * Generate speech as an encoded audio file (mp3/wav, depending on the
   * endpoint). FAL TTS endpoints return a file URL rather than raw PCM, so the
   * unified TTS node consumes this encoded path instead of streaming samples.
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) throw new Error("text must not be empty");
    const client = await this.getClient();
    const input = this.buildTextToSpeechArgs(args.model, args);
    log.debug("FAL textToSpeech", { model: args.model });
    const result = await client.subscribe(args.model, {
      input,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const bytes = await downloadBytes(extractAudioUrl(data));
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  /**
   * Shape TTS inputs for whatever the endpoint declares. The spoken text lands
   * in the first text-like field the endpoint accepts; the voice lands in
   * `voice` / `speaker` when enumerated. {@link FalArgsBuilder.set} drops keys
   * the endpoint doesn't declare, so this works across the heterogeneous TTS
   * catalog.
   */
  private buildTextToSpeechArgs(
    modelId: string,
    params: { text: string; voice?: string; speed?: number }
  ): Record<string, unknown> {
    const b = new FalArgsBuilder(modelId);
    if (b.has("text")) {
      b.set("text", params.text);
    } else {
      b.set("prompt", params.text)
        .set("script", params.text)
        .set("gen_text", params.text)
        .set("input", params.text);
    }
    b.set("voice", params.voice).set("speaker", params.voice);
    if (params.speed != null) b.set("speed", params.speed);
    return b.args;
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("fal_ai does not support chat generation");
  }

  // eslint-disable-next-line require-yield
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

  /**
   * Configure a {@link FalArgsBuilder} with the shared image-edit inputs
   * (source images + prompt + sampling knobs). Used by both image-to-image and
   * inpaint; the latter additionally attaches a mask.
   */
  private buildEditBuilder(
    modelId: string,
    imageUrls: string[],
    params: ImageToImageParams
  ): FalArgsBuilder {
    const b = new FalArgsBuilder(modelId);
    b.attachAssets("image", imageUrls)
      .force("prompt", params.prompt)
      .set("output_format", "png")
      .set("negative_prompt", params.negativePrompt)
      .set("guidance_scale", params.guidanceScale)
      .set("num_inference_steps", params.numInferenceSteps)
      .set("strength", params.strength)
      .setImageSize(params.targetWidth, params.targetHeight)
      .setSize(params.aspectRatio, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    return b;
  }

  private async buildImageToImageArgs(
    modelId: string,
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Record<string, unknown>> {
    const urls = await this.uploadImages(images);
    return this.buildEditBuilder(modelId, urls, params).args;
  }

  /**
   * Build image-to-image args plus the inpaint mask. The mask is uploaded and
   * attached to whatever mask field the endpoint declares (`mask_url`,
   * `mask_image_url`, …) via {@link FalArgsBuilder.attachMask}.
   */
  private async buildInpaintArgs(
    modelId: string,
    images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Record<string, unknown>> {
    const urls = await this.uploadImages(images);
    const b = this.buildEditBuilder(modelId, urls, params);
    const [maskUrl] = await this.uploadImages([params.mask]);
    if (maskUrl) b.attachMask(maskUrl);
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
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Record<string, unknown>> {
    const urls = await this.uploadImages(images);

    const b = new FalArgsBuilder(modelId);
    b.attachAssets("image", urls)
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
    this.recordRequestPayload(args);
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
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildImageToImageArgs(modelId, images, params);
    this.recordRequestPayload(args);
    log.debug("FAL imageToImage", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractImageUrl(data));
  }

  override async inpaint(
    images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildInpaintArgs(modelId, images, params);
    this.recordRequestPayload(args);
    log.debug("FAL inpaint", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractImageUrl(data));
  }

  override async inpaintImages(
    images: Uint8Array[],
    params: InpaintingParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (numImages <= 1) {
      return [await this.inpaint(images, params)];
    }
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildInpaintArgs(modelId, images, params);
    if (new FalArgsBuilder(modelId).has("num_images")) {
      args.num_images = numImages;
    }
    this.recordRequestPayload(args);
    log.debug("FAL inpaintImages", { model: modelId, numImages });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    const urls = extractImageUrls(data);
    return Promise.all(urls.map(downloadBytes));
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = this.buildTextToVideoArgs(modelId, params);
    this.recordRequestPayload(args);
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
    images: Uint8Array[],
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (numImages <= 1) {
      return [await this.imageToImage(images, params)];
    }
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildImageToImageArgs(modelId, images, params);
    if (new FalArgsBuilder(modelId).has("num_images")) {
      args.num_images = numImages;
    }
    this.recordRequestPayload(args);
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
    this.recordRequestPayload(args);
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
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const modelId = params.model.id;
    const args = await this.buildImageToVideoArgs(modelId, images, params);
    this.recordRequestPayload(args);
    log.debug("FAL imageToVideo", { model: modelId });
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractVideoUrl(data));
  }

  /** Upload raw bytes to FAL storage and return the hosted URL. */
  private async upload(bytes: Uint8Array, mimeType: string): Promise<string> {
    const client = await this.getClient();
    const blob = new Blob(
      [new Uint8Array(bytes) as Uint8Array<ArrayBuffer>],
      { type: mimeType }
    );
    return client.storage.upload(blob);
  }

  /** Upload every non-empty image to FAL storage, returning the hosted URLs. */
  private async uploadImages(images: Uint8Array[]): Promise<string[]> {
    const valid = images.filter((b) => b && b.length > 0);
    return Promise.all(valid.map((b) => this.upload(b, "image/png")));
  }

  /** Run an endpoint that takes a single uploaded image and returns an image. */
  private async runImageEndpoint(
    modelId: string,
    args: Record<string, unknown>
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    this.recordRequestPayload(args);
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractImageUrl(data));
  }

  /** Run an endpoint that returns a video and download the bytes. */
  private async runVideoEndpoint(
    modelId: string,
    args: Record<string, unknown>
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    this.recordRequestPayload(args);
    const result = await client.subscribe(modelId, {
      input: args,
      logs: true,
      onQueueUpdate: this.makeQueueUpdateHandler()
    });
    const data = (result.data ?? result) as Record<string, unknown>;
    return downloadBytes(extractVideoUrl(data));
  }

  override async upscaleImage(
    image: Uint8Array,
    params: UpscaleImageParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const url = await this.upload(image, "image/png");
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", url)
      .set("prompt", params.prompt)
      .set("upscale_factor", params.scale)
      .set("scale", params.scale)
      .set("creativity", params.creativity);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    log.debug("FAL upscaleImage", { model: modelId });
    return this.runImageEndpoint(modelId, b.args);
  }

  override async removeBackground(
    image: Uint8Array,
    params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const url = await this.upload(image, "image/png");
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", url).set("output_format", "png");
    log.debug("FAL removeBackground", { model: modelId });
    return this.runImageEndpoint(modelId, b.args);
  }

  override async relightImage(
    image: Uint8Array,
    params: RelightImageParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const url = await this.upload(image, "image/png");
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", url)
      .force("prompt", params.prompt)
      .set("output_format", "png")
      .set("negative_prompt", params.negativePrompt);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    log.debug("FAL relightImage", { model: modelId });
    return this.runImageEndpoint(modelId, b.args);
  }

  override async vectorizeImage(
    image: Uint8Array,
    params: VectorizeImageParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const url = await this.upload(image, "image/png");
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("image", url);
    log.debug("FAL vectorizeImage", { model: modelId });
    return this.runImageEndpoint(modelId, b.args);
  }

  override async videoToVideo(
    video: Uint8Array,
    params: VideoToVideoParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const url = await this.upload(video, "video/mp4");
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("video", url)
      .set("prompt", params.prompt)
      .set("negative_prompt", params.negativePrompt)
      .set("strength", params.strength)
      .set("duration", params.durationSeconds)
      .setSize(null, params.resolution);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    log.debug("FAL videoToVideo", { model: modelId });
    return this.runVideoEndpoint(modelId, b.args);
  }

  override async lipSync(
    video: Uint8Array,
    params: LipSyncParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const [videoUrl, audioUrl] = await Promise.all([
      this.upload(video, "video/mp4"),
      this.upload(params.audio, "audio/mpeg")
    ]);
    const b = new FalArgsBuilder(modelId);
    b.attachAsset("video", videoUrl).attachAsset("audio", audioUrl);
    if (params.seed != null && params.seed !== -1) b.set("seed", params.seed);
    log.debug("FAL lipSync", { model: modelId });
    return this.runVideoEndpoint(modelId, b.args);
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

function extractAudioUrl(result: Record<string, unknown>): string {
  // FAL TTS endpoints return { audio: { url } } or { audio: "url" } or
  // { audio_url } or a bare { url }.
  const audio = result.audio as Record<string, unknown> | string | undefined;
  if (audio && typeof audio === "object" && typeof audio.url === "string") {
    return audio.url;
  }
  if (typeof audio === "string") return audio;
  if (typeof result.audio_url === "string") return result.audio_url;
  if (typeof result.url === "string") return result.url;
  throw new Error(`Unexpected FAL audio response: ${JSON.stringify(result)}`);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`Failed to download FAL result: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
