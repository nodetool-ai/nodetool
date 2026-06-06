/**
 * Shared Topaz Labs API utilities.
 *
 * Two execution flows:
 *  - Image: multipart POST → poll status → GET download URL → fetch bytes.
 *  - Video: create job (with probed source metadata) → accept → PUT upload
 *    (single- or multi-part) → complete-upload → poll status → download.
 *
 * Wire spec (from developer.topazlabs.com/reference/api-endpoints):
 *  - Auth: `X-API-Key` header (not Bearer).
 *  - Image status states: Pending | Processing | Completed | Cancelled | Failed.
 *  - Image download response: { download_url, head_url, expiry }.
 *  - Video status states: requested | accepted | initializing | preprocessing
 *    | processing | postprocessing | complete | canceling | canceled | failed.
 *  - Video accept response: { uploadId, urls[] }. The signed download URL on a
 *    completed video request lives at `download.url` (nested).
 *
 * Uses native fetch (Node 18+) and the system `ffprobe` (installed via the
 * package manager) to probe source video metadata, which Topaz requires at
 * job-creation time.
 */

import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export type TopazVideoKind = "upscale" | "interpolate";

export interface TopazImageSpec {
  submitEndpoint: string;
  statusEndpoint: string;
  downloadEndpoint: string;
  pollInterval: number;
  maxAttempts: number;
}

export interface TopazVideoSpec {
  submitEndpoint: string;
  acceptEndpoint: string;
  completeEndpoint: string;
  statusEndpoint: string;
  pollInterval: number;
  maxAttempts: number;
  videoKind: TopazVideoKind;
}

export interface TopazVideoMetadata {
  resolution: { width: number; height: number };
  container: string;
  size: number;
  duration: number;
  frameRate: number;
  frameCount: number;
}

const CONTAINER_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo"
};

export function containerContentType(container: string | null | undefined): string {
  if (!container) return "application/octet-stream";
  const key = container.replace(/^\./, "").toLowerCase();
  return CONTAINER_CONTENT_TYPES[key] ?? "application/octet-stream";
}

/**
 * Derive the source container (file extension, no leading dot) from a VideoRef.
 * Prefers an explicit `format` field, then the URI extension, then `mp4`.
 */
export function sourceContainerFromRef(ref: unknown): string {
  if (!ref || typeof ref !== "object") return "mp4";
  const r = ref as { format?: string | null; uri?: string };
  if (r.format) return r.format.replace(/^\./, "").toLowerCase();
  if (r.uri) {
    const m = r.uri.match(/\.(mp4|m4v|mov|mkv|webm|avi)(?:[?#]|$)/i);
    if (m) return m[1].toLowerCase();
  }
  return "mp4";
}

type StorageLike = {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
} | null;

type AssetContext = { storage?: StorageLike } | undefined;

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

export function getApiKey(secrets: Record<string, string>): string {
  const key = secrets?.TOPAZ_API_KEY || process.env.TOPAZ_API_KEY || "";
  if (!key) throw new Error("TOPAZ_API_KEY is not configured");
  return key;
}

function authHeaders(
  apiKey: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return { "X-API-Key": apiKey, ...extra };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a `Retry-After` header to milliseconds. The header may be either a
 * delay in seconds or an HTTP date; an unparseable value falls back to the
 * caller's backoff so we never end up with `sleep(NaN)` (≈ immediate retry).
 */
export function parseRetryAfterMs(
  headerValue: string | null,
  fallbackMs: number
): number {
  if (!headerValue) return fallbackMs;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return fallbackMs;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT"]);

/**
 * Fetch with backoff on retryable statuses (and transient network errors).
 *
 * Only idempotent requests (GET/HEAD, and PUTs to presigned upload URLs) are
 * retried — retrying a job-creating POST or a state-transitioning PATCH could
 * duplicate work (e.g. submit two billable video jobs) when the server already
 * acted before returning a 5xx, so those get a single attempt.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  maxAttempts = 6
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = IDEMPOTENT_METHODS.has(method) ? maxAttempts : 1;
  let delay = 1000;
  let last: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, init);
    } catch (err) {
      // Network-level failure (reset/timeout). Retry idempotent requests;
      // surface immediately otherwise.
      if (attempt === attempts) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 30000);
      continue;
    }
    if (!RETRYABLE_STATUS.has(resp.status)) return resp;
    last = resp;
    if (attempt === attempts) break;
    const wait = parseRetryAfterMs(resp.headers.get("Retry-After"), delay);
    // Drain the discarded body so the connection can be reused.
    await resp.arrayBuffer().catch(() => undefined);
    await sleep(wait);
    delay = Math.min(delay * 2, 30000);
  }
  return last as Response;
}

// Image API status states (per /reference/api-endpoints/image/status):
//   Pending | Processing | Completed | Cancelled | Failed
// Video API status states (per /reference/api-endpoints/video/get-request-status):
//   requested | accepted | initializing | preprocessing | processing |
//   postprocessing | complete | canceling | canceled | failed
// We accept both vocabularies in one helper since callers point us at the
// right endpoint and we lowercase the value before comparing.
const SUCCESS_STATES = new Set(["completed", "complete"]);
const FAILURE_STATES = new Set(["failed", "cancelled", "canceled"]);

async function pollUntilTerminal(
  url: string,
  headers: Record<string, string>,
  pollInterval: number,
  maxAttempts: number
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetchWithRetry(url, { headers });
    if (!resp.ok) throw new Error(`Topaz status poll failed: ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    const status = String(data.status ?? "").toLowerCase();
    if (SUCCESS_STATES.has(status)) return data;
    if (FAILURE_STATES.has(status)) {
      throw new Error(`Topaz job failed: ${JSON.stringify(data)}`);
    }
    if (attempt < maxAttempts - 1) await sleep(pollInterval);
  }
  throw new Error(
    `Topaz job did not complete within ${maxAttempts} poll attempts`
  );
}

// ---------------------------------------------------------------------------
// Asset → bytes
// ---------------------------------------------------------------------------

function localFilePath(uri: string): string {
  try {
    return fileURLToPath(new URL(uri));
  } catch {
    return uri.slice("file://".length);
  }
}

export async function refToBytes(
  ref: unknown,
  context?: AssetContext
): Promise<Uint8Array> {
  if (!ref || typeof ref !== "object") {
    throw new Error("Asset is required");
  }
  const r = ref as { uri?: string; data?: Uint8Array | string };

  if (r.data) {
    if (typeof r.data === "string") {
      return new Uint8Array(Buffer.from(r.data, "base64"));
    }
    return r.data;
  }

  const uri = r.uri;
  if (!uri) throw new Error("Asset has no data or URI");

  const dataUriMatch = uri.match(/^data:[^;]*;base64,(.+)$/s);
  if (dataUriMatch) {
    return new Uint8Array(Buffer.from(dataUriMatch[1], "base64"));
  }

  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored) return new Uint8Array(stored);
  }

  if (uri.startsWith("file://")) {
    return new Uint8Array(await fs.readFile(localFilePath(uri)));
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const resp = await fetch(uri);
    if (!resp.ok) throw new Error(`Failed to fetch asset: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  }

  throw new Error(`Cannot resolve asset URI: ${uri}`);
}

// ---------------------------------------------------------------------------
// Image result → ImageRef (with sharp metadata when available)
// ---------------------------------------------------------------------------

export async function topazImageRef(
  bytes: Uint8Array
): Promise<Record<string, unknown>> {
  const base64 = Buffer.from(bytes).toString("base64");
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(bytes)).metadata();
    return {
      type: "image",
      uri: "",
      data: base64,
      mimeType: meta.format ? `image/${meta.format}` : "image/png",
      width: meta.width,
      height: meta.height
    };
  } catch {
    return { type: "image", uri: "", data: base64 };
  }
}

// ---------------------------------------------------------------------------
// Video metadata probe (ffprobe)
// ---------------------------------------------------------------------------

function parseFrameRate(raw: unknown): number {
  if (typeof raw !== "string" || !raw) return 0;
  const [num, den] = raw.split("/");
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

async function withTempFile<T>(
  bytes: Uint8Array,
  suffix: string,
  fn: (filePath: string) => Promise<T>
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-topaz-"));
  const file = path.join(dir, `input${suffix}`);
  await fs.writeFile(file, bytes);
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function probeVideoMetadata(
  bytes: Uint8Array,
  container = "mp4"
): Promise<TopazVideoMetadata> {
  return withTempFile(bytes, `.${container}`, async (filePath) => {
    let stdout: string;
    try {
      ({ stdout } = await execFile("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name,size:stream=width,height,avg_frame_rate,nb_frames,codec_type",
        "-of",
        "json",
        filePath
      ]));
    } catch (err) {
      throw new Error(
        "Failed to probe video metadata with ffprobe. Ensure ffmpeg is " +
          `installed (the Package Manager UI can do this for you). ${String(err)}`
      );
    }

    const probe = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string; size?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        nb_frames?: string;
      }>;
    };

    const video = (probe.streams ?? []).find(
      (s) => s.codec_type === "video"
    );
    if (!video || !video.width || !video.height) {
      throw new Error("ffprobe did not report a video stream with dimensions");
    }

    const duration = Number(probe.format?.duration ?? 0) || 0;
    const frameRate = parseFrameRate(video.avg_frame_rate);
    const frameCount =
      Number(video.nb_frames ?? 0) || Math.round(duration * frameRate);

    return {
      resolution: { width: video.width, height: video.height },
      container,
      size: Number(probe.format?.size ?? bytes.byteLength) || bytes.byteLength,
      duration,
      frameRate,
      frameCount
    };
  });
}

// ---------------------------------------------------------------------------
// Image executor
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
    bytes.length >= 4 &&
    // TIFF little-endian (II*\0) or big-endian (MM\0*).
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  ) {
    return "image/tiff";
  }
  return "application/octet-stream";
}

export async function topazExecuteImageTask(
  apiKey: string,
  spec: TopazImageSpec,
  fields: Record<string, unknown>,
  imageBytes: Uint8Array
): Promise<Uint8Array> {
  const form = new FormData();
  const blob = new Blob(
    [new Uint8Array(imageBytes) as Uint8Array<ArrayBuffer>],
    { type: detectImageMime(imageBytes) }
  );
  form.set("image", blob, "input");
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === "") continue;
    // 0 for output_width/output_height means "infer from the other dim" — omit.
    if ((k === "output_width" || k === "output_height") && v === 0) continue;
    form.set(k, String(v));
  }

  const submit = await fetchWithRetry(spec.submitEndpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form
  });
  if (!submit.ok) {
    throw new Error(
      `Topaz submit failed: ${submit.status} ${await submit.text()}`
    );
  }
  // Spec returns { process_id, source_id, eta }. The process_id is also
  // available in the X-Process-ID response header.
  const submitJson = (await submit.json()) as Record<string, unknown>;
  const processId =
    (submitJson.process_id as string | undefined) ??
    submit.headers?.get("X-Process-ID") ??
    undefined;
  if (!processId) {
    throw new Error(
      `Topaz did not return a process_id: ${JSON.stringify(submitJson)}`
    );
  }

  const statusUrl = spec.statusEndpoint.replace("{process_id}", processId);
  await pollUntilTerminal(
    statusUrl,
    authHeaders(apiKey),
    spec.pollInterval,
    spec.maxAttempts
  );

  // Spec: { download_url, head_url, expiry }.
  const downloadUrl = spec.downloadEndpoint.replace("{process_id}", processId);
  const dl = await fetchWithRetry(downloadUrl, { headers: authHeaders(apiKey) });
  if (!dl.ok) throw new Error(`Topaz download lookup failed: ${dl.status}`);
  const dlJson = (await dl.json()) as Record<string, unknown>;
  const finalUrl = (dlJson.download_url ?? dlJson.url) as string | undefined;
  if (!finalUrl) {
    throw new Error(`No download URL in response: ${JSON.stringify(dlJson)}`);
  }

  const result = await fetch(finalUrl);
  if (!result.ok) {
    throw new Error(`Failed to fetch Topaz result: ${result.status}`);
  }
  return new Uint8Array(await result.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Video executor
// ---------------------------------------------------------------------------

const INTERPOLATION_MODELS = new Set([
  "apf-2",
  "apo-8",
  "chf-3",
  "chr-2",
  "aion-1"
]);

const AUDIO_MODE_MAP: Record<
  string,
  { audioTransfer: "Copy" | "Convert" | "None"; audioCodec?: "AAC" | "AC3" | "PCM" }
> = {
  copy: { audioTransfer: "Copy", audioCodec: "AAC" },
  aac: { audioTransfer: "Convert", audioCodec: "AAC" },
  ac3: { audioTransfer: "Convert", audioCodec: "AC3" },
  pcm: { audioTransfer: "Convert", audioCodec: "PCM" },
  none: { audioTransfer: "None" }
};

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildUpscaleFilter(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const filter: Record<string, unknown> = { model: String(fields.model) };
  if (fields.video_type) filter.videoType = String(fields.video_type);
  if (fields.auto) filter.auto = String(fields.auto);
  // Manual-mode tuning. The API ignores out-of-range or unsupported values
  // for a given model — the swagger says these are the documented controls.
  const numericMap: Record<string, string> = {
    compression: "compression",
    details: "details",
    noise: "noise",
    halo: "halo",
    blur: "blur",
    recover_original_detail: "recoverOriginalDetailValue"
  };
  for (const [src, dst] of Object.entries(numericMap)) {
    const v = num(fields[src]);
    if (v !== undefined && v !== 0) filter[dst] = v;
  }
  return filter;
}

function buildInterpolationFilter(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const filter: Record<string, unknown> = { model: String(fields.model) };
  const slowmo = num(fields.slowmo);
  if (slowmo !== undefined && slowmo !== 1) filter.slowmo = slowmo;
  const fps = num(fields.fps);
  if (fps !== undefined && fps > 0) filter.fps = fps;
  if (fields.duplicate) filter.duplicate = true;
  const threshold = num(fields.duplicate_threshold);
  if (threshold !== undefined && fields.duplicate) {
    filter.duplicateThreshold = threshold;
  }
  return filter;
}

function buildVideoFilters(
  spec: TopazVideoSpec,
  fields: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (spec.videoKind === "interpolate") {
    return [buildInterpolationFilter(fields)];
  }
  // Default to upscale when the model code is a known upscale model.
  if (INTERPOLATION_MODELS.has(String(fields.model))) {
    // Caller wired a frame-interpolation model into the Enhance node. Build
    // the appropriate filter so the API call still succeeds.
    return [buildInterpolationFilter(fields)];
  }
  return [buildUpscaleFilter(fields)];
}

function buildVideoOutput(
  fields: Record<string, unknown>,
  sourceMeta: TopazVideoMetadata
): Record<string, unknown> {
  const audioMode = String(fields.audio_mode ?? "copy").toLowerCase();
  const audio = AUDIO_MODE_MAP[audioMode] ?? AUDIO_MODE_MAP.copy;

  const output: Record<string, unknown> = {
    resolution: {
      width: num(fields.output_width) || sourceMeta.resolution.width,
      height: num(fields.output_height) || sourceMeta.resolution.height
    },
    frameRate: num(fields.output_frame_rate) || sourceMeta.frameRate,
    container: String(fields.output_container ?? "mp4"),
    videoEncoder: String(fields.video_encoder ?? "H264"),
    // One of dynamicCompressionLevel or videoBitrate is required.
    dynamicCompressionLevel: String(fields.dynamic_compression_level ?? "Mid"),
    audioTransfer: audio.audioTransfer
  };
  if (audio.audioCodec) output.audioCodec = audio.audioCodec;
  if (fields.crop_to_fit) output.cropToFit = true;
  return output;
}

export async function topazExecuteVideoTask(
  apiKey: string,
  spec: TopazVideoSpec,
  fields: Record<string, unknown>,
  videoBytes: Uint8Array,
  sourceMeta: TopazVideoMetadata
): Promise<Uint8Array> {
  const filters = buildVideoFilters(spec, fields);
  const output = buildVideoOutput(fields, sourceMeta);
  const createBody = { source: sourceMeta, output, filters };

  // 1. Create request
  const create = await fetchWithRetry(spec.submitEndpoint, {
    method: "POST",
    headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(createBody)
  });
  if (!create.ok) {
    throw new Error(
      `Topaz create failed: ${create.status} ${await create.text()}`
    );
  }
  const createJson = (await create.json()) as Record<string, unknown>;
  const requestId = (createJson.requestId ?? createJson.id) as
    | string
    | undefined;
  if (!requestId) {
    throw new Error(`No request ID returned: ${JSON.stringify(createJson)}`);
  }

  // 2. Accept → get multi-part upload URLs
  const accept = await fetchWithRetry(
    spec.acceptEndpoint.replace("{request_id}", requestId),
    { method: "PATCH", headers: authHeaders(apiKey) }
  );
  if (!accept.ok) {
    throw new Error(
      `Topaz accept failed: ${accept.status} ${await accept.text()}`
    );
  }
  const acceptJson = (await accept.json()) as Record<string, unknown>;
  // Spec: { uploadId, urls[] }. Tolerate legacy shapes just in case.
  const uploadId = (acceptJson.uploadId ?? acceptJson.upload_id) as
    | string
    | undefined;
  const uploadUrls = (acceptJson.urls ??
    acceptJson.uploadUrls ??
    (acceptJson.uploadUrl ? [acceptJson.uploadUrl] : [])) as string[];
  if (!uploadUrls.length) {
    throw new Error(`No upload URL returned: ${JSON.stringify(acceptJson)}`);
  }

  // 3. PUT bytes (single- or multi-part)
  const size = videoBytes.byteLength;
  const partSize = Math.max(1, Math.ceil(size / uploadUrls.length));
  const uploadResults: Array<{ partNum: number; eTag: string }> = [];
  const uploadContentType = containerContentType(sourceMeta.container);
  for (let i = 0; i < uploadUrls.length; i++) {
    const start = i * partSize;
    // Equal ceil-sized chunks can leave trailing presigned URLs with no bytes
    // (e.g. 9 bytes across 4 URLs → parts 3/3/3/0). Stop once the source is
    // fully consumed rather than PUT empty parts, which the API rejects.
    if (start >= size) break;
    const slice = videoBytes.slice(start, Math.min(start + partSize, size));
    const put = await fetchWithRetry(uploadUrls[i], {
      method: "PUT",
      headers: { "Content-Type": uploadContentType },
      body: slice
    });
    if (!put.ok) {
      throw new Error(`Topaz upload part ${i + 1} failed: ${put.status}`);
    }
    uploadResults.push({
      partNum: i + 1,
      eTag: (put.headers.get("ETag") ?? "").replace(/"/g, "")
    });
  }

  // 4. Complete upload. Echo back the uploadId from accept when present so the
  // API can correlate the multipart upload it handed out.
  const completeBody = uploadId ? { uploadId, uploadResults } : { uploadResults };
  const complete = await fetchWithRetry(
    spec.completeEndpoint.replace("{request_id}", requestId),
    {
      method: "PATCH",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(completeBody)
    }
  );
  if (!complete.ok) {
    throw new Error(
      `Topaz complete-upload failed: ${complete.status} ${await complete.text()}`
    );
  }

  // 5. Poll status
  const final = await pollUntilTerminal(
    spec.statusEndpoint.replace("{request_id}", requestId),
    authHeaders(apiKey),
    spec.pollInterval,
    spec.maxAttempts
  );

  // 6. Download result. Spec: { download: { url, expiresIn, expiresAt } }.
  const download = (final.download ?? {}) as Record<string, unknown>;
  const downloadUrl = (download.url ??
    final.downloadUrl ??
    final.download_url ??
    final.url) as string | undefined;
  if (!downloadUrl) {
    throw new Error(
      `No download URL in final status: ${JSON.stringify(final)}`
    );
  }
  const result = await fetch(downloadUrl);
  if (!result.ok) {
    throw new Error(`Failed to fetch Topaz video result: ${result.status}`);
  }
  return new Uint8Array(await result.arrayBuffer());
}
