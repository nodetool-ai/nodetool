/**
 * Generation receipts: what a provider learns about its own call while the
 * call is in flight — the request id it was given, and the charge it was told.
 *
 * Twenty-odd provider methods return media bytes and nothing else. Threading a
 * request id through every signature is a large diff for one field, so the
 * receipt travels the other way: the generation seam opens a scope around the
 * provider call, the provider records into whichever scope is on the async
 * stack, and the seam reads the receipt back after dispatch. Concurrent
 * generations each have their own scope, in any completion order — the same
 * property `invocation-account.ts` relies on.
 *
 * Design: docs/media-generation-tracking-design.md § D3.
 */

import type { GenerationReceipt } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { AsyncLocalStorage } from "./async-local-storage.js";

const log = createLogger("nodetool.runtime.generation-receipt");

interface ReceiptScope {
  receipt: GenerationReceipt | null;
  providerResult?: unknown;
  acceptanceHookFailed?: boolean;
  bindingHookFailed?: boolean;
  readonly providerRequestOptions?: GenerationProviderRequestOptions;
  readonly onProviderRequestAccepted?: (
    submission: unknown
  ) => void | Promise<void>;
  readonly onProviderRequestBound?: (
    binding: unknown,
    generationId?: string
  ) => void | Promise<void>;
}

/** Host-supplied callback data for the provider queue request. */
export interface GenerationProviderRequestOptions {
  readonly webhookUrl?: string;
  readonly callbackToken?: string;
  /** The durable host already owns this idempotency key. */
  readonly skipProvider?: boolean;
  /** Existing NodeTool generation to use when the idempotency key was reused. */
  readonly existingGenerationId?: string;
  /** NodeTool generation identity for concurrent binding callbacks. */
  readonly generationId?: string;
  /** This request is owned by a durable host and can be recovered after exit. */
  readonly durable?: boolean;
}

/** True only for a provider response that explicitly says it is terminal. */
export function isAuthoritativeProviderTerminalError(
  value: unknown
): value is { readonly authoritativeProviderTerminal: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "authoritativeProviderTerminal" in value &&
    (value as { authoritativeProviderTerminal?: unknown })
      .authoritativeProviderTerminal === true
  );
}

export interface GenerationReceiptScopeOptions {
  readonly providerRequestOptions?: GenerationProviderRequestOptions;
  readonly onProviderRequestAccepted?: (
    submission: unknown
  ) => void | Promise<void>;
  readonly onProviderRequestBound?: (
    binding: unknown,
    generationId?: string
  ) => void | Promise<void>;
}

const store = new AsyncLocalStorage<ReceiptScope>();

/**
 * Record what the provider knows about the generation on the async stack.
 * Partial receipts merge: a request id recorded at submit and a charge
 * recorded after the poll land on one receipt. Outside a scope the call is a
 * no-op, logged at debug — a provider used from a path that is not a
 * generation (a probe, a listing) has nothing to attach to.
 */
export function recordGenerationReceipt(
  receipt: Partial<GenerationReceipt>
): void {
  const scope = store.getStore();
  if (!scope) {
    log.debug("Generation receipt recorded outside a generation scope", {
      provider_request_id: receipt.provider_request_id ?? null
    });
    return;
  }
  const current = scope.receipt ?? {};
  const merged: GenerationReceipt = { ...current };
  if (receipt.provider_request_id !== undefined) {
    merged.provider_request_id = receipt.provider_request_id;
  }
  if (receipt.cost !== undefined) {
    merged.cost = receipt.cost;
  }
  scope.receipt = merged;
}

/** Retain the provider's JSON result before a caller-specific decoder runs. */
export function recordGenerationProviderResult(result: unknown): void {
  const scope = store.getStore();
  if (scope) scope.providerResult = result;
}

/** Read callback data supplied by the durable host for the active generation. */
export function currentGenerationProviderRequestOptions(): GenerationProviderRequestOptions | null {
  return store.getStore()?.providerRequestOptions ?? null;
}

/**
 * Record a provider id and await the host's durable acceptance hook. Providers
 * use this at the submit boundary; the hook is a no-op for ephemeral hosts.
 */
export async function recordGenerationReceiptAsync(
  receipt: Partial<GenerationReceipt>,
  submission?: unknown
): Promise<void> {
  recordGenerationReceipt(receipt);
  const scope = store.getStore();
  if (!scope?.onProviderRequestAccepted) return;
  try {
    await scope.onProviderRequestAccepted(submission ?? receipt);
  } catch (error) {
    scope.acceptanceHookFailed = true;
    throw error;
  }
}

/** Await the host's durable binding hook after a provider id is returned. */
export async function recordGenerationBindingAsync(
  binding: unknown
): Promise<void> {
  const scope = store.getStore();
  if (!scope?.onProviderRequestBound) return;
  try {
    await scope.onProviderRequestBound(
      binding,
      scope.providerRequestOptions?.generationId
    );
  } catch (error) {
    scope.bindingHookFailed = true;
    throw error;
  }
}

/**
 * Run `fn` inside a fresh receipt scope and return its value together with
 * whatever the provider recorded. The receipt is returned even when `fn`
 * throws — a failed call may still carry a request id the reconciler needs —
 * by way of {@link GenerationScopeError}.
 */
export async function runWithGenerationReceipt<T>(
  fn: () => Promise<T>,
  options: GenerationReceiptScopeOptions = {}
): Promise<{
  value: T;
  receipt: GenerationReceipt | null;
  providerResult: unknown;
}> {
  const scope: ReceiptScope = { receipt: null, ...options };
  try {
    const value = await store.run(scope, fn);
    return {
      value,
      receipt: scope.receipt,
      providerResult: scope.providerResult
    };
  } catch (error) {
    throw new GenerationScopeError(
      error,
      scope.receipt,
      scope.providerResult,
      scope
    );
  }
}

/**
 * Wraps the provider's error so the seam can read the receipt collected
 * before the failure. `cause` is the original error, rethrown unchanged to
 * every caller above the seam.
 */
export class GenerationScopeError extends Error {
  readonly cause: unknown;
  readonly receipt: GenerationReceipt | null;
  readonly providerResult: unknown;
  readonly acceptanceHookFailed: boolean;
  readonly bindingHookFailed: boolean;

  constructor(
    cause: unknown,
    receipt: GenerationReceipt | null,
    providerResult: unknown,
    phase?: { acceptanceHookFailed?: boolean; bindingHookFailed?: boolean }
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "GenerationScopeError";
    this.cause = cause;
    this.receipt = receipt;
    this.providerResult = providerResult;
    this.acceptanceHookFailed = phase?.acceptanceHookFailed === true;
    this.bindingHookFailed = phase?.bindingHookFailed === true;
  }
}

/** The receipt on the async stack right now, if any. Test seam. */
export function currentGenerationReceipt(): GenerationReceipt | null {
  return store.getStore()?.receipt ?? null;
}
