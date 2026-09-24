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
 *  2. Image / video / audio — AtlasCloud's own async prediction API:
 *       - Submit: POST /api/v1/model/generate{Image,Video,Audio}, FLAT body
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

import { unzipSync } from "fflate";
import { OpenAICompatProvider } from "./openai-compat-provider.js";
import { bytesToImageDataUri } from "./image-mime.js";
import { sniffMediaMime } from "./media-mime.js";
import type { OpenAICompatProviderOptions } from "./openai-compat-provider.js";
import { createLogger } from "@nodetool-ai/config";
import { isBoolean, isNumber } from "@nodetool-ai/protocol";
import {
  ATLAS_BASE,
  atlasAwaitResult,
  atlasDownload,
  atlasGetPrediction,
  atlasSubmit,
  atlasUploadMedia,
  outputUrls,
  pickOutputUrl
} from "./atlascloud-transport.js";
import {
  providerGeneration,
  type ProviderGeneration,
  type ProviderGenerationLookup,
  type ProviderGenerationStatus
} from "./provider-generations.js";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES
} from "./http-transport.js";
import {
  getManifestNodeMeta,
  getModelInputFields,
  getModelReferenceInputs,
  validateReferenceInputs,
  loadImageModels,
  loadManifest,
  loadVideoModels
} from "./manifest-models.js";
import type {
  ASRModel,
  EncodedAudioResult,
  ExtendVideoParams,
  ImageTo3DParams,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  LipSyncParams,
  Model3D,
  MusicModel,
  RemoveBackgroundParams,
  TextTo3DParams,
  TextToImageParams,
  TextToMusicParams,
  TextToSpeechParams,
  TextToVideoParams,
  TTSModel,
  UpscaleVideoParams,
  VideoToVideoParams,
  VideoModel
} from "./types.js";
import type {
  ReferenceToVideoInputs,
  ReferenceToVideoParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.atlascloud");

const ATLASCLOUD_MANIFEST_PKG = "@nodetool-ai/atlascloud-nodes";
const ATLASCLOUD_MANIFEST_PATH = "atlascloud-manifest.json";

const ATLAS_CHAT_BASE_URL = `${ATLAS_BASE}/v1`;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_ATTEMPTS = 600;

const ATLASCLOUD_TTS_MODELS: readonly TTSModel[] = [
  ["bytedance/seed-audio-1.0", "Seed Audio 1.0"],
  ["minimax/speech-2.6-turbo", "MiniMax Speech 2.6 Turbo"],
  ["minimax/speech-2.6-hd", "MiniMax Speech 2.6 HD"],
  ["xai/tts-v1", "xAI TTS v1"],
  ["elevenlabs/v3/text-to-speech", "ElevenLabs v3 Text-to-Speech"],
  ["google/gemini-3.1-flash-tts", "Gemini 3.1 Flash TTS"],
  ["google/gemini-2.5-flash-tts", "Gemini 2.5 Flash TTS"],
  ["google/gemini-2.5-pro-tts", "Gemini 2.5 Pro TTS"]
].map(([id, name]) => ({ id, name, provider: "atlascloud" }));

const ATLASCLOUD_MUSIC_MODELS: readonly MusicModel[] = [
  ["minimax/music-3.0", "MiniMax Music 3.0"],
  ["minimax/music-2.6", "MiniMax Music 2.6"],
  ["suno/chirp-v6", "Suno chirp-v6"],
  ["suno/chirp-v6-wild", "Suno chirp-v6-wild"],
  ["suno/chirp-v6-mini", "Suno chirp-v6-mini"]
].map(([id, name]) => ({
  id,
  name,
  provider: "atlascloud",
  supportedTasks: ["text_to_music"]
}));

const ATLASCLOUD_ASR_MODELS: readonly ASRModel[] = [
  { id: "bytedance/seed-asr-2.0", name: "Seed ASR 2.0", provider: "atlascloud" },
  { id: "xai/stt-v1", name: "xAI STT v1", provider: "atlascloud" }
];

const ATLASCLOUD_3D_MODELS: readonly Model3D[] = (
  [
    ["tripo-h3.1/text-to-3d", "Tripo H3.1 Text-to-3D", ["text_to_3d"]],
    ["tencent/hunyuan3d-rapid/text-to-3d", "Hunyuan 3D Rapid Text-to-3D", ["text_to_3d"]],
    ["tencent/hunyuan3d-pro/text-to-3d", "Hunyuan 3D Pro Text-to-3D", ["text_to_3d"]],
    ["meshy-v7/text-to-3d", "Meshy v7 Text-to-3D", ["text_to_3d"]],
    ["bytedance/seed3d-v2.0/image-to-3d", "Seed3D 2.0 Image-to-3D", ["image_to_3d"]],
    ["tripo-h3.1/image-to-3d", "Tripo H3.1 Image-to-3D", ["image_to_3d"]],
    ["tencent/hunyuan3d-rapid/image-to-3d", "Hunyuan 3D Rapid Image-to-3D", ["image_to_3d"]],
    ["tencent/hunyuan3d-pro/image-to-3d", "Hunyuan 3D Pro Image-to-3D", ["image_to_3d"]],
    ["hi3d/v3.0-master/image-to-3d", "HI3D v3.0 Master", ["image_to_3d"]],
    ["hi3d/v3.0-quality/image-to-3d", "HI3D v3.0 Quality", ["image_to_3d"]],
    ["hi3d/v2.1-pro/image-to-3d", "HI3D v2.1 Pro", ["image_to_3d"]],
    ["hi3d/v2.1-fast/image-to-3d", "HI3D v2.1 Fast", ["image_to_3d"]],
    ["meshy-v7/multi-image-to-3d", "Meshy v7 Multi-Image-to-3D", ["image_to_3d"]],
    ["meshy-v7/image-to-3d", "Meshy v7 Image-to-3D", ["image_to_3d"]]
  ] as Array<[string, string, NonNullable<Model3D["supportedTasks"]>]>
).map(([id, name, supportedTasks]) => ({
  id,
  name,
  provider: "atlascloud",
  supportedTasks,
  outputFormats: ["glb"]
}));

function glbFromAtlasOutput(bytes: Uint8Array, modelId: string): Uint8Array {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;
  try {
    const files = unzipSync(bytes);
    const glbName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".glb"));
    const glb = glbName ? files[glbName] : undefined;
    if (!glb || glb.length < 12 || glb[0] !== 0x67 || glb[1] !== 0x6c || glb[2] !== 0x54 || glb[3] !== 0x46) {
      throw new Error("archive did not contain a valid GLB file");
    }
    return glb;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`AtlasCloud 3D model ${modelId} returned an unreadable ZIP archive: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Manifest peek — model id → declared fields + modality
// ---------------------------------------------------------------------------

interface FieldInfo {
  /** "str" | "enum" | "int" | "float" | "bool" | "image" | "list[image]" | … */
  type: string;
  /** Allowed values when the field is an enum. Numbers stay numbers. */
  values?: Array<string | number>;
  default?: unknown;
  required?: boolean;
  /** Request array this field belongs in, as `{url, type}` — see the manifest. */
  wrapInto?: string;
}

interface ModelInfo {
  modality: "image" | "video";
  fields: Map<string, FieldInfo>;
  pollInterval: number;
  maxAttempts: number;
}

function defaultModelInfo(modality: "image" | "video"): ModelInfo {
  return {
    modality,
    fields: new Map(),
    pollInterval: DEFAULT_POLL_INTERVAL_MS,
    maxAttempts: DEFAULT_MAX_POLL_ATTEMPTS
  };
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
      if (f.required !== undefined) {
        field.required = f.required;
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
    const fallback = resolveForField(field, field.default);
    if (fallback !== null) {
      input[name] = fallback;
      log.debug("AtlasCloud: using model default for unsupported parameter", {
        field: name,
        value,
        fallback
      });
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
  setIfDeclared(
    input,
    info,
    params.guidanceScale,
    "guidance_scale",
    "cfg_scale"
  );
  setIfDeclared(input, info, params.numInferenceSteps, "num_inference_steps");
  if ("strength" in params) {
    setIfDeclared(input, info, params.strength, "strength");
  }
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
  setIfDeclared(input, info, params.resolution, "resolution", "quality");
  setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
  setIfDeclared(input, info, params.seed, "seed");
  setIfDeclared(
    input,
    info,
    params.guidanceScale,
    "guidance_scale",
    "cfg_scale"
  );
  setIfDeclared(input, info, params.numInferenceSteps, "num_inference_steps");
  setIfDeclared(input, info, params.numFrames, "num_frames");
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

/**
 * AtlasCloud's prediction status in the shared vocabulary. `cancelled` is
 * reported as itself rather than folded into the failure set the poll loop
 * uses, because a reader asking after the fact needs the difference.
 */
function atlasGenerationStatus(
  status: string | undefined
): ProviderGenerationStatus {
  const value = (status ?? "").toLowerCase();
  if (value === "") return "unknown";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  if (TERMINAL_SUCCESS_STATES.has(value)) return "completed";
  if (TERMINAL_FAILURE_STATES.has(value)) return "failed";
  return "running";
}

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

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return ATLASCLOUD_TTS_MODELS.map((model) => ({ ...model }));
  }

  override supportsStreamingTextToSpeech(): boolean {
    return false;
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return ATLASCLOUD_MUSIC_MODELS.map((model) => ({
      ...model,
      supportedTasks: [...(model.supportedTasks ?? [])]
    }));
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return ATLASCLOUD_ASR_MODELS.map((model) => ({ ...model }));
  }

  override async getAvailable3DModels(): Promise<Model3D[]> {
    return ATLASCLOUD_3D_MODELS.map((model) => ({
      ...model,
      supportedTasks: [...(model.supportedTasks ?? [])],
      outputFormats: [...(model.outputFormats ?? [])]
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

  /** AtlasCloud's audio APIs use the same asynchronous prediction lifecycle. */
  private async runAudioPrediction(
    modelId: string,
    input: Record<string, unknown>,
    timeoutSeconds?: number | null
  ): Promise<Awaited<ReturnType<typeof atlasAwaitResult>>> {
    const predictionId = await atlasSubmit(
      this.apiKey,
      "audio",
      modelId,
      input
    );
    const maxAttempts = timeoutSeconds
      ? Math.max(1, Math.ceil((timeoutSeconds * 1000) / DEFAULT_POLL_INTERVAL_MS))
      : DEFAULT_MAX_POLL_ATTEMPTS;
    return atlasAwaitResult(this.apiKey, predictionId, {
      pollInterval: DEFAULT_POLL_INTERVAL_MS,
      maxAttempts
    });
  }

  override async textToSpeechEncoded(
    params: TextToSpeechParams
  ): Promise<EncodedAudioResult | null> {
    if (!params.text.trim()) throw new Error("Text is required");
    const models = await this.getAvailableTTSModels();
    if (!models.some((model) => model.id === params.model)) {
      throw new Error(`Unknown AtlasCloud TTS model: ${params.model}`);
    }
    const input: Record<string, unknown> = { model: params.model, text: params.text };
    if (params.voice) {
      if (params.model === "xai/tts-v1") input.voice_id = params.voice;
      else if (params.model !== "bytedance/seed-audio-1.0") {
        input.voice = params.voice;
      }
    }
    if (params.language && params.model === "xai/tts-v1") {
      input.language = params.language;
    } else if (params.model === "xai/tts-v1") {
      input.language = "auto";
    }
    if (params.speed !== undefined) {
      if (params.model.startsWith("minimax/speech-")) {
        input.speed = params.speed;
      } else if (params.model === "xai/tts-v1") {
        input.speed = params.speed;
      }
    }
    if (
      params.audioFormat &&
      (params.model === "bytedance/seed-audio-1.0" ||
        params.model.startsWith("minimax/speech-"))
    ) {
      input.format = params.audioFormat;
    }
    if (params.model === "bytedance/seed-audio-1.0" && params.speed != null) {
      input.speech_rate = Math.round((params.speed - 1) * 100);
    }
    if (params.model === "bytedance/seed-audio-1.0" && params.referenceAudio) {
      const referenceUrl = await this.uploadMedia(
        params.referenceAudio,
        sniffMediaMime(params.referenceAudio, "audio/mpeg"),
        "reference-voice"
      );
      input.references = [{ audio_url: referenceUrl }];
      input.text = `Use the voice of @audio1 and say: ${params.text}`;
    }

    const result = await this.runAudioPrediction(params.model, input);
    const output = pickOutputUrl(result);
    if (!output) {
      throw new Error(`AtlasCloud TTS returned no downloadable audio URL for ${params.model}`);
    }
    const data = await atlasDownload(output);
    return { data, mimeType: sniffMediaMime(data, "audio/mpeg") };
  }

  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    if (!params.prompt.trim()) throw new Error("Music prompt is required");
    const models = await this.getAvailableMusicModels();
    if (!models.some((model) => model.id === params.model.id)) {
      throw new Error(`Unknown AtlasCloud music model: ${params.model.id}`);
    }
    const input: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.model.id.startsWith("suno/")
        ? (params.lyrics || params.prompt)
        : params.prompt
    };
    if (params.model.id.startsWith("suno/")) {
      input.custom = Boolean(params.lyrics);
    } else if (params.lyrics) {
      input.lyrics = params.lyrics;
    }
    if (params.audioFormat && params.model.id.startsWith("minimax/")) {
      input.format = params.audioFormat;
    }
    const result = await this.runAudioPrediction(
      params.model.id,
      input,
      params.timeoutSeconds
    );
    const output = result.outputs?.find(
      (item): item is string => typeof item === "string" && /^https:\/\//i.test(item)
    );
    if (!output) {
      throw new Error(`AtlasCloud music model ${params.model.id} returned no audio URL`);
    }
    const data = await atlasDownload(output);
    return { data, mimeType: sniffMediaMime(data, "audio/mpeg") };
  }

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<{ text: string }> {
    if (args.audio.length === 0) throw new Error("audio must not be empty");
    if (!ATLASCLOUD_ASR_MODELS.some((model) => model.id === args.model)) {
      throw new Error(`Unknown AtlasCloud ASR model: ${args.model}`);
    }
    const audioUrl = await this.uploadMedia(
      args.audio,
      sniffMediaMime(args.audio, "audio/mpeg"),
      "input-audio"
    );
    const input: Record<string, unknown> = {
      model: args.model,
      [args.model === "bytedance/seed-asr-2.0" ? "audio_url" : "audio"]: audioUrl
    };
    if (args.language) input.language = args.language;
    if (args.prompt && args.model === "bytedance/seed-asr-2.0") {
      input.context = JSON.stringify({ hotwords: [{ word: args.prompt }] });
    }
    const result = await this.runAudioPrediction(args.model, input);
    const transcript = result.stt_result?.text ?? result.outputs?.[0];
    if (typeof transcript !== "string") {
      throw new Error(`AtlasCloud ASR model ${args.model} returned no transcript`);
    }
    return { text: transcript };
  }

  override async textTo3D(params: TextTo3DParams): Promise<Uint8Array> {
    if (!params.prompt.trim()) throw new Error("Prompt is required");
    const model = ATLASCLOUD_3D_MODELS.find(
      (item) => item.id === params.model.id && item.supportedTasks?.includes("text_to_3d")
    );
    if (!model) throw new Error(`AtlasCloud model ${params.model.id} does not support text_to_3d`);
    const input: Record<string, unknown> = { model: model.id, prompt: params.prompt };
    if (model.id.startsWith("tencent/hunyuan3d-")) input.format = "GLB";
    if (model.id.startsWith("meshy-v7/")) input.target_formats = ["glb"];
    const bytes = await this.runJob(
      "image",
      model.id,
      defaultModelInfo("image"),
      input,
      { timeoutSeconds: params.timeoutSeconds }
    );
    return glbFromAtlasOutput(bytes, model.id);
  }

  override async imageTo3D(
    image: Uint8Array,
    params: ImageTo3DParams
  ): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("image must not be empty");
    const model = ATLASCLOUD_3D_MODELS.find(
      (item) => item.id === params.model.id && item.supportedTasks?.includes("image_to_3d")
    );
    if (!model) throw new Error(`AtlasCloud model ${params.model.id} does not support image_to_3d`);
    const imageUrl = await this.uploadMedia(image, "image/png", "input-image");
    const input: Record<string, unknown> = { model: model.id };
    if (model.id === "bytedance/seed3d-v2.0/image-to-3d") {
      input.image = imageUrl;
      input.file_format = params.outputFormat?.toLowerCase() ?? "glb";
    } else if (model.id.includes("tripo-h3.1")) {
      input.image_url = imageUrl;
    } else if (model.id === "meshy-v7/multi-image-to-3d") {
      input.reference_images = [imageUrl];
      input.target_formats = ["glb"];
    } else {
      input.image = imageUrl;
      if (model.id.startsWith("tencent/hunyuan3d-rapid/")) input.format = "GLB";
      if (model.id.startsWith("hi3d/")) input.output_format = "glb";
      if (model.id.startsWith("meshy-v7/")) input.target_formats = ["glb"];
    }
    if (params.prompt) input.prompt = params.prompt;
    const bytes = await this.runJob(
      "image",
      model.id,
      defaultModelInfo("image"),
      input,
      { timeoutSeconds: params.timeoutSeconds }
    );
    return glbFromAtlasOutput(bytes, model.id);
  }

  /**
   * One AtlasCloud prediction by its id — the `provider_request_id` the local
   * row keeps. AtlasCloud publishes no listing endpoint, so `listGenerations`
   * stays unsupported and this provider advertises only `get_generation`.
   *
   * The prediction carries no cost or timestamps, so those fields are null:
   * the price of an AtlasCloud generation is the local row's estimate.
   */
  override async getGeneration(
    requestId: string,
    options: ProviderGenerationLookup = {}
  ): Promise<ProviderGeneration | null> {
    const opts: { fetchFn: typeof fetch; signal?: AbortSignal } = {
      fetchFn: this.atlasFetch
    };
    if (options.signal) opts.signal = options.signal;
    const result = await atlasGetPrediction(this.apiKey, requestId, opts);
    if (!result) return null;
    const fields: Parameters<typeof providerGeneration>[0] = {
      provider: "atlascloud",
      request_id: requestId,
      status: atlasGenerationStatus(result.status),
      output_urls: outputUrls(result),
      error: result.error ?? null
    };
    if (options.model !== undefined) fields.model = options.model;
    return providerGeneration(fields);
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
    // A caller-supplied timeout bounds the wait; without one the model's own
    // manifest budget applies.
    const maxAttempts = opts.timeoutSeconds
      ? Math.max(1, Math.ceil((opts.timeoutSeconds * 1000) / info.pollInterval))
      : info.maxAttempts;
    const waitOptions: Parameters<typeof atlasAwaitResult>[2] = {
      pollInterval: info.pollInterval,
      maxAttempts
    };
    if (opts.signal) {
      waitOptions.signal = opts.signal;
    }
    const result = await atlasAwaitResult(apiKey, predictionId, waitOptions);
    return atlasDownload(pickOutputUrl(result), opts.signal);
  }

  private uploadMedia(
    bytes: Uint8Array,
    fallbackMime: string,
    filename: string,
    signal?: AbortSignal
  ): Promise<string> {
    return atlasUploadMedia(
      this.apiKey,
      bytes,
      sniffMediaMime(bytes, fallbackMime),
      filename,
      signal
    );
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

  override async removeBackground(
    image: Uint8Array,
    params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const model = (await this.getAvailableImageModels()).find(
      (item) => item.id === params.model.id
    );
    if (!model?.supportedTasks?.includes("remove_background")) {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not support remove_background`
      );
    }
    const info = this.resolveModel(params.model.id, "image");
    const imageField = ["image", "image_url", "image_urls", "images"].find(
      (name) => info.fields.has(name)
    );
    if (!imageField) {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not declare an input image field`
      );
    }
    const dataUri = bytesToImageDataUri(image);
    const input: Record<string, unknown> = {
      [imageField]: info.fields.get(imageField)?.type.startsWith("list[")
        ? [dataUri]
        : dataUri
    };
    return this.runJob("image", params.model.id, info, input);
  }

  override async lipSync(
    video: Uint8Array,
    params: LipSyncParams
  ): Promise<Uint8Array> {
    if (video.length === 0) {
      throw new Error("video must not be empty");
    }
    if (params.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    const modelId = params.model.id;
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === modelId
    );
    if (!model?.supportedTasks?.includes("lip_sync")) {
      throw new Error(`AtlasCloud model ${modelId} does not support lip_sync`);
    }
    const info = this.resolveModel(modelId, "video");
    const videoField = ["video", "video_url", "input_video"].find((name) =>
      info.fields.has(name)
    );
    const audioField = ["audio", "audio_url", "input_audio"].find((name) =>
      info.fields.has(name)
    );
    if (!videoField || !audioField) {
      throw new Error(
        `AtlasCloud model ${modelId} does not declare video and audio fields`
      );
    }
    const [videoUrl, audioUrl] = await Promise.all([
      this.uploadMedia(video, "video/mp4", "input-video"),
      this.uploadMedia(params.audio, "audio/mpeg", "input-audio")
    ]);
    const input: Record<string, unknown> = {
      [videoField]: videoUrl,
      [audioField]: audioUrl
    };
    const syncModeDefault = info.fields.get("sync_mode")?.default;
    if (
      typeof syncModeDefault === "string" ||
      typeof syncModeDefault === "number"
    ) {
      setIfDeclared(input, info, syncModeDefault, "sync_mode");
    }
    setIfDeclared(input, info, params.seed, "seed");
    return this.runJob("video", modelId, info, input);
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
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === params.model.id
    );
    if (!model?.supportedTasks?.includes("image_to_video")) {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not support image_to_video`
      );
    }
    const info = this.resolveModel(params.model.id, "video");
    const input = mapVideoParams(info, params);
    const endImageField = ["last_image", "end_image", "end_frame_image"].find(
      (name) => info.fields.has(name)
    );
    if (endImageField) {
      if (info.fields.get(endImageField)?.required && !params.endImage?.length) {
        throw new Error(
          `AtlasCloud model ${params.model.id} requires ${endImageField}; pass it as endImage`
        );
      }
      if (params.endImage?.length) {
        input[endImageField] = bytesToImageDataUri(params.endImage);
      }
    } else if (params.endImage?.length) {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not accept an end image`
      );
    }
    const dataUri = bytesToImageDataUri(image);
    const imageField = [
      "first_frame_image",
      "start_image",
      "image",
      "image_url",
      "images",
      "image_urls"
    ].find((name) => info.fields.has(name));
    if (!imageField) {
      throw new Error(
        `AtlasCloud model ${params.model.id} does not declare a start image field`
      );
    }
    input[imageField] = info.fields.get(imageField)?.type.startsWith("list[")
      ? [dataUri]
      : dataUri;
    return this.runJob(
      "video",
      params.model.id,
      info,
      input,
      runJobOptions(params)
    );
  }

  override async upscaleVideo(
    video: Uint8Array,
    params: UpscaleVideoParams
  ): Promise<Uint8Array> {
    if (video.length === 0) {
      throw new Error("video must not be empty");
    }
    const modelId = params.model.id;
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === modelId
    );
    if (!model?.supportedTasks?.includes("upscale_video")) {
      throw new Error(
        `AtlasCloud model ${modelId} does not support upscale_video`
      );
    }
    const info = this.resolveModel(modelId, "video");
    const videoField = ["video", "video_url", "input_video"].find((name) =>
      info.fields.has(name)
    );
    if (!videoField) {
      throw new Error(
        `AtlasCloud model ${modelId} does not declare a video field`
      );
    }
    const videoUrl = await this.uploadMedia(
      video,
      "video/mp4",
      "input-video",
      params.signal
    );
    const input: Record<string, unknown> = {
      [videoField]: info.fields.get(videoField)?.type.startsWith("list[")
        ? [videoUrl]
        : videoUrl
    };
    setIfDeclared(
      input,
      info,
      params.targetResolution,
      "target_resolution",
      "resolution"
    );
    setIfDeclared(input, info, params.scale, "upscale_factor", "scale");
    setIfDeclared(input, info, params.seed, "seed");
    return this.runJob("video", modelId, info, input, runJobOptions(params));
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === modelId
    );
    if (!model?.supportedTasks?.includes("reference_to_video")) {
      throw new Error(
        `AtlasCloud model ${modelId} does not support reference_to_video`
      );
    }
    const fields = getModelReferenceInputs(
      ATLASCLOUD_MANIFEST_PKG,
      ATLASCLOUD_MANIFEST_PATH,
      modelId
    );
    const references = {
      images: inputs.images.filter((bytes) => bytes.length > 0),
      videos: inputs.videos.filter((bytes) => bytes.length > 0),
      audios: (inputs.audios ?? []).filter((bytes) => bytes.length > 0)
    };
    validateReferenceInputs("AtlasCloud", modelId, references, fields);
    if (modelId.startsWith("vidu/") && references.images.length > 7) {
      throw new Error(
        `AtlasCloud model ${modelId} accepts at most 7 reference images`
      );
    }
    const info = this.resolveModel(modelId, "video");
    const audioField = info.fields.get("use_reference_video_audio");
    if (
      params.useReferenceVideoAudio === true &&
      (!audioField || references.videos.length === 0)
    ) {
      throw new Error(
        `AtlasCloud model ${modelId} does not support reference video audio for these inputs`
      );
    }
    const input = mapVideoParams(info, params);
    const groups = new Map<
      string,
      Array<{ url: string; type: "image" | "video" | "audio" }>
    >();
    for (const field of fields) {
      const buffers = field.kind === "image"
        ? references.images
        : field.kind === "video"
          ? references.videos
          : references.audios;
      if (buffers.length === 0) continue;
      const urls =
        field.kind === "image"
          ? buffers.map(bytesToImageDataUri)
          : await Promise.all(
              buffers.map((bytes, index) =>
                this.uploadMedia(
                  bytes,
                  field.kind === "video" ? "video/mp4" : sniffMediaMime(bytes, "audio/mpeg"),
                  `reference-${field.kind}-${index + 1}`,
                  params.signal
                )
              )
            );
      if (field.wrapInto) {
        const group = groups.get(field.wrapInto) ?? [];
        group.push(...urls.map((url) => ({ url, type: field.kind })));
        groups.set(field.wrapInto, group);
      } else if (
        field.kind === "image" &&
        modelId.startsWith("pixverse/") &&
        field.apiName === "images"
      ) {
        input[field.apiName] = urls.map((url) => ({ image: url }));
      } else if (
        field.kind === "image" &&
        modelId.startsWith("vidu/") &&
        field.apiName === "subjects"
      ) {
        input[field.apiName] = Array.from(
          { length: Math.ceil(urls.length / 3) },
          (_, subjectIndex) => ({
            id: String(subjectIndex + 1),
            images: urls.slice(subjectIndex * 3, subjectIndex * 3 + 3)
          })
        );
      } else {
        input[field.apiName] = field.isList ? urls : urls[0];
      }
    }
    for (const [name, values] of groups) input[name] = values;
    if (audioField && params.useReferenceVideoAudio != null) {
      input.use_reference_video_audio = params.useReferenceVideoAudio;
    }
    return this.runJob("video", modelId, info, input, runJobOptions(params));
  }

  override async videoToVideo(
    video: Uint8Array,
    params: VideoToVideoParams
  ): Promise<Uint8Array> {
    if (video.length === 0) {
      throw new Error("video must not be empty");
    }
    const modelId = params.model.id;
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === modelId
    );
    if (!model?.supportedTasks?.includes("video_to_video")) {
      throw new Error(
        `AtlasCloud model ${modelId} does not support video_to_video`
      );
    }
    const info = this.resolveModel(modelId, "video");
    const videoField = ["video", "video_url", "input_video"].find((name) =>
      info.fields.has(name)
    );
    if (!videoField) {
      throw new Error(
        `AtlasCloud model ${modelId} does not declare a video field`
      );
    }
    const videoUrl = await this.uploadMedia(
      video,
      "video/mp4",
      "input-video",
      params.signal
    );
    const input: Record<string, unknown> = { [videoField]: videoUrl };
    setIfDeclared(input, info, params.prompt, "prompt");
    setIfDeclared(input, info, params.negativePrompt, "negative_prompt");
    setIfDeclared(input, info, params.strength, "strength");
    setIfDeclared(input, info, params.durationSeconds, "duration");
    setIfDeclared(input, info, params.resolution, "resolution");
    setIfDeclared(input, info, params.seed, "seed");

    const referenceImages = (params.referenceImages ?? []).filter(
      (bytes) => bytes.length > 0
    );
    const referenceFields = getModelReferenceInputs(
      ATLASCLOUD_MANIFEST_PKG,
      ATLASCLOUD_MANIFEST_PATH,
      modelId
    );
    if (referenceImages.length > 0) {
      validateReferenceInputs(
        "AtlasCloud",
        modelId,
        { images: referenceImages, videos: [] },
        referenceFields
      );
      const imageField = referenceFields.find(
        (field) => field.kind === "image"
      );
      if (!imageField) {
        throw new Error(
          `AtlasCloud model ${modelId} does not declare a reference image field`
        );
      }
      const urls = referenceImages.map(bytesToImageDataUri);
      input[imageField.apiName] = imageField.isList ? urls : urls[0];
    }

    return this.runJob("video", modelId, info, input, runJobOptions(params));
  }

  override async extendVideo(
    video: Uint8Array,
    params: ExtendVideoParams
  ): Promise<Uint8Array> {
    if (video.length === 0) {
      throw new Error("video must not be empty");
    }
    if (params.mode !== "end") {
      throw new Error("This AtlasCloud model supports end extensions only");
    }
    if (
      !Number.isFinite(params.durationSeconds) ||
      params.durationSeconds <= 0
    ) {
      throw new Error("Extension duration must be positive");
    }
    const modelId = params.model.id;
    const model = (await this.getAvailableVideoModels()).find(
      (item) => item.id === modelId
    );
    if (!model?.supportedTasks?.includes("extend_video")) {
      throw new Error(
        `AtlasCloud model ${modelId} does not support extend_video`
      );
    }
    const info = this.resolveModel(modelId, "video");
    const videoField = ["video", "video_url", "input_video"].find((name) =>
      info.fields.has(name)
    );
    if (!videoField) {
      throw new Error(
        `AtlasCloud model ${modelId} does not declare a video field`
      );
    }
    const videoUrl = await this.uploadMedia(video, "video/mp4", "input-video");
    const input: Record<string, unknown> = { [videoField]: videoUrl };
    setIfDeclared(input, info, params.prompt, "prompt");
    setIfDeclared(input, info, params.durationSeconds, "duration");
    return this.runJob("video", modelId, info, input);
  }
}
