/** Together node auth, media adaptation, and video/transcription executors. */

import { fetchExternalMedia, loadMediaRefBytes } from "@nodetool-ai/runtime";
import { isBlockedIpLiteral } from "@nodetool-ai/runtime/safe-url";
import {
  togetherImage,
  togetherSpeech,
  type TogetherTransport
} from "@nodetool-ai/runtime/together-operations";
import { sleep } from "@nodetool-ai/runtime/provider-transport";
import {
  isNonEmptyString,
  isObjectLike,
  isRecord,
  isString
} from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";

const TOGETHER_BASE = "https://api.together.xyz";

export function getApiKey(secrets: Record<string, string> | undefined): string {
  const key =
    (secrets && secrets.TOGETHER_API_KEY) || process.env.TOGETHER_API_KEY || "";
  if (!key.trim()) {
    throw new Error("TOGETHER_API_KEY is not configured");
  }
  return key.trim();
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

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
  apiKey: string,
  modelId: string,
  params: ImageParams,
  options: TogetherTransport = {}
): Promise<Uint8Array> {
  return togetherImage(apiKey, modelId, params, {
    ...options,
    label: "generation",
    download: fetchBytes
  });
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
  apiKey: string,
  modelId: string,
  params: SpeechParams,
  options: TogetherTransport = {}
): Promise<{ data: Uint8Array; mimeType: string }> {
  const fmt = (params.format ?? "mp3").toLowerCase();
  const mimeType = isSpeechFormat(fmt) ? SPEECH_FORMAT_MIME[fmt] : "audio/mpeg";
  const data = await togetherSpeech(
    apiKey,
    modelId,
    { ...params, format: fmt },
    options
  );
  return { data, mimeType };
}

// Transcription — POST /v1/audio/transcriptions (multipart, OpenAI-compatible)
interface TranscribeParams {
  audio: Uint8Array;
  language?: string | null;
  filename?: string;
}

export async function togetherTranscribe(
  apiKey: string,
  modelId: string,
  params: TranscribeParams
): Promise<string> {
  if (!params.audio || params.audio.byteLength === 0) {
    throw new Error("audio must not be empty");
  }

  const form = new FormData();
  // SAFETY: a Uint8Array is a BlobPart at runtime; the lib types disagree only
  // over whether its buffer could be a SharedArrayBuffer, which this one — read
  // from a node property — never is.
  const blob = new Blob([params.audio as BlobPart], {
    type: "application/octet-stream"
  });
  form.append("file", blob, params.filename ?? "audio.wav");
  form.append("model", modelId);
  form.append("response_format", "json");
  if (params.language) form.append("language", params.language);

  const response = await fetch(`${TOGETHER_BASE}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` }, // let fetch set multipart boundary
    body: form
  });
  if (!response.ok) {
    throw new Error(`Together transcription failed: ${await response.text()}`);
  }
  const payload = await response.json();
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

interface VideoPollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** The run's cancellation: a cancelled run stops polling the paid job. */
  signal?: AbortSignal;
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

/** The terminal state of a /v2/videos job, decoded from its poll response. */
interface VideoJobResult {
  status: string;
  videoUrl: string | null;
  errorMessage: string | null;
}

async function pollVideoJob(
  apiKey: string,
  jobId: string,
  opts: VideoPollOptions
): Promise<VideoJobResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts.pollIntervalMs ?? 5_000;
  const start = nowMs();

  for (;;) {
    opts.signal?.throwIfAborted();
    if (nowMs() - start > timeoutMs) {
      throw new Error(
        `Together video generation timed out after ${Math.round(timeoutMs / 1000)}s for job ${jobId}`
      );
    }
    await sleep(intervalMs, opts.signal);
    opts.signal?.throwIfAborted();

    const res = await fetch(`${TOGETHER_BASE}/v2/videos/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: opts.signal
    });
    if (!res.ok) {
      throw new Error(`Together video status check failed: ${await res.text()}`);
    }
    const payload = await res.json();
    if (!isObjectLike(payload)) continue;
    const status = isString(payload.status) ? payload.status : "";
    if (
      status !== "completed" &&
      status !== "failed" &&
      status !== "cancelled"
    ) {
      continue;
    }
    const outputs = payload.outputs;
    const error = payload.error;
    return {
      status,
      videoUrl:
        isObjectLike(outputs) && isString(outputs.video_url)
          ? outputs.video_url
          : null,
      errorMessage:
        isObjectLike(error) && isString(error.message) ? error.message : null
    };
  }
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

export async function togetherGenerateVideo(
  apiKey: string,
  modelId: string,
  params: VideoParams,
  opts: VideoPollOptions = {}
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

  const createResponse = await fetch(`${TOGETHER_BASE}/v2/videos`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    signal: opts.signal
  });
  if (!createResponse.ok) {
    throw new Error(`Together video creation failed: ${await createResponse.text()}`);
  }

  const created = await createResponse.json();
  const jobId = isObjectLike(created) && isString(created.id) ? created.id : "";
  if (!jobId) {
    throw new Error("Together video creation returned no job id.");
  }

  const finalStatus = await pollVideoJob(apiKey, jobId, opts);
  if (finalStatus.status !== "completed") {
    const reason =
      finalStatus.errorMessage ??
      `job ended with status '${finalStatus.status}'`;
    throw new Error(`Together video generation failed: ${reason}`);
  }
  if (!finalStatus.videoUrl) {
    throw new Error("Together video generation returned no video URL.");
  }
  return fetchBytes(finalStatus.videoUrl);
}

function nowMs(): number {
  return Date.now();
}
