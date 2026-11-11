/**
 * Together node media adaptation and request building. The requests go
 * through `context.callProviderEndpoint` to the runtime `TogetherProvider`,
 * which holds the API key and writes the generation record. Result URLs
 * download through `context.downloadProviderMedia`.
 */

import { fetchExternalMedia, loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isBlockedIpLiteral } from "@nodetool-ai/runtime/safe-url";
import {
  togetherImageBody,
  togetherSpeechBody
} from "@nodetool-ai/runtime/together-operations";
import {
  isNonEmptyString,
  isObjectLike,
  isRecord,
  isString
} from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";

/**
 * Validate an http(s) URL for outbound fetching from the workflow runtime.
 * Rejects hosts that point back at the runtime host or its private network —
 * defense against SSRF via user-controllable asset URIs (workflow inputs can
 * be set by anyone who can submit a graph).
 *
 * Hostname-string based (not resolved-IP), so a public DNS name resolving to a
 * private IP (DNS rebinding) can still slip through — a known limitation shared
 * with the canonical fal/replicate/atlascloud providers.
 */
export function isSafeHttpUrl(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return !isPrivateOrLocalHost(u.hostname);
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "" || host === "localhost" || host.endsWith(".localhost") ||
    isBlockedIpLiteral(host);
}

export type AssetKind = "image" | "audio" | "video";

interface AssetStorageLike {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
  /** Present on the server's storage adapters; absent on read-only stubs. */
  store?: (key: string, bytes: Uint8Array, mime?: string) => Promise<string>;
}

export interface AssetResolveContext {
  storage?: AssetStorageLike | null;
  /**
   * Canonical ProcessingContext resolver for reference URIs (`asset://<id>`,
   * `package://<pkg>/<path>`). Storage adapters return null for these, so this
   * is the only path that resolves them. SSRF-safe (resolves from storage / the
   * configured server, never an attacker-controlled host).
   */
  resolveAssetBytes?: (
    uri: string,
    options?: { requireOwnedAsset?: boolean }
  ) => Promise<{ bytes: Uint8Array | null }>;
}

/** Resolve Together inputs through runtime interpretation with local files denied. */
export async function resolveAssetBytes(
  ref: NodeValue,
  context: AssetResolveContext | undefined,
  kind: AssetKind
): Promise<Uint8Array | null> {
  if (ref === null || ref === undefined) return null;
  if (isString(ref)) {
    return isSafeHttpUrl(ref) ? fetchBytes(ref) : null;
  }
  if (!isRecord(ref)) return null;

  const uri = isString(ref.uri) ? ref.uri : "";
  const assetId = isString(ref.asset_id) ? ref.asset_id : undefined;
  const data = ref.data;
  const inline = isNonEmptyString(data) ||
    (data instanceof Uint8Array && data.byteLength > 0);
  const cannotResolve = () => new Error(
    `Cannot resolve ${kind} asset for Together — '${uri}' is not a fetchable URL`
  );
  if (!inline && /^https?:/.test(uri) && !isSafeHttpUrl(uri)) {
    throw cannotResolve();
  }
  const bytes = await loadMediaRefBytes(
    { uri, asset_id: assetId, data, type: kind },
    {
      resolveAssetBytes: context?.resolveAssetBytes?.bind(context),
      storage: context?.storage ? {
        retrieve: async (source) => {
          try {
            const stored = await context.storage?.retrieve(source);
            return stored && stored.byteLength > 0 ? stored : null;
          } catch {
            return null;
          }
        }
      } : undefined
    },
    { allowLocalFile: false, fetchHttp: fetchBytes }
  );
  if (bytes && bytes.byteLength > 0) return bytes;
  if (!uri || inline) return null;
  throw cannotResolve();
}

async function fetchBytes(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  // `isSafeHttpUrl` has already judged the initial URL; it cannot judge the
  // redirect hops, which is what the protected fetch is for.
  const res = await fetchExternalMedia(url, { signal });
  if (!res.ok) {
    throw new Error(
      `Together asset fetch failed: HTTP ${res.status} for ${url}`
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Download a result URL Together returned, through the provider. */
function downloadResult(
  context: ProcessingContext,
  url: string
): Promise<Uint8Array> {
  return context.downloadProviderMedia({
    provider: "together",
    url,
    signal: context.signal
  });
}

// Image generation / editing — POST /v1/images/generations (synchronous)
interface ImageParams {
  prompt: string;
  width?: number | null;
  height?: number | null;
  steps?: number | null;
  guidanceScale?: number | null;
  seed?: number | null;
  negativePrompt?: string | null;
  /** Base64 data URI of the source image for image-to-image edits. */
  imageUrl?: string | null;
}

export async function togetherGenerateImage(
  context: ProcessingContext,
  modelId: string,
  params: ImageParams,
  capability: "text_to_image" | "image_to_image",
  nodeId?: string
): Promise<Uint8Array> {
  const result = await context.callProviderEndpoint({
    provider: "together",
    capability,
    model: modelId,
    route: "images",
    input: togetherImageBody(modelId, params),
    nodeId,
    signal: context.signal
  });
  const output = result.output;
  const item =
    isRecord(output) && Array.isArray(output.data) ? output.data[0] : undefined;
  if (!isRecord(item)) {
    throw new Error("Together image generation returned no data.");
  }
  if (isNonEmptyString(item.b64_json)) {
    return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
  }
  if (isNonEmptyString(item.url)) {
    return downloadResult(context, item.url);
  }
  throw new Error("Together image generation returned no image data.");
}

export function imageBytesToDataUri(bytes: Uint8Array): string {
  // Together accepts a base64 data URI for the source image of an edit.
  return bytesToDataUri(bytes, "image/jpeg");
}

// Text-to-speech — POST /v1/audio/speech (synchronous, encoded audio)
interface SpeechParams {
  text: string;
  voice?: string;
  speed?: number | null;
  format?: string; // "mp3" | "wav"
}

const SPEECH_FORMAT_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav"
} as const;

type SpeechFormat = keyof typeof SPEECH_FORMAT_MIME;

function isSpeechFormat(format: string): format is SpeechFormat {
  return Object.hasOwn(SPEECH_FORMAT_MIME, format);
}

export async function togetherTextToSpeech(
  context: ProcessingContext,
  modelId: string,
  params: SpeechParams,
  nodeId?: string
): Promise<{ data: Uint8Array; mimeType: string }> {
  const fmt = (params.format ?? "mp3").toLowerCase();
  const mimeType = isSpeechFormat(fmt) ? SPEECH_FORMAT_MIME[fmt] : "audio/mpeg";
  const result = await context.callProviderEndpoint({
    provider: "together",
    capability: "text_to_speech",
    model: modelId,
    route: "audio/speech",
    input: togetherSpeechBody(modelId, { ...params, format: fmt }),
    nodeId,
    signal: context.signal
  });
  if (!(result.output instanceof Uint8Array)) {
    throw new Error("Together TTS returned no audio.");
  }
  return { data: result.output, mimeType };
}

// Transcription — POST /v1/audio/transcriptions (multipart, OpenAI-compatible)
interface TranscribeParams {
  audio: Uint8Array;
  language?: string | null;
}

/**
 * The multipart fields of POST /v1/audio/transcriptions, besides `model`. A
 * type alias, not an interface, so it stays assignable to endpoint input.
 */
type TranscriptionInput = {
  file: Uint8Array;
  response_format: string;
  language?: string;
};

export async function togetherTranscribe(
  context: ProcessingContext,
  modelId: string,
  params: TranscribeParams,
  nodeId?: string
): Promise<string> {
  if (!params.audio || params.audio.byteLength === 0) {
    throw new Error("audio must not be empty");
  }
  // The provider sends `file` and `model` first, then these as form fields.
  const input: TranscriptionInput = {
    file: params.audio,
    response_format: "json"
  };
  if (params.language) input.language = params.language;
  const result = await context.callProviderEndpoint({
    provider: "together",
    capability: "automatic_speech_recognition",
    model: modelId,
    route: "audio/transcriptions",
    input,
    nodeId,
    signal: context.signal
  });
  const payload = result.output;
  return isObjectLike(payload) ? String(payload.text ?? "") : "";
}

// Video — POST /v2/videos then poll GET /v2/videos/{id} (asynchronous)
interface VideoParams {
  prompt?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  steps?: number | null;
  guidanceScale?: number | null;
  seed?: number | null;
  negativePrompt?: string | null;
  /** Base64 data URI of the first frame for image-to-video. */
  firstFrameDataUri?: string | null;
}

/** Pixel dimensions for a generated video. */
export interface VideoDimensions {
  width: number;
  height: number;
}

/** Keyed `<aspect-ratio>|<resolution>`, the two hints a node exposes. */
const VIDEO_DIMENSION_PRESETS = new Map<string, VideoDimensions>([
  ["16:9|480p", { width: 854, height: 480 }],
  ["16:9|720p", { width: 1280, height: 720 }],
  ["16:9|1080p", { width: 1920, height: 1080 }],
  ["9:16|480p", { width: 480, height: 854 }],
  ["9:16|720p", { width: 720, height: 1280 }],
  ["9:16|1080p", { width: 1080, height: 1920 }],
  ["1:1|480p", { width: 480, height: 480 }],
  ["1:1|720p", { width: 720, height: 720 }],
  ["1:1|1080p", { width: 1080, height: 1080 }],
  ["4:3|480p", { width: 640, height: 480 }],
  ["4:3|720p", { width: 960, height: 720 }],
  ["4:3|1080p", { width: 1440, height: 1080 }]
]);

/** Map aspect-ratio + resolution hints to concrete pixel dimensions. */
export function resolveVideoDimensions(
  aspectRatio?: string | null,
  resolution?: string | null
): VideoDimensions {
  const ar = (aspectRatio ?? "16:9").replace(/\s/g, "");
  const res = (resolution ?? "720p").toLowerCase();
  // Together's MiniMax default for a combination with no preset.
  return (
    VIDEO_DIMENSION_PRESETS.get(`${ar}|${res}`) ?? { width: 1366, height: 768 }
  );
}

/** POST /v2/videos — the fields these nodes send. */
interface VideoRequestBody {
  model: string;
  prompt: string;
  width: number;
  height: number;
  seconds?: string;
  steps?: number;
  guidance_scale?: number;
  seed?: number;
  negative_prompt?: string;
  frame_images?: Array<{ input_image: string; frame: "first" }>;
}

/**
 * Generate a video through the provider's `videos` route, which creates the
 * job and polls it to a terminal status, then download the result.
 */
export async function togetherGenerateVideo(
  context: ProcessingContext,
  modelId: string,
  params: VideoParams,
  capability: "text_to_video" | "image_to_video",
  nodeId?: string
): Promise<Uint8Array> {
  const { width, height } = resolveVideoDimensions(
    params.aspectRatio,
    params.resolution
  );

  const body: VideoRequestBody = {
    model: modelId,
    prompt: params.prompt ?? "",
    width,
    height
  };
  // Together expects seconds as a string (e.g. "6").
  if (params.durationSeconds != null) body.seconds = String(params.durationSeconds);
  if (params.steps != null) body.steps = params.steps;
  if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
  if (params.seed != null) body.seed = params.seed;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.firstFrameDataUri) {
    body.frame_images = [{ input_image: params.firstFrameDataUri, frame: "first" }];
  }

  const result = await context.callProviderEndpoint({
    provider: "together",
    capability,
    model: modelId,
    route: "videos",
    input: { ...body },
    nodeId,
    signal: context.signal
  });
  const output = result.output;
  const outputs =
    isRecord(output) && isRecord(output.outputs) ? output.outputs : undefined;
  if (!isNonEmptyString(outputs?.video_url)) {
    throw new Error("Together video generation returned no video URL.");
  }
  return downloadResult(context, outputs.video_url);
}
