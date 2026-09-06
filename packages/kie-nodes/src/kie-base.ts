/**
 * Shared Kie.ai API utilities for submit → poll → download lifecycle.
 * Uses native fetch (Node 18+).
 */

import {
  loadMediaRefBytes,
  registerCostReconciler,
  registerWebhookWait
} from "@nodetool-ai/runtime";
import { safeFetch } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES,
  fetchWithRetry,
  imageRefFromBytes,
  sleep
} from "@nodetool-ai/runtime/provider-transport";
import type { EncodedImageRef } from "@nodetool-ai/runtime/provider-transport";

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

function getWebhookBaseUrl(): string | undefined {
  const url = process.env.KIE_WEBHOOK_URL;
  return url && url.trim() ? url.replace(/\/+$/, "") : undefined;
}

function headers(apiKey: string) {
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

function tryParseRecord(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/**
 * Read a KIE response body. A gateway 502 answers with an HTML page, and
 * `res.json()` on it threw `SyntaxError: Unexpected token '<'` — the status the
 * caller needed to see never reached them. Parse defensively and report the
 * status with a body snippet instead. Every parsed body still goes through
 * {@link checkStatus}, because KIE announces failures inside HTTP 200.
 */
async function parseKieJson(
  res: Response,
  label: string
): Promise<Record<string, unknown>> {
  const text = await res.text();
  const data = tryParseRecord(text);
  if (!data) {
    throw new Error(
      `Kie ${label} failed: HTTP ${res.status} ${text.slice(0, 200)}`
    );
  }
  if (data.code !== undefined) checkStatus(data);
  return data;
}

/**
 * GET a KIE endpoint once the job exists, retrying 429/5xx and thrown network
 * errors with backoff (`Retry-After` honored). The poll loop does not use this:
 * its own interval is the backoff, and {@link pollKieTask} counts the failures.
 */
function kieGet(
  url: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetchWithRetry(url, { headers: headers(apiKey), signal });
}

/**
 * Fetch a finished result. The URL comes out of the provider's response body,
 * so it is screened (`safeFetch` re-checks every redirect hop), and a 429/5xx is
 * retried: the job is already generated and billed, and a CDN blip must not
 * throw the paid-for result away.
 */
function fetchBilledResult(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetchWithRetry(
    url,
    { signal },
    {
      fetchImpl: (input, init) => safeFetch(String(input), init as RequestInit)
    }
  );
}

/**
 * Poll a KIE task until `isDone` accepts a body (or throws for a failed job).
 *
 * A dead job used to look like a slow one two ways: a persistent non-OK poll
 * after createTask succeeded, and a body that names no state. Both ran the full
 * attempt budget — ten minutes at the defaults — before reporting a timeout.
 */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

async function pollKieTask(
  apiKey: string,
  url: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number,
  isDone: (data: Record<string, unknown>) => boolean,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  let consecutiveErrors = 0;
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Aborted");
    }
    let res: Response;
    try {
      res = await fetch(url, { headers: headers(apiKey), signal });
    } catch (err) {
      // A thrown network error is the same transient the loop already tolerates,
      // so it counts toward the same cutoff instead of losing a running job.
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw err;
      await sleep(pollInterval, signal);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // A non-OK poll can still carry KIE's error envelope, which names the
      // reason; only an unreadable one gets the retry budget.
      const envelope = tryParseRecord(body);
      if (envelope?.code !== undefined) checkStatus(envelope);
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(
          withTaskId(
            `Poll failed ${consecutiveErrors}x (HTTP ${res.status}): ${body.slice(0, 200)}`,
            taskId
          )
        );
      }
      await sleep(pollInterval, signal);
      continue;
    }
    consecutiveErrors = 0;
    const data = await parseKieJson(res, "recordInfo");
    if (isDone(data)) return data;
    await sleep(pollInterval, signal);
  }
  throw pollTimeoutError(taskId, maxAttempts, pollInterval);
}

async function submitTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input }),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

function recordInfoUrl(taskId: string): string {
  return `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
}

function sunoRecordUrl(taskId: string): string {
  return `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
}

/**
 * Read the job state out of a `recordInfo` body against the shared terminal
 * vocabulary, so a synonym this package has not seen before does not degrade
 * into a timeout that reports a finished job as a slow one.
 */
function recordInfoDone(
  taskId: string
): (data: Record<string, unknown>) => boolean {
  return (data) => {
    const inner = asRecord(data.data);
    const state = String(inner?.state ?? "").toLowerCase();
    if (TERMINAL_SUCCESS_STATES.has(state)) return true;
    if (TERMINAL_FAILURE_STATES.has(state)) {
      const msg = inner?.failMsg || data.msg || "Unknown error";
      throw new Error(withTaskId(`Task failed: ${msg}`, taskId));
    }
    return false;
  };
}

function pollStatus(
  apiKey: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return pollKieTask(
    apiKey,
    recordInfoUrl(taskId),
    taskId,
    pollInterval,
    maxAttempts,
    recordInfoDone(taskId),
    signal
  );
}

async function fetchRecordInfo(
  apiKey: string,
  taskId: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const res = await kieGet(recordInfoUrl(taskId), apiKey, signal);
  return parseKieJson(res, "recordInfo");
}

async function downloadResult(
  apiKey: string,
  taskId: string,
  signal?: AbortSignal
): Promise<{ items: Buffer[]; taskId: string }> {
  const res = await kieGet(recordInfoUrl(taskId), apiKey, signal);
  if (!res.ok) throw new Error(withTaskId(`Failed to get result: ${res.status}`, taskId));
  const data = await parseKieJson(res, "recordInfo");
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
  if (!resultJsonStr) throw new Error(withTaskId("No resultJson in response", taskId));
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error(withTaskId("No resultUrls in resultJson", taskId));
  const items = await Promise.all(
    resultUrls.map(async (resultUrl) => {
      const dlRes = await fetchBilledResult(resultUrl, signal);
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
  filename: string,
  signal?: AbortSignal
): Promise<string> {
  const form = new globalThis.FormData();
  form.append("file", new Blob([new Uint8Array(data)]), filename);
  form.append("uploadPath", uploadPath);
  form.append("fileName", filename);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal
  });
  const resData = await parseKieJson(res, "upload");
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
  const bytes = await loadMediaRefBytes(ref, context);
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
    `upload-${Date.now()}.png`,
    context?.signal
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
    `upload-${Date.now()}.mp3`,
    context?.signal
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
    `upload-${Date.now()}.mp4`,
    context?.signal
  );
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  // A library-picked or freshly-generated ref carries only `asset_id` (with an
  // empty `uri`); `resolveUploadBytes` → `loadMediaRefBytes` resolves it via the
  // context, so treat a non-empty `asset_id` as a source. `null`/`""` stay unset.
  return !!(r.data || r.uri || r.asset_id);
}

export { isRefSet };

// Custom endpoint helpers for Veo, Runway, etc.
async function submitCustom(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(payload),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

function pollCustom(
  apiKey: string,
  taskId: string,
  pollEndpoint: string,
  pollInterval: number,
  maxAttempts: number,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const stateDone = recordInfoDone(taskId);
  return pollKieTask(
    apiKey,
    `${KIE_API_BASE}${pollEndpoint}?taskId=${taskId}`,
    taskId,
    pollInterval,
    maxAttempts,
    (data) => {
      // Veo-style completion: successFlag 1 = done, 2/3 = failed.
      const successFlag = asRecord(data.data)?.successFlag;
      if (successFlag !== undefined) {
        const flag = Number(successFlag);
        if (flag === 1) return true;
        if (flag === 2 || flag === 3) {
          throw new Error(
            withTaskId(`Task failed: ${data.msg || "Unknown error"}`, taskId)
          );
        }
      }
      // Runway-style completion: a state word.
      return stateDone(data);
    },
    signal
  );
}

async function downloadCustomResult(
  statusData: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Buffer> {
  const data = statusData.data as Record<string, unknown>;

  // Try Runway-style: data.videoInfo.videoUrl
  const videoInfo = data?.videoInfo as Record<string, unknown> | undefined;
  if (videoInfo?.videoUrl) {
    const res = await fetchBilledResult(videoInfo.videoUrl as string, signal);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Try Veo-style: data.resultUrls or data.response.resultUrls
  let resultUrls: string[] = [];
  const rawUrls =
    data?.resultUrls ||
    (data?.response as Record<string, unknown>)?.resultUrls ||
    (data?.response as Record<string, unknown>)?.originUrls;

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

  const res = await fetchBilledResult(resultUrls[0], signal);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadTextResult(
  apiKey: string,
  taskId: string,
  resultObjectKey: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await kieGet(recordInfoUrl(taskId), apiKey, signal);
  if (!res.ok) throw new Error(withTaskId(`Failed to get result: ${res.status}`, taskId));
  const data = await parseKieJson(res, "recordInfo");
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
  creditsConsumed: number | undefined,
  taskId?: string | null
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
          provider_request_id?: string | null;
        }
      ) => void
    ).call(context, "kie", usd, "USD", {
      billing_unit: "credits",
      quantity: creditsConsumed,
      unit_price: KIE_USD_PER_CREDIT,
      currency: "USD",
      // The task id is what the reconciler looks the charge up by; without it
      // a kie row was never reconciled (design F4).
      provider_request_id: taskId ?? null
    });
  }
}

/**
 * Reconcile a kie charge by task id: `recordInfo` reports `creditsConsumed`
 * once the task settled, which is the billed amount in credits.
 */
export async function fetchKieBillingCost(
  apiKey: string,
  taskId: string
): Promise<{ cost: number; currency: string; quantity: number; unit_price: number } | null> {
  const data = await fetchRecordInfo(apiKey, taskId);
  const credits = parseCreditsConsumed(data);
  if (credits == null || !Number.isFinite(credits)) return null;
  return {
    cost: credits * KIE_USD_PER_CREDIT,
    currency: "USD",
    quantity: credits,
    unit_price: KIE_USD_PER_CREDIT
  };
}

/** Register the kie reconciler so the tracker can refine kie estimates. */
export function registerKieCostReconciler(): void {
  registerCostReconciler("kie", async ({ requestId, secrets }) => {
    const apiKey = secrets?.KIE_API_KEY || process.env.KIE_API_KEY || "";
    if (!apiKey) return null;
    return fetchKieBillingCost(apiKey, requestId);
  });
}

export async function kieExecuteOmniDirect(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>,
  responseIdKey: string,
  signal?: AbortSignal
): Promise<KieExecuteResult> {
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal
  });
  const data = await parseKieJson(res, "omni submit");
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
  resultObjectKey?: string,
  signal?: AbortSignal
): Promise<KieExecuteResult> {
  const webhookBase = getWebhookBaseUrl();

  if (submitEndpoint) {
    // Custom submit/poll endpoints (Veo, Runway, etc.)
    const customInput = webhookBase
      ? { model, ...input, callBackUrl: `${webhookBase}/api/kie/webhook` }
      : { model, ...input };
    const taskId = await submitCustom(apiKey, submitEndpoint, customInput, signal);

    if (webhookBase) {
      const timeoutMs = pollInterval * maxAttempts;
      await registerWebhookWait(taskId, timeoutMs, signal);
      // Fetch the final status after webhook fires
      const url = `${KIE_API_BASE}${pollEndpoint ?? submitEndpoint}?taskId=${taskId}`;
      const res = await kieGet(url, apiKey, signal);
      const statusData = await parseKieJson(res, "recordInfo");
      const creditsConsumed = parseCreditsConsumed(statusData);
      const resultBytes = await downloadCustomResult(statusData, signal);
      const b64 = resultBytes.toString("base64");
      return { data: b64, items: [b64], taskId, creditsConsumed };
    }

    const statusData = await pollCustom(
      apiKey,
      taskId,
      pollEndpoint ?? submitEndpoint,
      pollInterval,
      maxAttempts,
      signal
    );
    const creditsConsumed = parseCreditsConsumed(statusData);
    const resultBytes = await downloadCustomResult(statusData, signal);
    const b64 = resultBytes.toString("base64");
    return { data: b64, items: [b64], taskId, creditsConsumed };
  }

  const finalInput = webhookBase
    ? { ...input, callBackUrl: `${webhookBase}/api/kie/webhook` }
    : input;
  const taskId = await submitTask(apiKey, model, finalInput, signal);

  let statusData: Record<string, unknown>;
  if (webhookBase) {
    const timeoutMs = pollInterval * maxAttempts;
    await registerWebhookWait(taskId, timeoutMs, signal);
    statusData = await fetchRecordInfo(apiKey, taskId, signal);
  } else {
    statusData = await pollStatus(
      apiKey,
      taskId,
      pollInterval,
      maxAttempts,
      signal
    );
  }

  const creditsConsumed = parseCreditsConsumed(statusData);
  if (resultObjectKey) {
    const text = await downloadTextResult(
      apiKey,
      taskId,
      resultObjectKey,
      signal
    );
    return { data: text, items: [text], taskId, creditsConsumed };
  }
  const result = await downloadResult(apiKey, taskId, signal);
  const items = result.items.map((b) => b.toString("base64"));
  return { data: items[0], items, taskId: result.taskId, creditsConsumed };
}

// Suno music uses different endpoints
export async function kieSubmitSuno(
  apiKey: string,
  input: Record<string, unknown>,
  endpoint = "/api/v1/generate",
  signal?: AbortSignal
): Promise<string> {
  // callBackUrl is always required by the Suno API. When KIE_WEBHOOK_URL is
  // set we use it; otherwise inject a placeholder (we poll instead).
  const webhookBase = getWebhookBaseUrl();
  const callBackUrl = webhookBase
    ? `${webhookBase}/api/kie/webhook`
    : "https://nodetool.ai/kie-callback";
  const body = input.callBackUrl
    ? input
    : { ...input, callBackUrl };
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) throw new Error(`No taskId: ${JSON.stringify(data)}`);
  return taskId;
}

/** Suno reports its own status words beside the shared terminal vocabulary. */
const SUNO_FAILURE_STATES = new Set([
  "create_task_failed",
  "generate_audio_failed",
  "callback_exception",
  "sensitive_word_error"
]);

export function kiePollSuno(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 120,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return pollKieTask(
    apiKey,
    sunoRecordUrl(taskId),
    taskId,
    pollInterval,
    maxAttempts,
    (data) => {
      const status = String(asRecord(data.data)?.status ?? "").toLowerCase();
      if (TERMINAL_SUCCESS_STATES.has(status)) return true;
      if (SUNO_FAILURE_STATES.has(status) || TERMINAL_FAILURE_STATES.has(status)) {
        throw new Error(withTaskId(`Suno task failed: ${status}`, taskId));
      }
      return false;
    },
    signal
  );
}

export async function kieExecuteSunoTask(
  apiKey: string,
  input: Record<string, unknown>,
  pollInterval = 4000,
  maxAttempts = 120,
  endpoint?: string,
  signal?: AbortSignal
): Promise<KieExecuteResult> {
  const taskId = await kieSubmitSuno(apiKey, input, endpoint, signal);
  const webhookBase = getWebhookBaseUrl();

  let pollResult: Record<string, unknown>;
  if (webhookBase) {
    const timeoutMs = pollInterval * maxAttempts;
    await registerWebhookWait(taskId, timeoutMs, signal);
    const res = await kieGet(sunoRecordUrl(taskId), apiKey, signal);
    pollResult = await parseKieJson(res, "record-info");
  } else {
    pollResult = await kiePollSuno(
      apiKey,
      taskId,
      pollInterval,
      maxAttempts,
      signal
    );
  }

  const creditsConsumed = parseCreditsConsumed(pollResult);
  const sunoData = (
    (pollResult.data as Record<string, unknown>)?.response as Record<string, unknown>
  )?.sunoData as Array<Record<string, unknown>>;
  if (!sunoData?.length) throw new Error("No sunoData in Suno response");
  const audioUrl = sunoData[0].audioUrl as string;
  if (!audioUrl) throw new Error("No audioUrl in Suno response");
  const dlRes = await fetchBilledResult(audioUrl, signal);
  if (!dlRes.ok) throw new Error(`Failed to download audio: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const b64 = buf.toString("base64");
  return { data: b64, items: [b64], taskId, creditsConsumed };
}

/** Build an ImageRef from the base64 image KIE returns. */
export function kieImageRef(base64: string): Promise<EncodedImageRef> {
  return imageRefFromBytes(new Uint8Array(Buffer.from(base64, "base64")));
}
