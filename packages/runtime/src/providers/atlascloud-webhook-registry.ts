/**
 * In-memory registry for AtlasCloud webhook callbacks.
 *
 * AtlasCloud calls back once a prediction reaches a terminal state
 * (https://atlascloud.ai/docs/en/webhooks). The provider registers the
 * prediction id it got from submit, the signed ingress route
 * (`packages/websocket/src/routes/atlascloud-webhook.ts`) resolves it with the
 * callback's `payload`, and the run continues without polling.
 *
 * Delivery is at-least-once and best effort, so this registry is never the
 * only way a run finishes: `atlasAwaitResult` races it against a slow
 * reconciliation poll of the prediction endpoint.
 */

import { createLogger } from "@nodetool-ai/config";
import type { AtlasPollResult } from "./atlascloud-transport.js";

const log = createLogger("nodetool.runtime.providers.atlascloud-webhook");

/** The wait's own deadline passed with no callback. */
export class AtlasWebhookWaitTimeout extends Error {
  constructor(predictionId: string, timeoutMs: number) {
    super(
      `AtlasCloud webhook not received within ` +
        `${Math.round(timeoutMs / 1000)}s (predictionId: ${predictionId})`
    );
    this.name = "AtlasWebhookWaitTimeout";
  }
}

interface PendingPrediction {
  resolve: (result: AtlasPollResult) => void;
  reject: (error: Error) => void;
}

const pending = new Map<string, PendingPrediction>();

/**
 * Wait for the callback AtlasCloud sends for `predictionId`. Rejects on the
 * provider's own failure callback, on timeout, and on abort.
 */
export function registerAtlasWebhookWait(
  predictionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<AtlasPollResult> {
  return new Promise<AtlasPollResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("Aborted")
      );
      return;
    }

    // Declared before the handlers that call it so every exit from the wait —
    // callback, timeout, abort — drops the timer, the listener and the entry.
    let settle = (): void => undefined;

    const timer = setTimeout(() => {
      settle();
      reject(new AtlasWebhookWaitTimeout(predictionId, timeoutMs));
    }, timeoutMs);

    const onAbort = (): void => {
      settle();
      reject(
        signal?.reason instanceof Error ? signal.reason : new Error("Aborted")
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    settle = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      pending.delete(predictionId);
    };

    pending.set(predictionId, {
      resolve: (result) => {
        settle();
        resolve(result);
      },
      reject: (error) => {
        settle();
        reject(error);
      }
    });

    log.debug("Registered AtlasCloud webhook wait", {
      predictionId,
      timeoutMs
    });
  });
}

/**
 * Called by the ingress route for a success callback. Returns false when this
 * process has no waiter, which is the normal case for a duplicate delivery or
 * for a replica that did not submit the prediction.
 */
export function resolveAtlasWebhook(
  predictionId: string,
  result: AtlasPollResult
): boolean {
  const entry = pending.get(predictionId);
  if (!entry) {
    log.debug("No pending AtlasCloud prediction for callback", {
      predictionId
    });
    return false;
  }
  log.info("AtlasCloud webhook callback received", { predictionId });
  entry.resolve(result);
  return true;
}

/** Called by the ingress route for a failure callback. */
export function rejectAtlasWebhook(
  predictionId: string,
  reason: string
): boolean {
  const entry = pending.get(predictionId);
  if (!entry) return false;
  log.info("AtlasCloud webhook failure callback received", {
    predictionId,
    reason
  });
  entry.reject(
    new Error(
      `AtlasCloud job failed (webhook): ${reason} (predictionId: ${predictionId})`
    )
  );
  return true;
}

export function hasPendingAtlasWebhook(predictionId: string): boolean {
  return pending.has(predictionId);
}

/** Visible for testing. */
export function atlasWebhookPendingCount(): number {
  return pending.size;
}
