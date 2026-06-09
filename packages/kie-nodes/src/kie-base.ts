/**
 * Shared Kie.ai API utilities for submit → poll → download lifecycle.
 * Uses native fetch (Node 18+).
 */

import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { MediaRefValue, ProcessingContext } from "@nodetool-ai/runtime";

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function withTaskId(message: string, taskId: string): string {
  return `${message} (taskId: ${taskId})`;
}

function pollTimeoutError(
  taskId: string,
  maxAttempts: number,
  pollInterval: number
): Error {
  const timeoutSeconds = (maxAttempts * pollInterval) / 1000;
  return new Error(
    `Task timed out after ${timeoutSeconds}s (taskId: ${taskId}). ` +
      "The job may still complete on KIE — check recordInfo or the KIE dashboard."
  );
}

function checkStatus(data: Record<string, unknown>): void {
  const code = Number(data.code);
  const map: Record<number, string> = {
    401: "Unauthorized",
    402: "Insufficient Credits",
    404: "Not Found",
    422: "Validation Error",
    429: "Rate Limited",
    455: "Service Unavailable",
    500: "Server Error",
    501: "Generation Failed",
    505: "Feature Disabled"
  };
  if (map[code]) throw new Error(`${map[code]}: ${JSON.stringify(data)}`);
}

async function submitTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input })
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollStatus(
  apiKey: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const state = (data.data as Record<string, unknown>)?.state as string;
    if (state === "success") return data;
    if (state === "failed" || state === "fail") {
      const inner = data.data as Record<string, unknown>;
      const msg = inner?.failMsg || data.msg || "Unknown error";
      throw new Error(withTaskId(`Task failed: ${msg}`, taskId));
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw pollTimeoutError(taskId, maxAttempts, pollInterval);
}

async function downloadResult(
  apiKey: string,
  taskId: string
): Promise<{ items: Buffer[]; taskId: string }> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(withTaskId(`Failed to get result: ${res.status}`, taskId));
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
  if (!resultJsonStr) throw new Error(withTaskId("No resultJson in response", taskId));
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error(withTaskId("No resultUrls in resultJson", taskId));
  const items = await Promise.all(
    resultUrls.map(async (resultUrl) => {
      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) {
        throw new Error(withTaskId(`Failed to download from ${resultUrl}`, taskId));
      }
      return Buffer.from(await dlRes.arrayBuffer());
    })
  );
  return { items, taskId };
}

export async function uploadFile(
  apiKey: string,
  data: Buffer,
  uploadPath: string,
  filename: string
): Promise<string> {
  const form = new globalThis.FormData();
  form.append("file", new Blob([new Uint8Array(data)]), filename);
  form.append("uploadPath", uploadPath);
  form.append("fileName", filename);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const resData = (await res.json()) as Record<string, unknown>;
  if (resData.code !== undefined) checkStatus(resData);
  if (!res.ok || !resData.success)
    throw new Error(`Upload failed: ${res.status} ${JSON.stringify(resData)}`);
  const downloadUrl = (resData.data as Record<string, unknown>)
    ?.downloadUrl as string;
  if (!downloadUrl) throw new Error(`No downloadUrl in upload response`);
  return downloadUrl;
}

export function getApiKey(secrets: Record<string, string>): string {
  const key = secrets?.KIE_API_KEY || process.env.KIE_API_KEY || "";
  if (!key) throw new Error("KIE_API_KEY is not configured");
  return key;
}

function isRemoteHttpUrl(uri: string | undefined): uri is string {
  return !!uri && /^https?:\/\//.test(uri);
}

function isLocalHttpUrl(uri: string): boolean {
  return (
    uri.includes("localhost") ||
    uri.includes("127.0.0.1") ||
    uri.includes("[::1]")
  );
}

/**
 * Resolve an asset ref to raw bytes for upload. Delegates to the canonical
 * {@link loadMediaRefBytes}, which handles inline `data`, `data:` URIs,
 * `asset://<id>` references (via `context.resolveAssetBytes`), package asset
 * URIs, opaque storage URIs (plus `asset_id` → `/api/storage/<id>.<ext>`
 * candidates), local file paths, and local http(s) URLs. KIE's earlier bespoke
 * resolver only handled `data`/`data:`/`storage.retrieve(uri)`, so `asset://`
 * refs — the format this package's own field descriptions recommend — failed
 * with "Image has no data or URI".
 */
async function resolveUploadBytes(
  ref: Record<string, unknown>,
  context?: ProcessingContext
): Promise<Buffer | null> {
  const bytes = await loadMediaRefBytes(ref as MediaRefValue, context);
  return bytes ? Buffer.from(bytes) : null;
}

export async function uploadImageInput(
  apiKey: string,
  image: unknown,
  context?: ProcessingContext
): Promise<string> {
  if (!image || typeof image !== "object") throw new Error("Image is required");
  const img = image as Record<string, unknown>;
  const uri = img.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(img, context);
  if (!bytes) throw new Error("Image has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "images/user-uploads",
    `upload-${Date.now()}.png`
  );
}

export async function uploadAudioInput(
  apiKey: string,
  audio: unknown,
  context?: ProcessingContext
): Promise<string> {
  if (!audio || typeof audio !== "object") throw new Error("Audio is required");
  const a = audio as Record<string, unknown>;
  const uri = a.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(a, context);
  if (!bytes) throw new Error("Audio has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "audio/user-uploads",
    `upload-${Date.now()}.mp3`
  );
}

export async function uploadVideoInput(
  apiKey: string,
  video: unknown,
  context?: ProcessingContext
): Promise<string> {
  if (!video || typeof video !== "object") throw new Error("Video is required");
  const v = video as Record<string, unknown>;
  const uri = v.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(v, context);
  if (!bytes) throw new Error("Video has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "videos/user-uploads",
    `upload-${Date.now()}.mp4`
  );
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return !!(r.data || r.uri);
}

export { isRefSet };

// Custom endpoint helpers for Veo, Runway, etc.
async function submitCustom(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollCustom(
  apiKey: string,
  taskId: string,
  pollEndpoint: string,
  pollInterval: number,
  maxAttempts: number
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}${pollEndpoint}?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const inner = data.data as Record<string, unknown>;

    // Veo-style completion: successFlag === 1
    const successFlag = inner?.successFlag;
    if (successFlag !== undefined) {
      const flag = Number(successFlag);
      if (flag === 1) return data;
      if (flag === 2 || flag === 3) {
        throw new Error(withTaskId(`Task failed: ${data.msg || "Unknown error"}`, taskId));
      }
    }

    // Runway-style completion: state === "success"
    const state = inner?.state as string;
    if (state === "success") return data;
    if (state === "fail" || state === "failed") {
      const msg = inner?.failMsg || data.msg || "Unknown error";
      throw new Error(withTaskId(`Task failed: ${msg}`, taskId));
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw pollTimeoutError(taskId, maxAttempts, pollInterval);
}

async function downloadCustomResult(
  statusData: Record<string, unknown>
): Promise<Buffer> {
  const data = statusData.data as Record<string, unknown>;

  // Try Runway-style: data.videoInfo.videoUrl
  const videoInfo = data?.videoInfo as Record<string, unknown> | undefined;
  if (videoInfo?.videoUrl) {
    const res = await fetch(videoInfo.videoUrl as string);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Try Veo-style: data.resultUrls or data.response.resultUrls
  let resultUrls: string[] = [];
  const rawUrls =
    (data?.resultUrls as unknown) ||
    ((data?.response as Record<string, unknown>)?.resultUrls as unknown) ||
    ((data?.response as Record<string, unknown>)?.originUrls as unknown);

  if (Array.isArray(rawUrls)) {
    resultUrls = rawUrls.filter((u): u is string => typeof u === "string");
  } else if (typeof rawUrls === "string") {
    try {
      const parsed = JSON.parse(rawUrls);
      if (Array.isArray(parsed)) {
        resultUrls = parsed.filter((u): u is string => typeof u === "string");
      } else if (typeof parsed === "string") {
        resultUrls = [parsed];
      }
    } catch {
      resultUrls = [rawUrls];
    }
  }

  if (!resultUrls.length)
    throw new Error(`No result URLs in response: ${JSON.stringify(statusData)}`);

  const res = await fetch(resultUrls[0]);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadTextResult(
  apiKey: string,
  taskId: string,
  resultObjectKey: string
): Promise<string> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(withTaskId(`Failed to get result: ${res.status}`, taskId));
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  const resultJsonStr = (data.data as Record<string, unknown>)?.resultJson as string;
  if (!resultJsonStr) throw new Error(withTaskId("No resultJson in response", taskId));
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultObject = asRecord(resultData.resultObject) ?? resultData;
  const value = resultObject[resultObjectKey];
  if (typeof value === "string" && value) {
    return value;
  }
  throw new Error(
    withTaskId(`No ${resultObjectKey} in resultJson`, taskId)
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export type KieExecuteResult = {
  data: string;
  items: string[];
  taskId: string;
  creditsConsumed?: number;
};

export function parseCreditsConsumed(
  statusData: Record<string, unknown>
): number | undefined {
  const raw = asRecord(statusData.data)?.creditsConsumed;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/** Kie.ai advertises credits at $0.005 each. */
const KIE_USD_PER_CREDIT = 0.005;

export function reportKieProviderCost(
  context: unknown,
  creditsConsumed: number | undefined
): void {
  if (creditsConsumed == null || !Number.isFinite(creditsConsumed)) return;
  const setter = (context as { setProviderCost?: unknown } | null | undefined)
    ?.setProviderCost;
  if (typeof setter === "function") {
    const usd = creditsConsumed * KIE_USD_PER_CREDIT;
    (
      setter as (
        p: string,
        a: number,
        u: string,
        details?: {
          billing_unit?: string;
          quantity?: number;
          unit_price?: number;
          currency?: string;
        }
      ) => void
    ).call(context, "kie", usd, "USD", {
      billing_unit: "credits",
      quantity: creditsConsumed,
      unit_price: KIE_USD_PER_CREDIT,
      currency: "USD"
    });
  }
}

export async function kieExecuteOmniDirect(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>,
  responseIdKey: string
): Promise<KieExecuteResult> {
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const data = (await res.json()) as Record<string, unknown>;
  const code = Number(data.code);
  if (code !== 200 && code !== 0) {
    if (data.code !== undefined) checkStatus(data);
  }
  if (!res.ok) {
    throw new Error(`Omni submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const inner = asRecord(data.data);
  const id = inner?.[responseIdKey];
  if (typeof id !== "string" || !id) {
    throw new Error(`No ${responseIdKey} in response: ${JSON.stringify(data)}`);
  }
  return { data: id, items: [id], taskId: "" };
}

export async function kieExecuteTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  pollInterval = 2000,
  maxAttempts = 300,
  submitEndpoint?: string,
  pollEndpoint?: string,
  resultObjectKey?: string
): Promise<KieExecuteResult> {
  if (submitEndpoint) {
    // Custom submit/poll endpoints (Veo, Runway, etc.)
    const taskId = await submitCustom(apiKey, submitEndpoint, { model, ...input });
    const statusData = await pollCustom(
      apiKey,
      taskId,
      pollEndpoint ?? submitEndpoint,
      pollInterval,
      maxAttempts
    );
    const creditsConsumed = parseCreditsConsumed(statusData);
    const resultBytes = await downloadCustomResult(statusData);
    const b64 = resultBytes.toString("base64");
    return { data: b64, items: [b64], taskId, creditsConsumed };
  }
  const taskId = await submitTask(apiKey, model, input);
  const statusData = await pollStatus(apiKey, taskId, pollInterval, maxAttempts);
  const creditsConsumed = parseCreditsConsumed(statusData);
  if (resultObjectKey) {
    const text = await downloadTextResult(apiKey, taskId, resultObjectKey);
    return { data: text, items: [text], taskId, creditsConsumed };
  }
  const result = await downloadResult(apiKey, taskId);
  const items = result.items.map((b) => b.toString("base64"));
  return { data: items[0], items, taskId: result.taskId, creditsConsumed };
}

// Suno music uses different endpoints
export async function kieSubmitSuno(
  apiKey: string,
  input: Record<string, unknown>,
  endpoint = "/api/v1/generate"
): Promise<string> {
  // callBackUrl is always required by the Suno API. Since we poll for results
  // we don't actually use it, so inject a placeholder if not already set.
  const body = input.callBackUrl
    ? input
    : { ...input, callBackUrl: "https://nodetool.ai/kie-callback" };
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) throw new Error(`No taskId: ${JSON.stringify(data)}`);
  return taskId;
}

export async function kiePollSuno(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 120
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
  const failed = new Set([
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR"
  ]);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const status = (data.data as Record<string, unknown>)?.status as string;
    if (status === "SUCCESS") return data;
    if (failed.has(status)) {
      throw new Error(withTaskId(`Suno task failed: ${status}`, taskId));
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw pollTimeoutError(taskId, maxAttempts, pollInterval);
}

export async function kieExecuteSunoTask(
  apiKey: string,
  input: Record<string, unknown>,
  pollInterval = 4000,
  maxAttempts = 120,
  endpoint?: string
): Promise<KieExecuteResult> {
  const taskId = await kieSubmitSuno(apiKey, input, endpoint);
  const pollResult = await kiePollSuno(apiKey, taskId, pollInterval, maxAttempts);
  const creditsConsumed = parseCreditsConsumed(pollResult);
  // Polling response: data.response.sunoData[].audioUrl
  const sunoData = (
    (pollResult.data as Record<string, unknown>)?.response as Record<string, unknown>
  )?.sunoData as Array<Record<string, unknown>>;
  if (!sunoData?.length) throw new Error("No sunoData in Suno response");
  const audioUrl = sunoData[0].audioUrl as string;
  if (!audioUrl) throw new Error("No audioUrl in Suno response");
  const dlRes = await fetch(audioUrl);
  if (!dlRes.ok) throw new Error(`Failed to download audio: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const b64 = buf.toString("base64");
  return { data: b64, items: [b64], taskId, creditsConsumed };
}

export async function kieImageRef(base64: string): Promise<Record<string, unknown>> {
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf).metadata();
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
