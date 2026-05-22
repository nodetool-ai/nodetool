/**
 * Shared Topaz Labs API utilities.
 *
 * Two execution flows:
 *  - Image: multipart POST → poll status → GET download URL → fetch bytes.
 *  - Video: create job (with probed source metadata) → accept → PUT upload
 *    (single- or multi-part) → complete-upload → poll status → download.
 *
 * Topaz authenticates with the `X-API-Key` header (not Bearer). Uses native
 * fetch (Node 18+) and the system `ffprobe` (installed via the package manager)
 * to probe source video metadata, which Topaz requires at job-creation time.
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
}

export interface TopazVideoMetadata {
  resolution: { width: number; height: number };
  container: string;
  size: number;
  duration: number;
  frameRate: number;
  frameCount: number;
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
    const retryAfter = resp.headers.get("Retry-After");
    const wait = retryAfter ? Number(retryAfter) * 1000 : delay;
    await sleep(wait);
    delay = Math.min(delay * 2, 30000);
  }
  return last as Response;
}

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
    if (["completed", "succeeded", "success"].includes(status)) return data;
    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(`Topaz job failed: ${JSON.stringify(data)}`);
    }
    await sleep(pollInterval);
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
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x2a
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
    // 0 for output_width/output_height means "derive from scale" — omit it.
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
  const submitJson = (await submit.json()) as Record<string, unknown>;
  const processId = (submitJson.process_id ?? submitJson.id) as
    | string
    | undefined;
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

  const downloadUrl = spec.downloadEndpoint.replace("{process_id}", processId);
  const dl = await fetchWithRetry(downloadUrl, { headers: authHeaders(apiKey) });
  if (!dl.ok) throw new Error(`Topaz download lookup failed: ${dl.status}`);
  const dlJson = (await dl.json()) as Record<string, unknown>;
  const finalUrl = (dlJson.url ?? dlJson.download_url) as string | undefined;
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

export async function topazExecuteVideoTask(
  apiKey: string,
  spec: TopazVideoSpec,
  fields: Record<string, unknown>,
  videoBytes: Uint8Array,
  sourceMeta: TopazVideoMetadata
): Promise<Uint8Array> {
  const slowmo = Number(fields.slowmo ?? 1);
  const filters: Array<Record<string, unknown>> = [{ model: fields.model }];
  if (slowmo && slowmo !== 1) filters[0].slowmo = slowmo;

  const audioCodec = String(fields.audio_codec ?? "copy");
  const output = {
    resolution: {
      width: Number(fields.output_width) || sourceMeta.resolution.width,
      height: Number(fields.output_height) || sourceMeta.resolution.height
    },
    frameRate: Number(fields.output_frame_rate) || sourceMeta.frameRate,
    container: String(fields.output_container ?? "mp4"),
    audioCodec,
    audioTransfer: audioCodec === "copy" ? "copy" : "encode"
  };

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
  const requestId = (createJson.id ?? createJson.requestID) as
    | string
    | undefined;
  if (!requestId) {
    throw new Error(`No request ID returned: ${JSON.stringify(createJson)}`);
  }

  // 2. Accept → get upload URL(s)
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
  const uploadUrls = (acceptJson.uploadUrls ??
    (acceptJson.uploadUrl ? [acceptJson.uploadUrl] : [])) as string[];
  if (!uploadUrls.length) {
    throw new Error(`No upload URL returned: ${JSON.stringify(acceptJson)}`);
  }

  // 3. PUT bytes (single- or multi-part)
  const size = videoBytes.byteLength;
  const partSize = Math.ceil(size / uploadUrls.length);
  const uploadResults: Array<{ partNum: number; eTag: string }> = [];
  for (let i = 0; i < uploadUrls.length; i++) {
    const slice = videoBytes.slice(
      i * partSize,
      Math.min((i + 1) * partSize, size)
    );
    const put = await fetchWithRetry(uploadUrls[i], {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
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

  // 4. Complete upload
  const complete = await fetchWithRetry(
    spec.completeEndpoint.replace("{request_id}", requestId),
    {
      method: "PATCH",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ uploadResults })
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

  // 6. Download result
  const downloadUrl = (final.downloadUrl ??
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
