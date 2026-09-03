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

/**
 * Run `fn` inside a fresh receipt scope and return its value together with
 * whatever the provider recorded. The receipt is returned even when `fn`
 * throws — a failed call may still carry a request id the reconciler needs —
 * by way of {@link GenerationScopeError}.
 */
export async function runWithGenerationReceipt<T>(
  fn: () => Promise<T>
): Promise<{ value: T; receipt: GenerationReceipt | null }> {
  const scope: ReceiptScope = { receipt: null };
  try {
    const value = await store.run(scope, fn);
    return { value, receipt: scope.receipt };
  } catch (error) {
    throw new GenerationScopeError(error, scope.receipt);
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

  constructor(cause: unknown, receipt: GenerationReceipt | null) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "GenerationScopeError";
    this.cause = cause;
    this.receipt = receipt;
  }
}

/** The receipt on the async stack right now, if any. Test seam. */
export function currentGenerationReceipt(): GenerationReceipt | null {
  return store.getStore()?.receipt ?? null;
}
