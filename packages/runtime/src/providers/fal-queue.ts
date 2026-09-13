import type {
  ProviderQueueAdapter,
  ProviderQueueBinding,
  ProviderQueueObservation,
  ProviderQueueSubmission,
  ProviderQueueWaitOptions
} from "./provider-queue.js";
import { ProviderQueueTerminalError } from "./provider-queue.js";

export const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
export const FAL_PROVIDER_ID = "fal_ai";

export const FAL_QUEUE_STATES = {
  IN_QUEUE: "IN_QUEUE",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED"
} as const;

export type FalQueueState =
  (typeof FAL_QUEUE_STATES)[keyof typeof FAL_QUEUE_STATES];

export interface FalQueueSubmitInput {
  readonly endpoint: string;
  readonly input: Record<string, unknown>;
  readonly webhookUrl?: string;
  readonly signal?: AbortSignal;
}

export interface FalQueueSubmission extends ProviderQueueSubmission {
  readonly provider: typeof FAL_PROVIDER_ID;
  readonly requestId: string;
}

export interface FalQueueResult {
  readonly data: Record<string, unknown>;
  readonly requestId: string;
  readonly raw: unknown;
}

export interface FalQueueOperations extends ProviderQueueAdapter<
  FalQueueSubmitInput,
  Record<string, unknown>
> {
  submit(input: FalQueueSubmitInput): Promise<FalQueueSubmission>;
  bind(submission: FalQueueSubmission): Promise<ProviderQueueBinding>;
  wait(
    binding: ProviderQueueBinding,
    options?: ProviderQueueWaitOptions
  ): Promise<ProviderQueueObservation<Record<string, unknown>>>;
}

type FalQueueEnvelope = Record<string, unknown>;

export interface FalQueueOperationsOptions {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
  readonly pollIntervalMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnvelope(value: unknown): FalQueueEnvelope {
  return isRecord(value) ? value : {};
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`FAL queue response is missing ${name}`);
  }
  return value;
}

function endpointPath(endpoint: string): string {
  const trimmed = endpoint.trim();
  let start = 0;
  let end = trimmed.length;
  while (start < end && trimmed[start] === "/") {
    start += 1;
  }
  while (end > start && trimmed[end - 1] === "/") {
    end -= 1;
  }
  const value = trimmed.slice(start, end);
  if (!value || value.includes("://") || value.includes("\\")) {
    throw new Error(`Invalid FAL endpoint: ${endpoint}`);
  }
  return value;
}

/** Queue status/result endpoints address the application, not its path. */
function applicationPath(endpoint: string): string {
  const value = endpointPath(endpoint);
  const parts = value.split("/");
  const namespaced = parts[0] === "workflows" || parts[0] === "comfy";
  const minimum = namespaced ? 3 : 2;
  if (parts.length < minimum) {
    throw new Error(`Invalid FAL endpoint application id: ${endpoint}`);
  }
  return parts.slice(0, minimum).join("/");
}

function requestUrl(endpoint: string, requestId: string, suffix = ""): string {
  const endpointValue = applicationPath(endpoint);
  const requestValue = encodeURIComponent(requestId);
  return `${FAL_QUEUE_ORIGIN}/${endpointValue}/requests/${requestValue}${suffix}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  let value: unknown = null;
  if (text.length > 0) {
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `FAL queue returned invalid JSON (HTTP ${response.status})`
      );
    }
  }
  if (!response.ok) {
    const detail = isRecord(value) ? value.error : undefined;
    throw new Error(
      `FAL queue request failed (HTTP ${response.status})${
        typeof detail === "string" ? `: ${detail}` : ""
      }`
    );
  }
  return value;
}

function resultData(value: unknown): Record<string, unknown> {
  const envelope = readEnvelope(value);
  const data = "data" in envelope ? envelope.data : value;
  if (!isRecord(data)) {
    throw new Error("FAL queue result did not contain a JSON object payload");
  }
  return data;
}

function stateFromStatus(
  status: unknown,
  value: Record<string, unknown>
): "queued" | "running" | "succeeded" | "failed" {
  if (status === FAL_QUEUE_STATES.IN_QUEUE) return "queued";
  if (status === FAL_QUEUE_STATES.IN_PROGRESS) return "running";
  if (status === FAL_QUEUE_STATES.COMPLETED) {
    return statusError(value) === undefined ? "succeeded" : "failed";
  }
  throw new Error(`FAL queue returned an unknown status: ${String(status)}`);
}

function statusError(value: Record<string, unknown>): unknown {
  const error = value.error ?? value.error_type ?? value.payload_error;
  return error == null || error === "" ? undefined : error;
}

function waitForDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

/**
 * Create the FAL queue adapter. Submission uses one native POST with no
 * automatic retries. Read-only status/result requests may be retried by a
 * future host worker without ever replaying a paid submission.
 */
export function createFalQueueOperations(
  options: FalQueueOperationsOptions
): FalQueueOperations {
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const headers = {
    Authorization: `Key ${options.apiKey}`,
    "Content-Type": "application/json"
  };

  const submit = async (
    request: FalQueueSubmitInput
  ): Promise<FalQueueSubmission> => {
    const url = new URL(
      `${FAL_QUEUE_ORIGIN}/${endpointPath(request.endpoint)}`
    );
    if (request.webhookUrl)
      url.searchParams.set("fal_webhook", request.webhookUrl);
    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request.input),
      signal: request.signal
    });
    const envelope = readEnvelope(await readJson(response));
    const requestId = requireString(envelope.request_id, "request_id");
    return {
      provider: FAL_PROVIDER_ID,
      endpoint: endpointPath(request.endpoint),
      providerRequestId: requestId,
      requestId,
      statusLocator:
        typeof envelope.status_url === "string"
          ? envelope.status_url
          : undefined,
      resultLocator:
        typeof envelope.response_url === "string"
          ? envelope.response_url
          : undefined,
      cancelLocator:
        typeof envelope.cancel_url === "string"
          ? envelope.cancel_url
          : undefined
    };
  };

  const bind = async (
    submission: FalQueueSubmission
  ): Promise<ProviderQueueBinding> => {
    const endpoint = endpointPath(submission.endpoint);
    const requestId = requireString(submission.providerRequestId, "request_id");
    if (requestId !== submission.requestId) {
      throw new Error(
        "FAL queue submission has conflicting request identities"
      );
    }
    return {
      ...submission,
      endpoint,
      providerRequestId: requestId,
      bound: true
    };
  };

  const status = async (
    binding: ProviderQueueBinding,
    signal?: AbortSignal
  ): Promise<unknown> => {
    const response = await fetchFn(
      requestUrl(binding.endpoint, binding.providerRequestId, "/status"),
      {
        method: "GET",
        headers: { Authorization: `Key ${options.apiKey}` },
        signal
      }
    );
    return readJson(response);
  };

  const result = async (
    binding: ProviderQueueBinding,
    signal?: AbortSignal
  ): Promise<FalQueueResult> => {
    const raw = await readJson(
      await fetchFn(requestUrl(binding.endpoint, binding.providerRequestId), {
        method: "GET",
        headers: { Authorization: `Key ${options.apiKey}` },
        signal
      })
    );
    return {
      data: resultData(raw),
      requestId: binding.providerRequestId,
      raw
    };
  };

  const wait = async (
    binding: ProviderQueueBinding,
    waitOptions: ProviderQueueWaitOptions = {}
  ): Promise<ProviderQueueObservation<Record<string, unknown>>> => {
    const pollInterval =
      waitOptions.pollIntervalMs ?? options.pollIntervalMs ?? 500;
    for (;;) {
      const rawStatus = await status(binding, waitOptions.signal);
      const envelope = readEnvelope(rawStatus);
      const state = stateFromStatus(envelope.status, envelope);
      const observationBase: ProviderQueueObservation<Record<string, unknown>> =
        {
          provider: FAL_PROVIDER_ID,
          endpoint: binding.endpoint,
          providerRequestId: binding.providerRequestId,
          state,
          rawStatus
        };
      const error = statusError(envelope);
      const observation =
        error === undefined ? observationBase : { ...observationBase, error };
      waitOptions.onUpdate?.(observation);
      if (state === "failed") return observation;
      if (state === "succeeded") {
        const completed = await result(binding, waitOptions.signal);
        return { ...observation, result: completed.data };
      }
      await waitForDelay(pollInterval, waitOptions.signal);
    }
  };

  const cancel = async (
    binding: ProviderQueueBinding,
    cancelOptions: { readonly signal?: AbortSignal } = {}
  ): Promise<void> => {
    const response = await fetchFn(
      requestUrl(binding.endpoint, binding.providerRequestId, "/cancel"),
      {
        method: "PUT",
        headers: { Authorization: `Key ${options.apiKey}` },
        signal: cancelOptions.signal
      }
    );
    await readJson(response);
  };

  return { provider: FAL_PROVIDER_ID, submit, bind, wait, cancel };
}

export async function falSubmitAndWait(
  operations: FalQueueOperations,
  request: FalQueueSubmitInput,
  options: ProviderQueueWaitOptions & {
    readonly onAccepted?: (
      submission: FalQueueSubmission
    ) => void | Promise<void>;
    readonly onBound?: (binding: ProviderQueueBinding) => void | Promise<void>;
  } = {}
): Promise<FalQueueResult> {
  const submission = await operations.submit(request);
  await options.onAccepted?.(submission);
  const binding = await operations.bind(submission);
  await options.onBound?.(binding);
  const observation = await operations.wait(binding, options);
  if (observation.state !== "succeeded" || !observation.result) {
    throw new ProviderQueueTerminalError(
      FAL_PROVIDER_ID,
      submission.requestId,
      observation.state === "cancelled" ? "cancelled" : "failed",
      observation
    );
  }
  return {
    data: observation.result,
    requestId: submission.requestId,
    raw: observation.rawStatus
  };
}

/** Normalize SDK queue result envelopes for recovered and live requests. */
export function decodeFalQueueResult(value: unknown): FalQueueResult {
  const envelope = readEnvelope(value);
  const requestId = requireString(
    envelope.request_id ?? envelope.requestId,
    "request_id"
  );
  return { data: resultData(value), requestId, raw: value };
}
