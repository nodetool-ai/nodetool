/**
 * Model Studio media catalog and request bodies for DashScope's native API
 * (`/api/v1`), which serves Wan video, Wan and Qwen-Image images, and Qwen TTS.
 * The OpenAI-compatible `/models` listing the chat side reads does not say
 * which models are video, image or speech models, and the native API has no
 * listing endpoint, so these models are listed by hand from the API
 * references:
 *
 * - Wan 2.7 text-to-video: https://help.aliyun.com/en/model-studio/text-to-video-api-reference
 * - Wan 2.1-2.6 text-to-video: https://help.aliyun.com/en/model-studio/legacy-wan-text-to-video-api-reference
 * - Wan 2.7 image-to-video: https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference
 * - Wan 2.1-2.6 first-frame image-to-video: https://help.aliyun.com/en/model-studio/legacy-image-to-video-api-reference/
 * - Qwen-Image 2.1/3.0: https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference
 * - Qwen-Image 2.0: https://help.aliyun.com/en/model-studio/qwen-image-api
 * - Wan 2.7 image: https://help.aliyun.com/en/model-studio/wan-image-generation-and-editing-api-reference
 * - Wan 2.6 text-to-image: https://help.aliyun.com/en/model-studio/text-to-image-v2-api-reference
 * - Qwen TTS: https://help.aliyun.com/en/model-studio/qwen-tts-api
 */

import { bytesToImageDataUri } from "./image-mime.js";
import type { ImageModel, TTSModel, VideoModel } from "./types.js";
import { PROVIDER_IDS } from "./types.js";

/** POST path for Wan video tasks; always called with `X-DashScope-Async: enable`. */
export const VIDEO_SYNTHESIS_PATH =
  "/services/aigc/video-generation/video-synthesis";
/** POST path shared by Qwen-Image, Wan 2.6/2.7 images and Qwen TTS (sync). */
export const MULTIMODAL_GENERATION_PATH =
  "/services/aigc/multimodal-generation/generation";

/**
 * The native API root for a compatible-mode base URL. DashScope serves both
 * protocols from the same regional host — `/compatible-mode/v1` for OpenAI
 * chat and `/api/v1` for the native services — so the region the user chose
 * for chat carries over to media.
 */
export function nativeApiBase(compatBaseURL: string): string {
  const trimmed = compatBaseURL.replace(/\/+$/, "");
  const suffix = "/compatible-mode/v1";
  if (trimmed.endsWith(suffix)) {
    return `${trimmed.slice(0, -suffix.length)}/api/v1`;
  }
  return `${new URL(trimmed).origin}/api/v1`;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/**
 * Wan 2.7 takes `resolution` + `ratio` and, for image-to-video, a `media`
 * array. Wan 2.6 and earlier use the legacy protocol: text-to-video takes an
 * exact `size` (`width*height`), image-to-video an `img_url` and a
 * `resolution`.
 */
type WanVideoProtocol = "wan27" | "legacy";

interface WanVideoSpec {
  id: string;
  name: string;
  task: "text_to_video" | "image_to_video";
  protocol: WanVideoProtocol;
  resolutions: string[];
  durations: number[];
  endFrame: "optional" | "none";
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const WAN_VIDEO_SPECS: readonly WanVideoSpec[] = [
  {
    id: "wan2.7-t2v",
    name: "Wan 2.7 Text-to-Video",
    task: "text_to_video",
    protocol: "wan27",
    resolutions: ["720P", "1080P"],
    durations: range(2, 15),
    endFrame: "none"
  },
  {
    id: "wan2.6-t2v",
    name: "Wan 2.6 Text-to-Video",
    task: "text_to_video",
    protocol: "legacy",
    resolutions: ["720P", "1080P"],
    durations: range(2, 15),
    endFrame: "none"
  },
  {
    id: "wan2.5-t2v-preview",
    name: "Wan 2.5 Text-to-Video Preview",
    task: "text_to_video",
    protocol: "legacy",
    resolutions: ["480P", "720P", "1080P"],
    durations: [5, 10],
    endFrame: "none"
  },
  {
    id: "wan2.7-i2v",
    name: "Wan 2.7 Image-to-Video",
    task: "image_to_video",
    protocol: "wan27",
    resolutions: ["720P", "1080P"],
    durations: range(2, 15),
    endFrame: "optional"
  },
  {
    id: "wan2.6-i2v",
    name: "Wan 2.6 Image-to-Video",
    task: "image_to_video",
    protocol: "legacy",
    resolutions: ["720P", "1080P"],
    durations: range(2, 15),
    endFrame: "none"
  },
  {
    id: "wan2.6-i2v-flash",
    name: "Wan 2.6 Image-to-Video Flash",
    task: "image_to_video",
    protocol: "legacy",
    resolutions: ["720P", "1080P"],
    durations: range(2, 15),
    endFrame: "none"
  },
  {
    id: "wan2.5-i2v-preview",
    name: "Wan 2.5 Image-to-Video Preview",
    task: "image_to_video",
    protocol: "legacy",
    resolutions: ["480P", "720P", "1080P"],
    durations: [5, 10],
    endFrame: "none"
  }
];

/** Aspect ratios every Wan text-to-video model here renders. */
const WAN_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

/** Legacy text-to-video `size` values, by tier then ratio (480P has no 4:3/3:4). */
const LEGACY_T2V_SIZES: Record<string, Record<string, string>> = {
  "480P": { "16:9": "832*480", "9:16": "480*832", "1:1": "624*624" },
  "720P": {
    "16:9": "1280*720",
    "9:16": "720*1280",
    "1:1": "960*960",
    "4:3": "1088*832",
    "3:4": "832*1088"
  },
  "1080P": {
    "16:9": "1920*1080",
    "9:16": "1080*1920",
    "1:1": "1440*1440",
    "4:3": "1632*1248",
    "3:4": "1248*1632"
  }
};

export function wanVideoModels(): VideoModel[] {
  return WAN_VIDEO_SPECS.map((spec) => {
    const model: VideoModel = {
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.ALIBABA,
      supportedTasks: [spec.task],
      durations: spec.durations,
      resolutions: spec.resolutions
    };
    if (spec.task === "text_to_video") {
      model.aspectRatios = WAN_VIDEO_RATIOS;
    } else {
      model.endFrame = spec.endFrame;
    }
    return model;
  });
}

function videoSpec(
  modelId: string,
  task: WanVideoSpec["task"]
): WanVideoSpec {
  const spec = WAN_VIDEO_SPECS.find((s) => s.id === modelId);
  if (!spec || spec.task !== task) {
    throw new Error(`Alibaba model ${modelId} does not support ${task}`);
  }
  return spec;
}

/** The model's tier nearest the request ("720p", "1080", "1920x1080" …), else its default (highest). */
function pickResolution(spec: WanVideoSpec, requested?: string | null): string {
  const fallback = spec.resolutions[spec.resolutions.length - 1];
  if (!requested) return fallback;
  const digits = requested.match(/\d+/g)?.map(Number) ?? [];
  if (digits.length === 0) return fallback;
  // "1920x1080" → the short side; "720P" → 720.
  const lines = digits.length >= 2 ? Math.min(digits[0], digits[1]) : digits[0];
  let best = fallback;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const tier of spec.resolutions) {
    const diff = Math.abs(Number.parseInt(tier, 10) - lines);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = tier;
    }
  }
  return best;
}

/** The model's duration nearest the request, or undefined for the API default (5s). */
function pickDuration(
  spec: WanVideoSpec,
  requested?: number | null
): number | undefined {
  if (!requested || requested <= 0) return undefined;
  let best = spec.durations[0];
  for (const d of spec.durations) {
    if (Math.abs(d - requested) < Math.abs(best - requested)) best = d;
  }
  return best;
}

function pickRatio(requested?: string | null): string {
  return requested && WAN_VIDEO_RATIOS.includes(requested) ? requested : "16:9";
}

export interface WanVideoRequest {
  prompt?: string | null;
  negativePrompt?: string | null;
  durationSeconds?: number | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  seed?: number | null;
  firstFrame?: Uint8Array;
  lastFrame?: Uint8Array;
}

function commonParameters(
  spec: WanVideoSpec,
  req: WanVideoRequest
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  const duration = pickDuration(spec, req.durationSeconds);
  if (duration !== undefined) parameters.duration = duration;
  if (req.seed != null && req.seed >= 0) parameters.seed = req.seed;
  return parameters;
}

function textInput(req: WanVideoRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (req.prompt) input.prompt = req.prompt;
  if (req.negativePrompt) input.negative_prompt = req.negativePrompt;
  return input;
}

/** Body for a Wan text-to-video task. */
export function textToVideoBody(
  modelId: string,
  req: WanVideoRequest
): Record<string, unknown> {
  const spec = videoSpec(modelId, "text_to_video");
  const resolution = pickResolution(spec, req.resolution);
  const ratio = pickRatio(req.aspectRatio);
  const parameters = commonParameters(spec, req);
  if (spec.protocol === "wan27") {
    parameters.resolution = resolution;
    parameters.ratio = ratio;
  } else {
    const sizes = LEGACY_T2V_SIZES[resolution];
    parameters.size = sizes[ratio] ?? sizes["16:9"];
  }
  return { model: modelId, input: textInput(req), parameters };
}

/** Body for a Wan image-to-video task, the image sent as a Base64 data URI. */
export function imageToVideoBody(
  modelId: string,
  req: WanVideoRequest & { firstFrame: Uint8Array }
): Record<string, unknown> {
  const spec = videoSpec(modelId, "image_to_video");
  if (req.lastFrame?.length && spec.endFrame === "none") {
    throw new Error(`Alibaba model ${modelId} takes no end frame`);
  }
  const parameters = commonParameters(spec, req);
  parameters.resolution = pickResolution(spec, req.resolution);
  const input = textInput(req);
  if (spec.protocol === "wan27") {
    const media = [{ type: "first_frame", url: bytesToImageDataUri(req.firstFrame) }];
    if (req.lastFrame?.length) {
      media.push({ type: "last_frame", url: bytesToImageDataUri(req.lastFrame) });
    }
    input.media = media;
  } else {
    input.img_url = bytesToImageDataUri(req.firstFrame);
  }
  return { model: modelId, input, parameters };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * How a model's `size` is expressed. `pixels` takes `width*height` whose
 * product lies between `minSide²` and `maxSide²`; `tier` takes "1K"/"2K"/"4K".
 */
type ImageSize =
  | { kind: "pixels"; minSide: number; maxSide: number }
  | { kind: "tier"; tiers: string[] };

interface ImageSpec {
  id: string;
  name: string;
  /** Most reference images an edit accepts; 0 means text-to-image only. */
  maxInputImages: number;
  maxN: number;
  negativePrompt: boolean;
  size: ImageSize;
}

const QWEN_PIXELS: ImageSize = { kind: "pixels", minSide: 512, maxSide: 2048 };

const IMAGE_SPECS: readonly ImageSpec[] = [
  { id: "qwen-image-3.0-pro", name: "Qwen-Image 3.0 Pro", maxInputImages: 3, maxN: 6, negativePrompt: true, size: QWEN_PIXELS },
  { id: "qwen-image-3.0", name: "Qwen-Image 3.0", maxInputImages: 3, maxN: 6, negativePrompt: true, size: QWEN_PIXELS },
  { id: "qwen-image-2.1-pro", name: "Qwen-Image 2.1 Pro", maxInputImages: 10, maxN: 6, negativePrompt: false, size: QWEN_PIXELS },
  { id: "qwen-image-2.1-turbo", name: "Qwen-Image 2.1 Turbo", maxInputImages: 10, maxN: 6, negativePrompt: false, size: QWEN_PIXELS },
  { id: "qwen-image-2.0-pro", name: "Qwen-Image 2.0 Pro", maxInputImages: 0, maxN: 6, negativePrompt: true, size: QWEN_PIXELS },
  { id: "qwen-image-2.0", name: "Qwen-Image 2.0", maxInputImages: 0, maxN: 6, negativePrompt: true, size: QWEN_PIXELS },
  { id: "wan2.7-image-pro", name: "Wan 2.7 Image Pro", maxInputImages: 9, maxN: 4, negativePrompt: false, size: { kind: "tier", tiers: ["1K", "2K", "4K"] } },
  { id: "wan2.7-image", name: "Wan 2.7 Image", maxInputImages: 9, maxN: 4, negativePrompt: false, size: { kind: "tier", tiers: ["1K", "2K"] } },
  { id: "wan2.6-t2i", name: "Wan 2.6 Text-to-Image", maxInputImages: 0, maxN: 4, negativePrompt: true, size: { kind: "pixels", minSide: 1280, maxSide: 1440 } }
];

export function alibabaImageModels(): ImageModel[] {
  return IMAGE_SPECS.map((spec) => {
    const model: ImageModel = {
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.ALIBABA,
      supportedTasks:
        spec.maxInputImages > 0
          ? ["text_to_image", "image_to_image"]
          : ["text_to_image"]
    };
    if (spec.size.kind === "tier") model.resolutions = spec.size.tiers;
    return model;
  });
}

function imageSpec(modelId: string): ImageSpec {
  const spec = IMAGE_SPECS.find((s) => s.id === modelId);
  if (!spec) throw new Error(`Unknown Alibaba image model ${modelId}`);
  return spec;
}

/**
 * Scale the requested size into the model's pixel budget, keeping the aspect
 * ratio and rounding each side to a multiple of 16.
 */
function pixelSize(
  size: Extract<ImageSize, { kind: "pixels" }>,
  width: number,
  height: number
): string {
  const area = width * height;
  const clamped = Math.min(
    Math.max(area, size.minSide * size.minSide),
    size.maxSide * size.maxSide
  );
  const scale = Math.sqrt(clamped / area);
  const round = (v: number, toward: "up" | "down") =>
    (toward === "up" ? Math.ceil(v / 16) : Math.floor(v / 16)) * 16;
  // Round toward the inside of the budget so rounding cannot leave it.
  const toward = area < clamped ? "up" : "down";
  return `${round(width * scale, toward)}*${round(height * scale, toward)}`;
}

function tierSize(
  size: Extract<ImageSize, { kind: "tier" }>,
  req: { width?: number | null; height?: number | null; resolution?: string | null },
  hasImages: boolean
): string | undefined {
  // 4K is text-to-image only.
  const tiers = hasImages ? size.tiers.filter((t) => t !== "4K") : size.tiers;
  const named = req.resolution?.toUpperCase();
  if (named && tiers.includes(named)) return named;
  if (!req.width || !req.height) return undefined;
  const side = Math.sqrt(req.width * req.height);
  const wanted = side <= 1024 ? "1K" : side <= 2048 ? "2K" : "4K";
  return tiers.includes(wanted) ? wanted : tiers[tiers.length - 1];
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string | null;
  width?: number | null;
  height?: number | null;
  resolution?: string | null;
  seed?: number | null;
  n: number;
  images?: Uint8Array[];
}

/** Body for a `multimodal-generation/generation` image call. */
export function imageGenerationBody(
  modelId: string,
  req: ImageRequest
): Record<string, unknown> {
  const spec = imageSpec(modelId);
  const images = req.images ?? [];
  if (images.length > spec.maxInputImages) {
    throw new Error(
      spec.maxInputImages === 0
        ? `Alibaba model ${modelId} does not support image_to_image`
        : `Alibaba model ${modelId} accepts at most ${spec.maxInputImages} input images`
    );
  }
  if (req.n < 1 || req.n > spec.maxN) {
    throw new Error(
      `Alibaba model ${modelId} generates 1 to ${spec.maxN} images per request (got ${req.n})`
    );
  }
  const content: Record<string, string>[] = images.map((image) => ({
    image: bytesToImageDataUri(image)
  }));
  content.push({ text: req.prompt });

  // n is always sent: Wan 2.6 defaults to 4 images, each billed.
  const parameters: Record<string, unknown> = { n: req.n };
  if (spec.size.kind === "pixels") {
    if (req.width && req.height) {
      parameters.size = pixelSize(spec.size, req.width, req.height);
    }
  } else {
    const tier = tierSize(spec.size, req, images.length > 0);
    if (tier) parameters.size = tier;
  }
  if (req.negativePrompt && spec.negativePrompt) {
    parameters.negative_prompt = req.negativePrompt;
  }
  if (req.seed != null && req.seed >= 0) parameters.seed = req.seed;

  return {
    model: modelId,
    input: { messages: [{ role: "user", content }] },
    parameters
  };
}

/** Every image URL in a multimodal-generation reply, in order. */
export function imageUrlsOf(reply: Record<string, unknown>): string[] {
  const output = reply.output as
    | { choices?: { message?: { content?: { image?: unknown }[] } }[] }
    | undefined;
  const urls: string[] = [];
  for (const choice of output?.choices ?? []) {
    for (const part of choice.message?.content ?? []) {
      if (typeof part.image === "string" && part.image) urls.push(part.image);
    }
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

/** Qwen3-TTS system voices (https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-list). */
const QWEN_TTS_VOICES = [
  "Cherry", "Serena", "Ethan", "Chelsie", "Momo", "Vivian", "Moon", "Maia",
  "Kai", "Nofish", "Bella", "Jennifer", "Ryan", "Katerina", "Aiden",
  "Eldric Sage", "Mia", "Mochi", "Bellona", "Vincent", "Bunny", "Neil",
  "Elias", "Arthur", "Nini", "Seren", "Pip", "Stella", "Bodega", "Sonrisa",
  "Alek", "Dolce", "Sohee", "Ono Anna", "Lenn", "Emilien", "Andre",
  "Radio Gol", "Jada", "Dylan", "Li", "Marcus", "Roy", "Peter", "Sunny",
  "Eric", "Rocky", "Kiki"
];

/** `language_type` values, keyed by lowercase name and ISO 639-1 code. */
const QWEN_TTS_LANGUAGES: Record<string, string> = {};
for (const [name, code] of [
  ["Chinese", "zh"],
  ["English", "en"],
  ["German", "de"],
  ["Italian", "it"],
  ["Portuguese", "pt"],
  ["Spanish", "es"],
  ["Japanese", "ja"],
  ["Korean", "ko"],
  ["French", "fr"],
  ["Russian", "ru"]
]) {
  QWEN_TTS_LANGUAGES[name.toLowerCase()] = name;
  QWEN_TTS_LANGUAGES[code] = name;
}

/** Qwen3-TTS returns 24 kHz mono 16-bit WAV. */
export const QWEN_TTS_SAMPLE_RATE = 24000;

export function qwenTTSModels(): TTSModel[] {
  return [
    {
      id: "qwen3-tts-flash",
      name: "Qwen3 TTS Flash",
      provider: PROVIDER_IDS.ALIBABA,
      voices: QWEN_TTS_VOICES,
      languages: Object.values(QWEN_TTS_LANGUAGES).filter(
        (v, i, all) => all.indexOf(v) === i
      ),
      sampleRate: QWEN_TTS_SAMPLE_RATE
    }
  ];
}

/** Body for a non-streaming Qwen TTS call. */
export function speechBody(args: {
  text: string;
  model: string;
  voice?: string;
  language?: string;
}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    text: args.text,
    voice: args.voice || "Cherry"
  };
  const language = args.language
    ? QWEN_TTS_LANGUAGES[args.language.toLowerCase().split(/[-_]/)[0]] ??
      QWEN_TTS_LANGUAGES[args.language.toLowerCase()]
    : undefined;
  if (language) input.language_type = language;
  return { model: args.model || "qwen3-tts-flash", input };
}
