/**
 * Together AI HTTP helpers, auth, asset resolution, and per-modality executors.
 *
 * This module is deliberately self-contained — it re-implements the small slice
 * of the Together API the nodes need rather than importing `TogetherProvider`
 * from `@nodetool-ai/runtime`. That mirrors the convention used by the FAL /
 * AtlasCloud / Replicate node packages (their `-base.ts` files duplicate the
 * provider's HTTP on purpose) so this package stays publishable on its own and
 * free of a static dependency on the runtime's provider classes.
 *
 * Wire spec (https://docs.together.ai/docs/serverless/models):
 *  - Auth: `Authorization: Bearer <api_key>`.
 *  - Images: POST /v1/images/generations → { data: [{ b64_json | url }] }  (sync)
 *  - Speech: POST /v1/audio/speech → raw audio bytes                        (sync)
 *  - Transcribe: POST /v1/audio/transcriptions (multipart) → { text }       (sync)
 *  - Video: POST /v2/videos → { id }, then poll GET /v2/videos/{id}          (async)
 */

const TOGETHER_BASE = "https://api.together.xyz";

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

export function getApiKey(secrets: Record<string, string> | undefined): string {
  const key =
    (secrets && secrets.TOGETHER_API_KEY) ||
    process.env.TOGETHER_API_KEY ||
    "";
  if (!key.trim()) {
    throw new Error("TOGETHER_API_KEY is not configured");
  }
  return key.trim();
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

// ---------------------------------------------------------------------------
// SSRF guard (shared shape with fal / atlascloud node packages)
// ---------------------------------------------------------------------------

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

function parseIpComponent(part: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(part)) return parseInt(part.slice(2), 16);
  if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
  if (/^[0-9]+$/.test(part)) return parseInt(part, 10);
  return null;
}

function ipv4ToOctets(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const n = parseIpComponent(part);
    if (n === null || n < 0) return null;
    nums.push(n);
  }

  const n = nums.length;
  for (let i = 0; i < n - 1; i++) {
    if (nums[i] > 0xff) return null;
  }
  const tailOctets = 4 - (n - 1);
  const tail = nums[n - 1];
  if (tail < 0 || tail > 0xffffffff || tail >= 2 ** (tailOctets * 8)) {
    return null;
  }

  let value = tail;
  for (let i = 0; i < n - 1; i++) {
    value += nums[i] * 256 ** (3 - i);
  }
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ];
}

function mappedIpv4ToOctets(
  host: string
): [number, number, number, number] | null {
  const dotted = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
  if (dotted) return ipv4ToOctets(dotted[1]);

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  return null;
}

function isPrivateV4(octets: [number, number, number, number]): boolean {
  const [o1, o2] = octets;
  if (o1 === 0) return true;
  if (o1 === 10) return true;
  if (o1 === 127) return true;
  if (o1 === 169 && o2 === 254) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  let h = hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "" || h === "localhost" || h.endsWith(".localhost")) return true;

  const octets = ipv4ToOctets(h) ?? mappedIpv4ToOctets(h);
  if (octets) return isPrivateV4(octets);

  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:") || h.startsWith("fe80::")) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Asset-ref resolution → raw bytes
// ---------------------------------------------------------------------------

export type AssetKind = "image" | "audio" | "video";

type AssetRef = {
  uri?: string;
  data?: string | Uint8Array;
  mime_type?: string;
  metadata?: { mime_type?: string };
};

export interface AssetStorageLike {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
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
    uri: string
  ) => Promise<{ bytes: Uint8Array | null }>;
}

function decodeBase64(data: string): Uint8Array {
  // Accept both raw base64 and `data:<mime>;base64,<...>` forms.
  const comma = data.indexOf(",");
  const raw = data.startsWith("data:") && comma >= 0 ? data.slice(comma + 1) : data;
  return Uint8Array.from(Buffer.from(raw, "base64"));
}

function looksLikePublicUrl(s: unknown): s is string {
  return typeof s === "string" && isSafeHttpUrl(s);
}

/**
 * Resolve a NodeTool asset ref (ImageRef / AudioRef / VideoRef) to raw bytes.
 * Order: inline data → storage.retrieve(uri) → SSRF-guarded fetch(uri).
 * Returns null when the ref carries no usable source.
 */
export async function resolveAssetBytes(
  ref: unknown,
  context: AssetResolveContext | undefined,
  kind: AssetKind
): Promise<Uint8Array | null> {
  if (ref === null || ref === undefined) return null;

  if (typeof ref === "string") {
    if (ref === "") return null;
    if (looksLikePublicUrl(ref)) return fetchBytes(ref);
    return null;
  }
  if (typeof ref !== "object") return null;
  const r = ref as AssetRef;

  if (typeof r.data === "string" && r.data.length > 0) {
    return decodeBase64(r.data);
  }
  if (r.data instanceof Uint8Array && r.data.byteLength > 0) {
    return r.data;
  }

  const uri = typeof r.uri === "string" ? r.uri : "";
  // Empty placeholder ref (no uri, no data) → treat as "no asset provided" so
  // the caller can surface a clear "<field> is required" error instead.
  if (uri.length === 0) return null;

  // Reference URIs (`asset://<id>`, `package://<pkg>/<path>`) are not known to
  // storage adapters — only the ProcessingContext resolver handles them.
  if (
    (uri.startsWith("asset://") || uri.startsWith("package://")) &&
    context?.resolveAssetBytes
  ) {
    const { bytes } = await context.resolveAssetBytes(uri);
    if (bytes) return new Uint8Array(bytes);
  }

  if (context?.storage) {
    try {
      const bytes = await context.storage.retrieve(uri);
      if (bytes && bytes.byteLength > 0) return new Uint8Array(bytes);
    } catch {
      /* fall through to direct fetch */
    }
  }
  if (isSafeHttpUrl(uri)) {
    return fetchBytes(uri);
  }

  // A uri was supplied but can't be safely fetched (private/loopback/metadata
  // host, or an unresolvable relative path with no storage) — fail loudly.
  throw new Error(
    `Cannot resolve ${kind} asset for Together — '${uri}' is not a fetchable URL`
  );
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Together asset fetch failed: HTTP ${res.status} for ${url}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Image generation / editing — POST /v1/images/generations (synchronous)
// ---------------------------------------------------------------------------

export interface ImageParams {
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
  params: ImageParams
): Promise<Uint8Array> {
  if (!params.prompt) throw new Error("The input prompt cannot be empty.");

  const body: Record<string, unknown> = {
    model: modelId,
    prompt: params.prompt,
    n: 1,
    response_format: "b64_json"
  };
  if (params.imageUrl) body.image_url = params.imageUrl;
  if (params.width != null) body.width = params.width;
  if (params.height != null) body.height = params.height;
  if (params.steps != null) body.steps = params.steps;
  if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
  if (params.seed != null) body.seed = params.seed;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

  const response = await fetch(`${TOGETHER_BASE}/v1/images/generations`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Together image generation failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = payload.data?.[0];
  if (!item) throw new Error("Together image generation returned no data.");
  if (item.b64_json) return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
  if (item.url) return fetchBytes(item.url);
  throw new Error("Together image generation returned no image data.");
}

export function imageBytesToDataUri(bytes: Uint8Array): string {
  // Together accepts a base64 data URI for the source image of an edit.
  return bytesToDataUri(bytes, "image/jpeg");
}

// ---------------------------------------------------------------------------
// Text-to-speech — POST /v1/audio/speech (synchronous, encoded audio)
// ---------------------------------------------------------------------------

export interface SpeechParams {
  text: string;
  voice?: string;
  speed?: number | null;
  format?: string; // "mp3" | "wav"
}

const SPEECH_FORMAT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav"
};

export async function togetherTextToSpeech(
  apiKey: string,
  modelId: string,
  params: SpeechParams
): Promise<{ data: Uint8Array; mimeType: string }> {
  if (!params.text) throw new Error("text must not be empty");

  const fmt = (params.format ?? "mp3").toLowerCase();
  const mime = SPEECH_FORMAT_MIME[fmt] ?? "audio/mpeg";

  const body: Record<string, unknown> = {
    model: modelId,
    input: params.text,
    voice: params.voice ?? "tara",
    response_format: fmt
  };
  if (params.speed != null) body.speed = params.speed;

  const response = await fetch(`${TOGETHER_BASE}/v1/audio/speech`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Together TTS failed: ${await response.text()}`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  return { data, mimeType: mime };
}

// ---------------------------------------------------------------------------
// Transcription — POST /v1/audio/transcriptions (multipart, OpenAI-compatible)
// ---------------------------------------------------------------------------

export interface TranscribeParams {
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
  const blob = new Blob([params.audio as unknown as BlobPart], {
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
  const payload = (await response.json()) as { text?: string };
  return String(payload.text ?? "");
}

// ---------------------------------------------------------------------------
// Video — POST /v2/videos then poll GET /v2/videos/{id} (asynchronous)
// ---------------------------------------------------------------------------

export interface VideoParams {
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

export interface VideoPollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/** Map aspect-ratio + resolution hints to concrete pixel dimensions. */
export function resolveVideoDimensions(
  aspectRatio?: string | null,
  resolution?: string | null
): { width: number; height: number } {
  const ar = (aspectRatio ?? "16:9").replace(/\s/g, "");
  const res = (resolution ?? "720p").toLowerCase();

  const presets: Record<string, Record<string, [number, number]>> = {
    "16:9": { "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] },
    "9:16": { "480p": [480, 854], "720p": [720, 1280], "1080p": [1080, 1920] },
    "1:1": { "480p": [480, 480], "720p": [720, 720], "1080p": [1080, 1080] },
    "4:3": { "480p": [640, 480], "720p": [960, 720], "1080p": [1440, 1080] }
  };

  const dims = presets[ar]?.[res];
  if (dims) return { width: dims[0], height: dims[1] };
  return { width: 1366, height: 768 }; // Together's MiniMax default
}

interface VideoJobStatus {
  status: string;
  outputs?: { video_url?: string };
  error?: { message?: string };
}

async function pollVideoJob(
  apiKey: string,
  jobId: string,
  opts: VideoPollOptions
): Promise<VideoJobStatus> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts.pollIntervalMs ?? 5_000;
  const start = nowMs();

  for (;;) {
    if (nowMs() - start > timeoutMs) {
      throw new Error(
        `Together video generation timed out after ${Math.round(timeoutMs / 1000)}s for job ${jobId}`
      );
    }
    await sleep(intervalMs);

    const res = await fetch(`${TOGETHER_BASE}/v2/videos/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      throw new Error(`Together video status check failed: ${await res.text()}`);
    }
    const status = (await res.json()) as VideoJobStatus;
    if (
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "cancelled"
    ) {
      return status;
    }
  }
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

  const body: Record<string, unknown> = {
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
    body: JSON.stringify(body)
  });
  if (!createResponse.ok) {
    throw new Error(`Together video creation failed: ${await createResponse.text()}`);
  }

  const job = (await createResponse.json()) as { id: string; status: string };
  const finalStatus = await pollVideoJob(apiKey, job.id, opts);
  if (finalStatus.status !== "completed") {
    const reason =
      finalStatus.error?.message ??
      `job ended with status '${finalStatus.status}'`;
    throw new Error(`Together video generation failed: ${reason}`);
  }

  const videoUrl = finalStatus.outputs?.video_url;
  if (!videoUrl) {
    throw new Error("Together video generation returned no video URL.");
  }
  return fetchBytes(videoUrl);
}

// ---------------------------------------------------------------------------
// Small utilities (wrapped so tests can run without real timers/clock)
// ---------------------------------------------------------------------------

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
