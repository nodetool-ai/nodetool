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
    super(
      `Provider queue request ${providerRequestId} did not succeed (${state})`
    );
    this.name = "ProviderQueueTerminalError";
  }
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
