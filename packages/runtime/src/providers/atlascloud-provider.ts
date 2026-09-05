/**
 * AtlasCloud Provider — AtlasCloud.ai aggregates chat, image and video models
 * behind one API key (`ATLASCLOUD_API_KEY`, surfaced in Settings → API Keys).
 *
 * Two different wire protocols live behind that key, so this provider speaks
 * both:
 *
 *  1. Chat — OpenAI-compatible, `https://api.atlascloud.ai/v1`. Inherited from
 *     {@link OpenAICompatProvider}; model discovery reads `GET /v1/models`.
 *     https://www.atlascloud.ai/docs/get-started
 *
 *  2. Image / video — AtlasCloud's own async prediction API:
 *       - Submit: POST /api/v1/model/generate{Image,Video}, FLAT body
 *                   { model, ...fields }  (NOT nested under `input`)
 *                 → { data: { id } }
 *       - Poll:   GET  /api/v1/model/prediction/{id}
 *                 → { data: { status, outputs: [url], error? } }
 *       - Submit POST is NEVER retried — a 429/5xx may have actually created
 *         the job upstream, and a retry would double-bill.
 *     https://www.atlascloud.ai/docs/models/image · /docs/predictions
 *
 * Request fields are validated against the per-model schema shipped in
 * `@nodetool-ai/atlascloud-nodes`'s manifest (itself generated from
 * AtlasCloud's published model schemas) before being sent, so a generic
 * text-to-image call can't put `1024x1024` into a model whose `size` enum only
 * accepts `1K`/`2K`, or an 10s duration into a model that only allows 4/6/8.
 */

import { OpenAICompatProvider } from "./openai-compat-provider.js";
import { bytesToImageDataUri } from "./image-mime.js";
import type { OpenAICompatProviderOptions } from "./openai-compat-provider.js";
import { createLogger } from "@nodetool-ai/config";
import { isBoolean, isNumber } from "@nodetool-ai/protocol";
import {
  ATLAS_BASE,
  atlasDownload,
  atlasPoll,
  atlasSubmit,
  pickOutputUrl
} from "./atlascloud-transport.js";
import {
  getManifestNodeMeta,
  getModelInputFields,
  loadImageModels,
  loadManifest,
  loadVideoModels
} from "./manifest-models.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.atlascloud");

const ATLASCLOUD_MANIFEST_PKG = "@nodetool-ai/atlascloud-nodes";
const ATLASCLOUD_MANIFEST_PATH = "atlascloud-manifest.json";

const ATLAS_CHAT_BASE_URL = `${ATLAS_BASE}/v1`;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_ATTEMPTS = 600;

// ---------------------------------------------------------------------------
// Manifest peek — model id → declared fields + modality
// ---------------------------------------------------------------------------

interface FieldInfo {
  /** "str" | "enum" | "int" | "float" | "bool" | "image" | "list[image]" | … */
  type: string;
  /** Allowed values when the field is an enum. Numbers stay numbers. */
  values?: Array<string | number>;
  default?: unknown;
  /** Request array this field belongs in, as `{url, type}` — see the manifest. */
  wrapInto?: string;
}

interface ModelInfo {
  modality: "image" | "video";
  fields: Map<string, FieldInfo>;
  pollInterval: number;
  maxAttempts: number;
}

interface AtlasManifestEntry {
  modelId?: string;
  modality?: "image" | "video";
  outputType?: "image" | "video";
}

function buildModelMap(): Map<string, ModelInfo> {
  const map = new Map<string, ModelInfo>();
  const manifest = loadManifest(
    ATLASCLOUD_MANIFEST_PKG,
    ATLASCLOUD_MANIFEST_PATH
  ) as AtlasManifestEntry[];
  for (const entry of manifest) {
    const id = entry.modelId;
    if (!id) continue;
    const modality = entry.modality ?? entry.outputType;
    if (modality !== "image" && modality !== "video") continue;
    const fields = new Map<string, FieldInfo>();
    for (const f of getModelInputFields(
      ATLASCLOUD_MANIFEST_PKG,
      ATLASCLOUD_MANIFEST_PATH,
      id
    )) {
      const field: FieldInfo = { type: f.type };
      if (f.enumValues) {
        field.values = f.enumValues;
      }
      if (f.default !== undefined) {
        field.default = f.default;
      }
      if (f.wrapInto !== undefined) {
        field.wrapInto = f.wrapInto;
      }
      fields.set(f.name, field);
    }
    const meta = getManifestNodeMeta(
      ATLASCLOUD_MANIFEST_PKG,
      ATLASCLOUD_MANIFEST_PATH,
      id
    );
    map.set(id, {
      modality,
      fields,
      pollInterval: meta?.pollInterval ?? DEFAULT_POLL_INTERVAL_MS,
      maxAttempts: meta?.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS
    });
  }
  return map;
}

type RunJobOptions = { timeoutSeconds?: number | null; signal?: AbortSignal };

/**
 * The `runJob` options a generation call carries, with each one the caller left
 * unset omitted.
 */
function runJobOptions(params: {
  timeoutSeconds?: number | null;
  signal?: AbortSignal;
}): RunJobOptions {
  const opts: RunJobOptions = {};
  if (params.timeoutSeconds) {
    opts.timeoutSeconds = params.timeoutSeconds;
  }
  if (params.signal) {
    opts.signal = params.signal;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Params → AtlasCloud input mapping
// ---------------------------------------------------------------------------

/** Coerce a value to the manifest-declared scalar type, or null when it can't. */
function coerceToType<T>(value: T, type: string): T | number | boolean | null {
  switch (type) {
    case "int": {
      const n = isNumber(value) ? value : Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "float": {
      const n = isNumber(value) ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return isBoolean(value) ? value : String(value) === "true";
    default:
      return value;
  }
}

/**
 * Resolve `value` against a declared field: coerce it to the field's type and,
 * for enums, require membership. Numeric enums snap to the nearest allowed
 * value (a 10-second request against a 4/6/8 model becomes 8 rather than a
 * 422); string enums must match exactly. Returns null when the field can't
 * take the value at all.
 */
function resolveForField<T>(
  field: FieldInfo,
  value: T
): T | string | number | boolean | null {
  const coerced = coerceToType(value, field.type);
  if (coerced === null || coerced === undefined || coerced === "") return null;
  const allowed = field.values;
  if (!allowed || allowed.length === 0) return coerced;
  // Return the declared member so numeric enums keep their JSON type.
  const member = allowed.find((v) => String(v) === String(coerced));
  if (member !== undefined) return member;
  if (isNumber(coerced)) {
    // Negative members are sentinels ("-1" = let the model decide), never a
    // sensible approximation of a number the caller actually asked for.
    const numeric = allowed
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 0);
    if (numeric.length > 0) {
      return numeric.reduce((best, v) =>
        Math.abs(v - coerced) < Math.abs(best - coerced) ? v : best
      );
    }
  }
  return null;
}

/**
 * Set a value on `input` under the first candidate field that both declares it
 * and accepts the value. AtlasCloud is inconsistent across model families —
 * image schemas use `aspect_ratio`, Seedance video schemas use `ratio`, Wan
 * expresses resolution through a `size` enum of `1K`/`2K` — so callers pass
 * every plausible name and let the declared schema pick.
 */
function setIfDeclared(
  input: Record<string, unknown>,
  info: ModelInfo,
  value: string | number | null | undefined,
  ...candidates: string[]
): void {
  if (value === undefined || value === null || value === "") return;
  for (const name of candidates) {
    const field = info.fields.get(name);
    if (!field) continue;
    const resolved = resolveForField(field, value);
    if (resolved !== null) {
      input[name] = resolved;
      return;
    }
  }
  log.debug("AtlasCloud: dropping unsupported parameter", {
    candidates,
    value
  });
}

/** Pixel granularity every AtlasCloud diffusion model accepts. */
const SIZE_MULTIPLE = 16;

/** Round a dimension to the nearest multiple of `step`, never below `step`. */
function snapToMultiple(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** Parse a `1024x768` / `1024*768` size string into pixel dimensions. */
function parseSize(value: string): { w: number; h: number } | null {
  const m = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(value);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/**
 * Render width×height for a model's `size` field.
 *
 * The field is a free string on some models and a fixed enum on others, and
 * the separator differs by family (`1024x1024` on GPT Image, `1024*1024` on
 * Seedream / Qwen / Wan). Free-string fields take the requested dimensions
 * verbatim under the separator the model's own default uses — `*` when the
 * default declares none, which is what every free-string `size` on AtlasCloud
 * wants: the `x` form is an OpenAI-family enum, and Qwen Image 3 rejects it
 * outright (`invalid qwen image size "1024x1024"; use width*height`) while
 * FLUX 2 fails evaluating its per-megapixel price. Enum fields get
 * the declared option closest in aspect ratio, then in area. Enums with no
 * parseable dimensions at all (Wan's `1K`/`2K`) yield null — the caller leaves
 * the model default in place instead of sending an option that would 422.
 */
function renderSize(field: FieldInfo, w: number, h: number): string | null {
  const allowed = field.values;
  if (!allowed || allowed.length === 0) {
    const sep = String(field.default ?? "").includes("x") ? "x" : "*";
    // Latent-diffusion models on AtlasCloud take dimensions in multiples of 16
    // (8× VAE downsample, 2× patch). A caller-supplied 1920×1080 is rejected at
    // submit with a bare "Invalid request parameters", so snap each side to the
    // nearest legal multiple rather than sending a size that cannot render.
    const sw = snapToMultiple(w, SIZE_MULTIPLE);
    const sh = snapToMultiple(h, SIZE_MULTIPLE);
    if (sw !== w || sh !== h) {
      log.debug("AtlasCloud: snapped size to a legal multiple", {
        requested: `${w}${sep}${h}`,
        sent: `${sw}${sep}${sh}`
      });
    }
    return `${sw}${sep}${sh}`;
  }
  const exact = allowed.find(
    (v) => String(v) === `${w}x${h}` || String(v) === `${w}*${h}`
  );
  if (exact !== undefined) return String(exact);
  const wanted = w / h;
  const wantedArea = w * h;
  let best: { value: string; ratioDelta: number; areaDelta: number } | null =
    null;
  for (const option of allowed) {
    const parsed = parseSize(String(option));
    if (!parsed) continue;
    const ratioDelta = Math.abs(parsed.w / parsed.h - wanted);
    const areaDelta = Math.abs(parsed.w * parsed.h - wantedArea);
    if (
      !best ||
      ratioDelta < best.ratioDelta - 1e-6 ||
      (Math.abs(ratioDelta - best.ratioDelta) <= 1e-6 &&
        areaDelta < best.areaDelta)
    ) {
      best = { value: String(option), ratioDelta, areaDelta };
    }
  }
  return best?.value ?? null;
}

/** Build the request input for a text-to-image / image-to-image call. */
function mapImageParams(
  info: ModelInfo,
  params: TextToImageParams | ImageToImageParams
) {
  const input: Record<string, unknown> = { prompt: params.prompt };
  setIfDeclared(input, info, params.aspectRatio, "aspect_ratio", "ratio");
  setIfDeclared(input, info, params.resolution, "resolution");
  setIfDeclared(input, info, params.quality, "quality");
  setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
  setIfDeclared(input, info, params.seed, "seed");
  setIfDeclared(input, info, params.guidanceScale, "cfg_scale");
  const sizeField = info.fields.get("size");
  // Wan expresses resolution as a `size` enum (`1K`/`2K`/`4K`), so a named tier
  // belongs there — but only when the enum declares it. A free-string `size`
  // takes `width*height` and nothing else: AtlasCloud prices FLUX 2 by
  // megapixels parsed out of that string, so a `size: "1K"` it never declared
  // is rejected before the job exists ("failed to evaluate price: … asFloat:
  // cannot convert 1K"). Leave that field to the pixel renderer below.
  if (sizeField?.values && sizeField.values.length > 0) {
    setIfDeclared(input, info, params.resolution, "size");
  }
  if (sizeField && input.size === undefined) {
    const w =
      (params as TextToImageParams).width ??
      (params as ImageToImageParams).targetWidth;
    const h =
      (params as TextToImageParams).height ??
      (params as ImageToImageParams).targetHeight;
    if (w && h) {
      const size = renderSize(sizeField, w, h);
      if (size !== null) input.size = size;
    }
  }
  return input;
}

/** Build the request input for a text-to-video / image-to-video call. */
function mapVideoParams(
  info: ModelInfo,
  params: TextToVideoParams | ImageToVideoParams
) {
  const input: Record<string, unknown> = {};
  if (params.prompt) input.prompt = params.prompt;
  setIfDeclared(input, info, params.aspectRatio, "ratio", "aspect_ratio");
  setIfDeclared(input, info, params.resolution, "resolution");
  setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
  setIfDeclared(input, info, params.seed, "seed");
  setIfDeclared(input, info, params.guidanceScale, "cfg_scale");
  // Duration is an integer count of seconds; the enums differ per model
  // (Seedance takes 4–15, Veo only 4/6/8), so resolveForField snaps it.
  if (params.durationSeconds != null) {
    setIfDeclared(input, info, Math.trunc(params.durationSeconds), "duration");
  }
  return input;
}

// ---------------------------------------------------------------------------
// Chat models
// ---------------------------------------------------------------------------

interface AtlasChatModelRow {
  id?: string;
  name?: string;
  supported_features?: string[];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AtlasCloudProvider extends OpenAICompatProvider {
  private modelMap: Map<string, ModelInfo> | null = null;
  private chatModels: Promise<AtlasChatModelRow[]> | null = null;
  private readonly atlasFetch: typeof fetch;

  static override requiredSecrets(): string[] {
    return ["ATLASCLOUD_API_KEY"];
  }

  constructor(
    secrets: { ATLASCLOUD_API_KEY?: string } = {},
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.ATLASCLOUD_API_KEY;
    if (!apiKey) {
      throw new Error("ATLASCLOUD_API_KEY is required");
    }
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    super(
      { providerId: "atlascloud", apiKey, baseURL: ATLAS_CHAT_BASE_URL },
      { ...options, fetchFn }
    );
    this.atlasFetch = fetchFn;
  }

  override getContainerEnv() {
    return { ATLASCLOUD_API_KEY: this.apiKey };
  }

  // ─── Chat ────────────────────────────────────────────────────────────────

  /**
   * `GET /v1/models` — the OpenAI-compatible listing, which covers only the
   * chat models. Image/video/audio models live in the separate
   * `/api/v1/models` catalog and are served by the prediction API below.
   */
  private listChatModels(): Promise<AtlasChatModelRow[]> {
    // Cache the successful listing; drop the cache on failure so a transient
    // outage doesn't leave this provider instance permanently model-less.
    this.chatModels ??= (async () => {
      const res = await this.atlasFetch(`${ATLAS_CHAT_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      if (!res.ok) {
        throw new Error(`AtlasCloud model listing failed: HTTP ${res.status}`);
      }
      const payload = (await res.json()) as { data?: AtlasChatModelRow[] };
      return payload.data ?? [];
    })().catch((err) => {
      log.warn(`Failed to list AtlasCloud chat models: ${err}`);
      this.chatModels = null;
      return [];
    });
    return this.chatModels;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const rows = await this.listChatModels();
    return rows
      .filter((row): row is AtlasChatModelRow & { id: string } =>
        Boolean(row.id)
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "atlascloud" as const
      }));
  }

  /** AtlasCloud declares tool support per model in `supported_features`. */
  override async hasToolSupport(model: string): Promise<boolean> {
    const rows = await this.listChatModels();
    const row = rows.find((r) => r.id === model);
    // Unknown model: assume tools work rather than silently dropping them.
    if (!row?.supported_features) return true;
    return row.supported_features.includes("tools");
  }

  // ─── Image / video models ────────────────────────────────────────────────

  override async getAvailableImageModels(): Promise<ImageModel[]> {
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

  private getModelMap(): Map<string, ModelInfo> {
    this.modelMap ??= buildModelMap();
    return this.modelMap;
  }

  private resolveModel(
    modelId: string,
    expected: "image" | "video"
  ): ModelInfo {
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
    info: ModelInfo,
    input: Record<string, unknown>,
    opts: { timeoutSeconds?: number | null; signal?: AbortSignal } = {}
  ): Promise<Uint8Array> {
    const apiKey = this.apiKey;
    log.debug("AtlasCloud submit", { modality, model: modelId });
    const predictionId = await atlasSubmit(
      apiKey,
      modality,
      modelId,
      input,
      opts.signal
    );
    // A caller-supplied timeout bounds the polling window; without one the
    // model's own manifest budget applies.
    const maxAttempts = opts.timeoutSeconds
      ? Math.max(1, Math.ceil((opts.timeoutSeconds * 1000) / info.pollInterval))
      : info.maxAttempts;
    const result = await atlasPoll(apiKey, predictionId, {
      pollInterval: info.pollInterval,
      maxAttempts,
      ...(opts.signal ? { signal: opts.signal } : {})
    });
    return atlasDownload(pickOutputUrl(result), opts.signal);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");
    const info = this.resolveModel(params.model.id, "image");
    const input = mapImageParams(info, params);
    return this.runJob(
      "image",
      params.model.id,
      info,
      input,
      runJobOptions(params)
    );
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
    const dataUris = sources.map((b) => bytesToImageDataUri(b));
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
    return this.runJob(
      "image",
      params.model.id,
      info,
      input,
      runJobOptions(params)
    );
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");
    const info = this.resolveModel(params.model.id, "video");
    const input = mapVideoParams(info, params);
    return this.runJob(
      "video",
      params.model.id,
      info,
      input,
      runJobOptions(params)
    );
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
    // Each endpoint family names its input image differently: Seedance uses
    // `image` (singular), Grok Imagine Video `image_url`, the edit endpoints
    // `images`, and reference-to-video `reference_images`. First match wins.
    const dataUri = bytesToImageDataUri(image);
    const imageField = ["image", "image_url", "images", "reference_images"].find(
      (name) => info.fields.has(name)
    );
    if (imageField) {
      // Wan 3.0 / MiniMax H3 take one mixed `refers` array of `{url, type}`
      // objects; the manifest splits it into typed inputs that name it.
      const wrapInto = info.fields.get(imageField)?.wrapInto;
      if (wrapInto) {
        input[wrapInto] = [{ url: dataUri, type: "image" }];
      } else if (imageField === "images" || imageField === "reference_images") {
        input[imageField] = [dataUri];
      } else {
        input[imageField] = dataUri;
      }
    } else {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not accept an input image (try the Seedance image-to-video variant)`
      );
    }
    return this.runJob(
      "video",
      params.model.id,
      info,
      input,
      runJobOptions(params)
    );
  }
}
