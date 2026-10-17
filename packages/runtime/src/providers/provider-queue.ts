/**
 * Provider-neutral contracts for queue-backed generation adapters.
 *
 * The runtime deliberately owns no persistence or generation lifecycle here.
 * Hosts can bind the returned submission to their durable attempt before
 * waiting, while provider adapters remain responsible for transport only.
 */

export interface ProviderQueueSubmission {
  readonly provider: string;
  readonly endpoint: string;
  readonly providerRequestId: string;
  readonly statusLocator?: string;
  readonly resultLocator?: string;
  readonly cancelLocator?: string;
}

export interface ProviderQueueBinding extends ProviderQueueSubmission {
  /** The exact endpoint and request id that were persisted by the host. */
  readonly bound: true;
}

export type ProviderQueueState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ProviderQueueObservation<TResult = unknown> {
  readonly provider: string;
  readonly endpoint: string;
  readonly providerRequestId: string;
  readonly state: ProviderQueueState;
  readonly result?: TResult;
  readonly error?: unknown;
  readonly rawStatus?: unknown;
}

/**
 * A provider has returned an explicit terminal observation. Transport errors,
 * poll timeouts, and local decode/storage failures must not be represented by
 * this error because they leave the durable attempt recoverable.
 */
export class ProviderQueueTerminalError extends Error {
  readonly authoritativeProviderTerminal = true as const;

  constructor(
    readonly provider: string,
    readonly providerRequestId: string,
    readonly state: Extract<ProviderQueueState, "failed" | "cancelled">,
    readonly observation?: ProviderQueueObservation
  ) {
    const detail = describeProviderError(observation?.error);
    super(
      `Provider queue request ${providerRequestId} did not succeed (${state})${
        detail ? `: ${detail}` : ""
      }`
    );
    this.name = "ProviderQueueTerminalError";
  }
}

/** Longest provider error text carried into a message. */
const MAX_PROVIDER_ERROR_CHARS = 500;

/**
 * A provider's error payload as one readable sentence, or undefined when it
 * carries nothing to read. Accepts a string, a `{ message | msg | detail |
 * error }` object, and a FastAPI-style validation list (`[{ loc, msg }]`),
 * which is what a queue answers for an input the model rejected.
 */
export function describeProviderError(error: unknown): string | undefined {
  const text = describe(error, 0)?.trim();
  if (!text) return undefined;
  return text.length > MAX_PROVIDER_ERROR_CHARS
    ? `${text.slice(0, MAX_PROVIDER_ERROR_CHARS)}…`
    : text;
}

function describe(error: unknown, depth: number): string | undefined {
  if (error === null || error === undefined || depth > 3) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }
  if (Array.isArray(error)) {
    const parts = error
      .map((item) => describe(item, depth + 1))
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = describe(
      record.message ?? record.msg ?? record.detail ?? record.error,
      depth + 1
    );
    if (message) {
      const loc = Array.isArray(record.loc)
        ? record.loc.filter((part) => part !== "body").join(".")
        : undefined;
      return loc ? `${loc}: ${message}` : message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface ProviderQueueWaitOptions {
  readonly signal?: AbortSignal;
  readonly onUpdate?: (observation: ProviderQueueObservation) => void;
  readonly pollIntervalMs?: number;
}

/**
 * A small adapter surface that can be backed by an ephemeral host today and
 * a durable generation worker later. `bind` is intentionally explicit even
 * when the provider returns its id in the submit response.
 */
export interface ProviderQueueAdapter<TInput = unknown, TResult = unknown> {
  readonly provider: string;
  submit(input: TInput): Promise<ProviderQueueSubmission>;
  bind(submission: ProviderQueueSubmission): Promise<ProviderQueueBinding>;
  wait(
    binding: ProviderQueueBinding,
    options?: ProviderQueueWaitOptions
  ): Promise<ProviderQueueObservation<TResult>>;
  cancel(
    binding: ProviderQueueBinding,
    options?: { readonly signal?: AbortSignal }
  ): Promise<void>;
}
