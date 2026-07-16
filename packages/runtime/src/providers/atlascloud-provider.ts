/**
 * AtlasCloud Provider — exposes AtlasCloud.ai's hosted image and video models
 * through the standard {@link BaseProvider} interface, and surfaces the
 * `ATLASCLOUD_API_KEY` secret in Settings → API Keys.
 *
 * In addition to model listing, the provider implements:
 *   - textToImage / imageToImage
 *   - textToVideo / imageToVideo
 *
 * so AtlasCloud models work from NodeTool's generic image/video generation
 * nodes (model picker), not just the AtlasCloud-specific node classes shipped
 * by `@nodetool-ai/atlascloud-nodes`.
 *
 * Wire spec (per AtlasCloud docs + Gap #3 in the POC INTEGRATION.md):
 *  - Auth:   `Authorization: Bearer <api_key>`
 *  - Submit: POST /api/v1/model/generate{Image,Video}, FLAT body
 *              { model, ...fields }   (NOT nested under `input`)
 *  - Poll:   GET  /api/v1/model/prediction/{id}
 *  - Submit POST is NEVER retried — a 429/5xx may have actually created the
 *    job upstream, and a retry would double-bill.
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import {
  loadImageModels,
  loadManifest,
  loadVideoModels
} from "./manifest-models.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.atlascloud");

const ATLASCLOUD_MANIFEST_PKG = "@nodetool-ai/atlascloud-nodes";
const ATLASCLOUD_MANIFEST_PATH = "atlascloud-manifest.json";

const ATLAS_BASE = "https://api.atlascloud.ai";
const SUBMIT_IMAGE = "/api/v1/model/generateImage";
const SUBMIT_VIDEO = "/api/v1/model/generateVideo";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 600;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_MAX_WAIT_MS = 30000;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Parse a Retry-After header (delta-seconds or HTTP-date) into a bounded wait.
// Returns null when absent/unparseable so the caller falls back to its backoff.
// Capping matters: an unbounded header value (or a NaN from an HTTP-date) would
// otherwise hang for hours or collapse the backoff to zero.
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) {
    return Math.min(RETRY_MAX_WAIT_MS, Math.max(0, secs * 1000));
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(RETRY_MAX_WAIT_MS, Math.max(0, dateMs - Date.now()));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manifest peek — model id → declared field names + modality
// ---------------------------------------------------------------------------

interface AtlasManifestField {
  name: string;
  array?: boolean;
}
interface AtlasManifestEntry {
  modelId: string;
  modality?: "image" | "video";
  outputType?: "image" | "video";
  fields?: AtlasManifestField[];
}

interface ModelInfo {
  modality: "image" | "video";
  fields: Set<string>;
}

function buildModelMap(): Map<string, ModelInfo> {
  const map = new Map<string, ModelInfo>();
  const manifest = loadManifest(
    ATLASCLOUD_MANIFEST_PKG,
    ATLASCLOUD_MANIFEST_PATH
  ) as AtlasManifestEntry[];
  for (const entry of manifest) {
    if (!entry.modelId) continue;
    const modality = entry.modality ?? entry.outputType;
    if (modality !== "image" && modality !== "video") continue;
    const fields = new Set<string>((entry.fields ?? []).map((f) => f.name));
    map.set(entry.modelId, { modality, fields });
  }
  return map;
}

// ---------------------------------------------------------------------------
// HTTP helpers (duplicated from atlascloud-nodes/atlascloud-base.ts to keep
// runtime free of node-pack code dependencies — mirrors topaz-provider).
// ---------------------------------------------------------------------------

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  maxAttempts = 6
): Promise<Response> {
  let delay = 1000;
  let last: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, init);
    if (!RETRYABLE_STATUS.has(resp.status)) return resp;
    last = resp;
    if (attempt === maxAttempts) break;
    const wait = parseRetryAfterMs(resp.headers.get("Retry-After")) ?? delay;
    await sleep(wait);
    delay = Math.min(delay * 2, RETRY_MAX_WAIT_MS);
  }
  return last as Response;
}

async function atlasSubmit(
  apiKey: string,
  modality: "image" | "video",
  modelId: string,
  input: Record<string, unknown>
): Promise<string> {
  const path = modality === "image" ? SUBMIT_IMAGE : SUBMIT_VIDEO;
  // Submit POST is not idempotent — never retry.
  const res = await fetch(`${ATLAS_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: modelId, ...input })
  });
  const text = await res.text();
  let data: { data?: { id?: string }; message?: string } | null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`AtlasCloud submit ${res.status}: ${text.slice(0, 500)}`);
  }
  const id = data?.data?.id;
  if (!id) {
    throw new Error(
      `AtlasCloud: no prediction id in submit response: ${text.slice(0, 500)}`
    );
  }
  return id;
}

interface AtlasPollResult {
  status?: string;
  outputs?: Array<string | { url?: string }>;
  output?: string;
  url?: string;
  error?: string;
}

async function atlasPoll(
  apiKey: string,
  predictionId: string,
  pollInterval = POLL_INTERVAL_MS,
  maxAttempts = MAX_POLL_ATTEMPTS
): Promise<AtlasPollResult> {
  const url = `${ATLAS_BASE}/api/v1/model/prediction/${predictionId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchWithRetry(url, { headers: authHeaders(apiKey) });
    const text = await res.text();
    let data: { data?: AtlasPollResult; message?: string } | null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const d = data?.data ?? {};
    const status = String(d.status ?? "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      return d;
    }
    if (status === "failed" || status === "error") {
      const msg = d.error || data?.message || text.slice(0, 500);
      throw new Error(
        `AtlasCloud job failed: ${msg} (predictionId: ${predictionId})`
      );
    }
    if (!res.ok) {
      throw new Error(`AtlasCloud poll ${res.status}: ${text.slice(0, 500)}`);
    }
    await sleep(pollInterval);
  }
  throw new Error(`AtlasCloud job timed out (predictionId: ${predictionId})`);
}

function pickOutputUrl(result: AtlasPollResult): string {
  if (Array.isArray(result.outputs) && result.outputs.length > 0) {
    const first = result.outputs[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "string") return first.url;
  }
  if (typeof result.output === "string") return result.output;
  if (typeof result.url === "string") return result.url;
  throw new Error("No output URL in AtlasCloud result");
}

// ---------------------------------------------------------------------------
// Image mime detection (for data: URIs)
// ---------------------------------------------------------------------------

function detectImageMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

function imageDataUri(bytes: Uint8Array): string {
  return `data:${detectImageMime(bytes)};base64,${Buffer.from(bytes).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Params → AtlasCloud input mapping
// ---------------------------------------------------------------------------

/**
 * Set a field on `input` under the first manifest-declared name that matches.
 * Accepts a list of candidates because AtlasCloud is inconsistent: image
 * schemas use `aspect_ratio`, Seedance video schemas use `ratio`; GPT Image 2
 * uses `size` (`"WxH"`) instead of `width`/`height`.
 */
function setIfDeclared(
  input: Record<string, unknown>,
  info: ModelInfo,
  value: unknown,
  ...candidates: string[]
): void {
  if (value === undefined || value === null || value === "") return;
  for (const name of candidates) {
    if (info.fields.has(name)) {
      input[name] = value;
      return;
    }
  }
}

/** Build the request input for a text-to-image / image-to-image call. */
function mapImageParams(
  info: ModelInfo,
  params: TextToImageParams | ImageToImageParams
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: params.prompt };
  setIfDeclared(input, info, params.aspectRatio, "aspect_ratio", "ratio");
  setIfDeclared(input, info, params.resolution, "resolution");
  setIfDeclared(input, info, params.quality, "quality");
  setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
  setIfDeclared(input, info, params.seed, "seed");
  // GPT Image 2 uses `size: "WxH"` instead of width/height.
  if (info.fields.has("size")) {
    const w =
      (params as TextToImageParams).width ??
      (params as ImageToImageParams).targetWidth;
    const h =
      (params as TextToImageParams).height ??
      (params as ImageToImageParams).targetHeight;
    if (w && h) input.size = `${w}x${h}`;
  }
  return input;
}

/** Build the request input for a text-to-video / image-to-video call. */
function mapVideoParams(
  info: ModelInfo,
  params: TextToVideoParams | ImageToVideoParams
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (params.prompt) input.prompt = params.prompt;
  setIfDeclared(input, info, params.aspectRatio, "ratio", "aspect_ratio");
  setIfDeclared(input, info, params.resolution, "resolution");
  setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
  setIfDeclared(input, info, params.seed, "seed");
  // Seedance schemas: integer `duration` in seconds; -1 means "model decides".
  if (params.durationSeconds != null) {
    setIfDeclared(input, info, Math.trunc(params.durationSeconds), "duration");
  }
  return input;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AtlasCloudProvider extends BaseProvider {
  private readonly apiKey: string;
  private modelMap: Map<string, ModelInfo> | null = null;

  static override requiredSecrets(): string[] {
    return ["ATLASCLOUD_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("atlascloud");
    this.apiKey = (secrets["ATLASCLOUD_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { ATLASCLOUD_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("atlascloud does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("atlascloud does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    if (!this.apiKey) return [];
    try {
      return loadImageModels(
        ATLASCLOUD_MANIFEST_PKG,
        ATLASCLOUD_MANIFEST_PATH,
        "atlascloud"
      );
    } catch (err) {
      log.warn(`Failed to load AtlasCloud image models: ${err}`);
      return [];
    }
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    if (!this.apiKey) return [];
    try {
      return loadVideoModels(
        ATLASCLOUD_MANIFEST_PKG,
        ATLASCLOUD_MANIFEST_PATH,
        "atlascloud"
      );
    } catch (err) {
      log.warn(`Failed to load AtlasCloud video models: ${err}`);
      return [];
    }
  }

  private requireApiKey(): string {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("ATLASCLOUD_API_KEY is not configured");
    }
    return this.apiKey;
  }

  private getModelMap(): Map<string, ModelInfo> {
    if (!this.modelMap) this.modelMap = buildModelMap();
    return this.modelMap;
  }

  private resolveModel(modelId: string, expected: "image" | "video"): ModelInfo {
    const info = this.getModelMap().get(modelId);
    if (!info) {
      throw new Error(`Unknown AtlasCloud model: ${modelId}`);
    }
    if (info.modality !== expected) {
      throw new Error(
        `AtlasCloud model ${modelId} is a ${info.modality} model, not ${expected}`
      );
    }
    return info;
  }

  /** Submit, poll, download. Shared by all four capability methods. */
  private async runJob(
    modality: "image" | "video",
    modelId: string,
    input: Record<string, unknown>
  ): Promise<Uint8Array> {
    const apiKey = this.requireApiKey();
    log.debug("AtlasCloud submit", { modality, model: modelId });
    const predictionId = await atlasSubmit(apiKey, modality, modelId, input);
    const result = await atlasPoll(apiKey, predictionId);
    const url = pickOutputUrl(result);
    const dl = await fetchWithRetry(url);
    if (!dl.ok) {
      throw new Error(
        `AtlasCloud download failed: HTTP ${dl.status} fetching ${url}`
      );
    }
    return new Uint8Array(await dl.arrayBuffer());
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");
    const info = this.resolveModel(params.model.id, "image");
    const input = mapImageParams(info, params);
    return this.runJob("image", params.model.id, input);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const sources = images.filter((b) => b && b.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty");
    }
    const info = this.resolveModel(params.model.id, "image");
    const input = mapImageParams(info, params);
    // AtlasCloud `*/edit` endpoints accept the input image(s) as `images: [url]`
    // (Grok Imagine uses `image_urls`). Seedance never goes through this method
    // (it's video-only). Other image-to-image endpoints that use `image`
    // (singular) get that mapping too.
    const dataUris = sources.map((b) => imageDataUri(b));
    if (info.fields.has("images")) {
      input.images = dataUris;
    } else if (info.fields.has("image_urls")) {
      input.image_urls = dataUris;
    } else if (info.fields.has("image")) {
      input.image = dataUris[0];
    } else {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not declare an input image field`
      );
    }
    return this.runJob("image", params.model.id, input);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");
    const info = this.resolveModel(params.model.id, "video");
    const input = mapVideoParams(info, params);
    return this.runJob("video", params.model.id, input);
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const image = images[0];
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const info = this.resolveModel(params.model.id, "video");
    const input = mapVideoParams(info, params);
    // Seedance image-to-video uses `image` (singular); Grok Imagine Video uses
    // `image_url`. Reference-to-video has `reference_images` (list) instead —
    // generic imageToVideo can't target it.
    const dataUri = imageDataUri(image);
    if (info.fields.has("image")) {
      input.image = dataUri;
    } else if (info.fields.has("image_url")) {
      input.image_url = dataUri;
    } else if (info.fields.has("images")) {
      input.images = [dataUri];
    } else if (info.fields.has("reference_images")) {
      input.reference_images = [dataUri];
    } else {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not accept an input image (try the Seedance image-to-video variant)`
      );
    }
    return this.runJob("video", params.model.id, input);
  }
}
