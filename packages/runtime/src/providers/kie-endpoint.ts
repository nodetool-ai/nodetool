/**
 * The KIE endpoint transport behind `KieProvider.callEndpoint`, `uploadMedia`,
 * `downloadMedia` and `fetchBillingCost`: the job API, the Suno API and KIE's
 * direct endpoints, the file upload host and result downloads.
 *
 * This is the transport the `@nodetool-ai/kie-nodes` pack carried in
 * `kie-base.ts`, moved here unchanged so the pack's nodes keep their request
 * shapes, retries, poll rules and error messages. The capability methods on
 * `KieProvider` still run their own submit and poll helpers.
 */

import { createHmac } from "node:crypto";

import { recordGenerationReceipt } from "../generation-receipt.js";
import type {
  EndpointCallRequest,
  EndpointCallResult,
  MediaUpload
} from "./base-provider.js";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES,
  fetchWithRetry,
  sleep
} from "./http-transport.js";
import { extForImageMime } from "./image-mime.js";
import { registerWebhookWait } from "./kie-webhook-registry.js";
import { getManifestNodeMeta } from "./manifest-models.js";
import { safeFetch } from "./safe-url.js";

export const KIE_API_BASE = "https://api.kie.ai";
export const KIE_UPLOAD_URL =
  "https://kieai.redpandaai.co/api/file-stream-upload";
// The Suno API always requires a callBackUrl. When KIE_WEBHOOK_URL is set we
// use it; otherwise a placeholder satisfies the requirement (we poll instead).
export const KIE_SUNO_CALLBACK = "https://nodetool.ai/kie-callback";
export const KIE_MANIFEST_PKG = "@nodetool-ai/kie-nodes";
export const KIE_MANIFEST_PATH = "kie-manifest.json";

/**
 * When set, KIE tasks are submitted with a real callBackUrl and the transport
 * waits for the webhook instead of polling. Set to the public base URL of this
 * server (e.g. `https://myserver.example.com`).
 *
 * Webhook mode also needs a secret for the callback token (see
 * {@link kieWebhookToken}). Without one this answers undefined and the
 * transport polls, because an unauthenticated callback would let anyone who
 * learns a task id settle somebody's paid task.
 */
export function getWebhookBaseUrl(): string | undefined {
  const url = process.env.KIE_WEBHOOK_URL;
  if (!url || !url.trim() || !kieWebhookToken()) return undefined;
  return url.replace(/\/+$/, "");
}

/** The route KIE posts task callbacks to. */
export const KIE_WEBHOOK_PATH = "/api/kie/webhook";

/**
 * The token every KIE callback URL carries. KIE signs nothing, so the URL is
 * the only credential: `KIE_WEBHOOK_SECRET` when the operator sets one, else a
 * key derived from `SECRETS_MASTER_KEY`. Null when neither is set.
 */
export function kieWebhookToken(): string | null {
  const explicit = process.env.KIE_WEBHOOK_SECRET?.trim();
  const master = process.env.SECRETS_MASTER_KEY?.trim();
  const secret = explicit || master;
  if (!secret) return null;
  return createHmac("sha256", secret).update("nodetool:kie-webhook:v1").digest("hex");
}

/** Whether `token` is this server's KIE callback token. */
export function isValidKieWebhookToken(token: unknown): boolean {
  const expected = kieWebhookToken();
  if (!expected || typeof token !== "string") return false;
  if (token.length !== expected.length) return false;
  // Constant time over the hex digest. `timingSafeEqual` is not used because
  // this module also loads in the browser bundle, whose `node:crypto` stub
  // does not export it.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** The callBackUrl to submit, or undefined when webhook mode is off. */
export function kieWebhookCallbackUrl(): string | undefined {
  const base = getWebhookBaseUrl();
  const token = kieWebhookToken();
  return base && token
    ? `${base}${KIE_WEBHOOK_PATH}?token=${encodeURIComponent(token)}`
    : undefined;
}

export function kieHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

/** The `code` values KIE returns inside an HTTP-200 error envelope. */
const KIE_ERROR_CODES: Record<number, string> = {
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

/**
 * Classify a KIE response envelope. Returns the error KIE announced inside an
 * otherwise-successful HTTP response, or null when the envelope is not an
 * error. The live contract probe reads this to check that the error envelope
 * still looks the way the provider expects.
 */
export function kieEnvelopeError(
  data: Record<string, unknown>
): { code: number; label: string; message: string } | null {
  const code = Number(data.code);
  const label = KIE_ERROR_CODES[code];
  if (!label) return null;
  const message = typeof data.msg === "string" ? data.msg : "";
  return { code, label, message };
}

/**
 * KIE reports API errors inside HTTP-200 bodies as `{code, msg}`. Throw on a
 * known error code. Without this a failed job returns a 200 that a poll loop
 * reads as "not done yet" and runs to full timeout.
 */
export function checkKieStatus(data: Record<string, unknown>): void {
  const error = kieEnvelopeError(data);
  if (error) throw new Error(`${error.label}: ${JSON.stringify(data)}`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function tryParseRecord(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function withTaskId(message: string, taskId: string): string {
  return `${message} (taskId: ${taskId})`;
}

/**
 * Read a KIE response body. A gateway 502 answers with an HTML page, and
 * `res.json()` on it threw `SyntaxError: Unexpected token '<'`, so the status
 * the caller needed never reached them. Parse defensively and report the
 * status with a body snippet instead. Every parsed body still goes through
 * {@link checkKieStatus}, because KIE announces failures inside HTTP 200.
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
  if (data.code !== undefined) checkKieStatus(data);
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
  return fetchWithRetry(url, { headers: kieHeaders(apiKey), signal });
}

/** Credits KIE reports as consumed on a finished task body, when it does. */
export function parseKieCredits(
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

function recordInfoUrl(taskId: string): string {
  return `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
}

function sunoRecordUrl(taskId: string): string {
  return `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
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

/**
 * A dead job used to look like a slow one two ways: a persistent non-OK poll
 * after createTask succeeded, and a body that names no state. Both ran the full
 * attempt budget before reporting a timeout.
 */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

/** Poll a KIE task until `isDone` accepts a body (or throws for a failed job). */
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
      res = await fetch(url, { headers: kieHeaders(apiKey), signal });
    } catch (err) {
      // A thrown network error is the same transient the loop already
      // tolerates, so it counts toward the same cutoff.
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
      if (envelope?.code !== undefined) checkKieStatus(envelope);
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

/**
 * Read the job state out of a `recordInfo` body against the shared terminal
 * vocabulary, so an unfamiliar synonym does not degrade into a timeout that
 * reports a finished job as a slow one.
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

/** Suno reports its own status words beside the shared terminal vocabulary. */
const SUNO_FAILURE_STATES = new Set([
  "create_task_failed",
  "generate_audio_failed",
  "callback_exception",
  "sensitive_word_error"
]);

function sunoDone(taskId: string): (data: Record<string, unknown>) => boolean {
  return (data) => {
    const status = String(asRecord(data.data)?.status ?? "").toLowerCase();
    if (TERMINAL_SUCCESS_STATES.has(status)) return true;
    if (SUNO_FAILURE_STATES.has(status) || TERMINAL_FAILURE_STATES.has(status)) {
      throw new Error(withTaskId(`Suno task failed: ${status}`, taskId));
    }
    return false;
  };
}

/** POST a job-creating request once. A retried POST could bill twice. */
async function submitKieTask(
  apiKey: string,
  url: string,
  body: Record<string, unknown>,
  missingTaskId: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: kieHeaders(apiKey),
    body: JSON.stringify(body),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok) {
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const taskId = asRecord(data.data)?.taskId;
  if (!taskId) throw new Error(`${missingTaskId}: ${JSON.stringify(data)}`);
  const id = String(taskId);
  // KIE bills at submit, so the task id is the receipt even when the poll
  // later fails or times out: the reconciler looks the charge up by it.
  recordGenerationReceipt({ provider_request_id: id });
  return id;
}

/**
 * The endpoint families `KieProvider.callEndpoint` accepts through `route`:
 *
 * - no route: the job API. `model` is the KIE model name and `input` its
 *   arguments. POST `/api/v1/jobs/createTask`, then `recordInfo`.
 * - `suno:<path>`: a Suno endpoint such as `suno:/api/v1/generate`. `input`
 *   is the request body. Polls `/api/v1/generate/record-info`.
 * - `direct:<path>`: an endpoint that answers in the submit response, such as
 *   `direct:/api/v1/omni/audio/create`. `input` is the request body.
 *
 * A path is a `/api/v1/` path on the KIE API host.
 */
export type KieRoute =
  | { kind: "jobs" }
  | { kind: "suno"; path: string }
  | { kind: "direct"; path: string };

const KIE_ROUTE_PATH = /^\/api\/v1\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export function parseKieRoute(route: string | undefined): KieRoute {
  if (route === undefined) return { kind: "jobs" };
  const separator = route.indexOf(":");
  const kind = route.slice(0, separator);
  const path = route.slice(separator + 1);
  if (
    separator > 0 &&
    (kind === "suno" || kind === "direct") &&
    KIE_ROUTE_PATH.test(path)
  ) {
    return { kind, path };
  }
  throw new Error(
    `kie does not accept route "${route}". Use no route for the job API, ` +
      '"suno:/api/v1/<path>" or "direct:/api/v1/<path>".'
  );
}

/**
 * Poll interval and attempt budget for a model, from the node manifest that
 * generated it. A model the manifest does not list gets the defaults the pack
 * used: 2 s × 300 for jobs, 4 s × 120 for Suno.
 */
function pollConfig(
  model: string,
  route: KieRoute
): { pollInterval: number; maxAttempts: number } {
  const meta = getManifestNodeMeta(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, model);
  const suno = route.kind === "suno";
  return {
    pollInterval: meta?.pollInterval ?? (suno ? 4000 : 2000),
    maxAttempts: meta?.maxAttempts ?? (suno ? 120 : 300)
  };
}

function creditsMetadata(
  statusData: Record<string, unknown>
): Record<string, unknown> | undefined {
  const creditsConsumed = parseKieCredits(statusData);
  return creditsConsumed === undefined ? undefined : { creditsConsumed };
}

/**
 * Run one endpoint call. The output is KIE's JSON unchanged: the finished
 * `recordInfo` body for jobs, the finished `record-info` body for Suno, the
 * submit response for direct endpoints. `metadata.creditsConsumed` carries
 * the credits KIE reported for the task, when it reported them.
 */
export async function callKieEndpoint(
  apiKey: string,
  req: EndpointCallRequest
): Promise<EndpointCallResult> {
  const route = parseKieRoute(req.route);
  const signal = req.signal;

  if (route.kind === "direct") {
    const res = await fetch(`${KIE_API_BASE}${route.path}`, {
      method: "POST",
      headers: kieHeaders(apiKey),
      body: JSON.stringify(req.input),
      signal
    });
    const data = await parseKieJson(res, "omni submit");
    if (!res.ok) {
      throw new Error(`Omni submit failed: ${res.status} ${JSON.stringify(data)}`);
    }
    return { output: data, requestId: null };
  }

  const { pollInterval, maxAttempts } = pollConfig(req.model, route);
  const webhookUrl = kieWebhookCallbackUrl();

  if (route.kind === "suno") {
    const body = req.input.callBackUrl
      ? req.input
      : { ...req.input, callBackUrl: webhookUrl ?? KIE_SUNO_CALLBACK };
    const taskId = await submitKieTask(
      apiKey,
      `${KIE_API_BASE}${route.path}`,
      body,
      "No taskId",
      signal
    );
    let record: Record<string, unknown>;
    if (webhookUrl) {
      await registerWebhookWait(taskId, pollInterval * maxAttempts, signal);
      const res = await kieGet(sunoRecordUrl(taskId), apiKey, signal);
      record = await parseKieJson(res, "record-info");
    } else {
      record = await pollKieTask(
        apiKey,
        sunoRecordUrl(taskId),
        taskId,
        pollInterval,
        maxAttempts,
        sunoDone(taskId),
        signal
      );
    }
    return { output: record, requestId: taskId, metadata: creditsMetadata(record) };
  }

  const input = webhookUrl ? { ...req.input, callBackUrl: webhookUrl } : req.input;
  const taskId = await submitKieTask(
    apiKey,
    `${KIE_API_BASE}/api/v1/jobs/createTask`,
    { model: req.model, input },
    "No taskId in response",
    signal
  );
  let statusData: Record<string, unknown>;
  if (webhookUrl) {
    await registerWebhookWait(taskId, pollInterval * maxAttempts, signal);
    const res = await kieGet(recordInfoUrl(taskId), apiKey, signal);
    statusData = await parseKieJson(res, "recordInfo");
  } else {
    statusData = await pollKieTask(
      apiKey,
      recordInfoUrl(taskId),
      taskId,
      pollInterval,
      maxAttempts,
      recordInfoDone(taskId),
      signal
    );
  }
  // The result is read from a fresh recordInfo, as the pack always did: the
  // body that reported the terminal state is not relied on to carry it.
  const res = await kieGet(recordInfoUrl(taskId), apiKey, signal);
  if (!res.ok) {
    throw new Error(withTaskId(`Failed to get result: ${res.status}`, taskId));
  }
  const output = await parseKieJson(res, "recordInfo");
  return { output, requestId: taskId, metadata: creditsMetadata(statusData) };
}

const UPLOAD_PATHS: Record<string, string> = {
  image: "images/user-uploads",
  audio: "audio/user-uploads",
  video: "videos/user-uploads"
};

function uploadExtension(kind: string, mimeType: string): string {
  if (kind === "image") return extForImageMime(mimeType) ?? "png";
  return kind === "audio" ? "mp3" : "mp4";
}

/** Upload bytes to KIE's file host and return the URL its API reads. */
export async function uploadKieMedia(
  apiKey: string,
  upload: MediaUpload
): Promise<string> {
  const kind = upload.mimeType.split("/")[0] ?? "";
  const uploadPath = UPLOAD_PATHS[kind];
  if (!uploadPath) {
    throw new Error(
      `kie cannot upload ${upload.mimeType}: it takes image, audio and video files`
    );
  }
  const filename =
    upload.filename ??
    `upload-${Date.now()}.${uploadExtension(kind, upload.mimeType)}`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(upload.bytes)], { type: upload.mimeType }),
    filename
  );
  form.append("uploadPath", uploadPath);
  form.append("fileName", filename);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: upload.signal
  });
  const data = await parseKieJson(res, "upload");
  if (!res.ok || !data.success) {
    throw new Error(`Upload failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const downloadUrl = asRecord(data.data)?.downloadUrl;
  if (typeof downloadUrl !== "string" || !downloadUrl) {
    throw new Error("No downloadUrl in upload response");
  }
  return downloadUrl;
}

/**
 * Fetch a result URL KIE returned. The URL comes out of a response body, so it
 * is screened (`safeFetch` re-checks every redirect hop), and a 429/5xx is
 * retried: the job is already generated and billed, and a CDN blip must not
 * throw the paid-for result away.
 */
export async function downloadKieMedia(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const res = await fetchWithRetry(
    url,
    { signal },
    {
      fetchImpl: (input, init) => safeFetch(String(input), init as RequestInit)
    }
  );
  if (!res.ok) throw new Error(`kie media download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Credits KIE billed for a task, read from its `recordInfo`. */
export async function fetchKieTaskCredits(
  apiKey: string,
  taskId: string
): Promise<number | undefined> {
  const res = await kieGet(recordInfoUrl(taskId), apiKey);
  return parseKieCredits(await parseKieJson(res, "recordInfo"));
}
