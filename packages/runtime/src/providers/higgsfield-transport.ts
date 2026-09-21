import { z } from "zod";
import { fetchWithRetry, sleep } from "./http-transport.js";
import { safeFetch } from "./safe-url.js";

export const HIGGSFIELD_BASE = "https://api.higgsfield.ai";

const requestId = z.string().uuid();
const mediaUrl = z.string().url();
const mediaReference = z.union([mediaUrl, z.object({ url: mediaUrl }).passthrough()]);
const statusSchema = z.object({
  request_id: requestId.optional(),
  status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]),
  error: z.string().nullable().optional(),
  images: z.array(mediaReference).optional(),
  video: mediaReference.optional(),
  audio: mediaReference.optional(),
  audios: z.array(mediaReference).optional(),
  outputs: z.array(mediaReference).optional(),
  output: mediaReference.optional(),
  zip: mediaReference.optional(),
  mov: mediaReference.optional(),
  jsx: mediaReference.optional(),
  fbx: mediaReference.optional(),
  ply: mediaReference.optional()
}).passthrough();

const submissionSchema = z.object({
  request_id: requestId,
  status_url: z.string().url(),
  cancel_url: z.string().url()
}).passthrough();

const uploadSchema = z.object({
  upload_url: z.string().url(),
  public_url: z.string().url(),
  upload_headers: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional()
}).transform(({ upload_headers, headers, ...fields }) => ({
  ...fields,
  headers: upload_headers ?? headers ?? {}
}));
const estimateSchema = z.object({ credits: z.coerce.number().optional(), usd: z.coerce.number().optional() }).passthrough();

export type HiggsfieldStatus = z.infer<typeof statusSchema>;
export type HiggsfieldSubmission = z.infer<typeof submissionSchema>;
export type HiggsfieldUpload = z.infer<typeof uploadSchema>;
export type HiggsfieldEstimate = z.infer<typeof estimateSchema>;

export class HiggsfieldApiError extends Error {
  readonly status: number;
  readonly correlationId: string | null;
  readonly requestId: string | null;

  constructor(message: string, fields: { status: number; correlationId?: string | null; requestId?: string | null }) {
    super(message);
    this.name = "HiggsfieldApiError";
    this.status = fields.status;
    this.correlationId = fields.correlationId ?? null;
    this.requestId = fields.requestId ?? null;
  }
}

export interface HiggsfieldCredentials {
  readonly keyId: string;
  readonly secret: string;
}

function headers(credentials: HiggsfieldCredentials): Record<string, string> {
  return {
    Authorization: `Key ${credentials.keyId}:${credentials.secret}`,
    "Content-Type": "application/json"
  };
}

async function parse<T>(response: Response, schema: z.ZodType<T>, requestIdValue?: string): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* handled below */ }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : text.slice(0, 500);
    throw new HiggsfieldApiError(`Higgsfield request failed: HTTP ${response.status}: ${message}`, {
      status: response.status,
      correlationId: response.headers.get("X-Correlation-ID"),
      requestId: requestIdValue
    });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(`Invalid Higgsfield response: ${parsed.error.message}`);
  return parsed.data;
}

export async function higgsfieldSubmit(
  credentials: HiggsfieldCredentials,
  modelId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<HiggsfieldSubmission> {
  const init: RequestInit = { method: "POST", headers: headers(credentials), body: JSON.stringify(input) };
  if (signal) init.signal = signal;
  const response = await fetch(`${HIGGSFIELD_BASE}/${modelId}`, init);
  return parse(response, submissionSchema);
}

export async function higgsfieldGetStatus(
  credentials: HiggsfieldCredentials,
  url: string,
  signal?: AbortSignal
): Promise<HiggsfieldStatus> {
  const init: RequestInit = { headers: headers(credentials) };
  if (signal) init.signal = signal;
  const response = await fetchWithRetry(url, init, { fetchImpl: (input, requestInit) => safeFetch(String(input), requestInit) });
  return parse(response, statusSchema);
}

function requestPath(requestIdValue: string, suffix: string): string {
  const parsed = requestId.safeParse(requestIdValue);
  if (!parsed.success) throw new Error("Higgsfield request id must be a UUID");
  return `${HIGGSFIELD_BASE}/requests/${encodeURIComponent(requestIdValue)}/${suffix}`;
}

export async function higgsfieldGetStatusByRequestId(
  credentials: HiggsfieldCredentials,
  requestIdValue: string,
  signal?: AbortSignal
): Promise<HiggsfieldStatus | null> {
  const init: RequestInit = { headers: headers(credentials) };
  if (signal) init.signal = signal;
  const response = await safeFetch(requestPath(requestIdValue, "status"), init);
  if (response.status === 404) return null;
  return parse(response, statusSchema, requestIdValue);
}

export async function higgsfieldAwaitResult(
  credentials: HiggsfieldCredentials,
  statusUrl: string,
  options: { signal?: AbortSignal; timeoutMs?: number; initialDelayMs?: number } = {}
): Promise<HiggsfieldStatus> {
  const deadline = Date.now() + (options.timeoutMs ?? 900_000);
  let delay = options.initialDelayMs ?? 2_000;
  while (Date.now() < deadline) {
    await sleep(delay, options.signal);
    const result = await higgsfieldGetStatus(credentials, statusUrl, options.signal);
    if (result.status === "completed") return result;
    if (result.status === "failed" || result.status === "nsfw") {
      throw new Error(`Higgsfield generation ${result.status}: ${result.error ?? "provider rejected the request"}`);
    }
    if (result.status === "canceled") throw new Error("Higgsfield generation was canceled");
    delay = Math.min(10_000, Math.round(delay * 1.5));
  }
  throw new Error("Higgsfield generation timed out");
}

export async function higgsfieldCancel(
  credentials: HiggsfieldCredentials,
  url: string,
  signal?: AbortSignal
): Promise<void> {
  const init: RequestInit = { method: "POST", headers: headers(credentials) };
  if (signal) init.signal = signal;
  const response = await safeFetch(url, init);
  if (response.status === 202) return;
  await parse(response, z.object({}).passthrough());
}

export async function higgsfieldCancelByRequestId(
  credentials: HiggsfieldCredentials,
  requestIdValue: string,
  signal?: AbortSignal
): Promise<void> {
  return higgsfieldCancel(credentials, requestPath(requestIdValue, "cancel"), signal);
}

export async function higgsfieldEstimate(
  credentials: HiggsfieldCredentials,
  modelId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<HiggsfieldEstimate> {
  const init: RequestInit = { method: "POST", headers: headers(credentials), body: JSON.stringify(input) };
  if (signal) init.signal = signal;
  return parse(await fetch(`${HIGGSFIELD_BASE}/estimate/${modelId}`, init), estimateSchema);
}

export async function higgsfieldCreateUploadUrl(
  credentials: HiggsfieldCredentials,
  mimeType: string,
  signal?: AbortSignal
): Promise<HiggsfieldUpload> {
  const init: RequestInit = { method: "POST", headers: headers(credentials), body: JSON.stringify({ content_type: mimeType }) };
  if (signal) init.signal = signal;
  return parse(await fetch(`${HIGGSFIELD_BASE}/files/generate-upload-url`, init), uploadSchema);
}

export async function higgsfieldUploadMedia(
  upload: HiggsfieldUpload,
  bytes: Uint8Array,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  if (bytes.length === 0) throw new Error("Higgsfield upload must not be empty");
  const init: RequestInit = { method: "PUT", headers: { "Content-Type": mimeType, ...upload.headers }, body: new Uint8Array(bytes) };
  if (signal) init.signal = signal;
  const response = await safeFetch(upload.upload_url, init);
  if (!response.ok) throw new Error(`Higgsfield upload failed: HTTP ${response.status}`);
  return upload.public_url;
}

export function higgsfieldOutputUrls(result: HiggsfieldStatus): string[] {
  const url = (value: string | { url: string }): string => typeof value === "string" ? value : value.url;
  const urls = [
    ...(result.images ?? []).map(url),
    ...(result.video ? [url(result.video)] : []),
    ...(result.audio ? [url(result.audio)] : []),
    ...(result.audios ?? []).map(url),
    ...(result.outputs ?? []).map(url),
    ...(result.output ? [url(result.output)] : []),
    ...(result.zip ? [url(result.zip)] : []),
    ...(result.mov ? [url(result.mov)] : []),
    ...(result.jsx ? [url(result.jsx)] : []),
    ...(result.fbx ? [url(result.fbx)] : []),
    ...(result.ply ? [url(result.ply)] : [])
  ];
  return [...new Set(urls)];
}

export async function higgsfieldDownloadResult(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const init: RequestInit = signal ? { signal } : {};
  const response = await fetchWithRetry(url, init, { fetchImpl: (input, requestInit) => safeFetch(String(input), requestInit) });
  if (!response.ok) throw new Error(`Higgsfield result download failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
