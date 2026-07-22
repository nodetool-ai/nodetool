/**
 * In-memory registry for KIE webhook callbacks. When `KIE_WEBHOOK_URL` is
 * configured, task submissions include a real `callBackUrl`. This registry
 * bridges the HTTP callback handler and the async task-wait code: the provider
 * registers a pending task, the webhook endpoint resolves it.
 */

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.kie-webhook");

interface PendingTask {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingTask>();

/**
 * Register a task and return a promise that resolves when the webhook fires.
 * Rejects on timeout or abort.
 */
export function registerWebhookWait(
  taskId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("Aborted")
      );
      return;
    }

    const cleanup = (): void => {
      pending.delete(taskId);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Webhook callback not received for task ${taskId} within ${Math.round(timeoutMs / 1000)}s. ` +
            "The job may still complete on KIE — check the KIE dashboard. " +
            "Verify that KIE_WEBHOOK_URL is reachable from the internet."
        )
      );
    }, timeoutMs);

    const onAbort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Aborted")
      );
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    pending.set(taskId, {
      resolve: (data: unknown) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        cleanup();
        resolve(data);
      },
      reject: (err: Error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        cleanup();
        reject(err);
      },
      timer
    });

    log.debug("Registered webhook wait", { taskId, timeoutMs });
  });
}

/**
 * Called by the webhook HTTP handler when KIE posts a callback.
 * Returns true if a pending task was found and resolved.
 */
export function resolveWebhook(taskId: string, data?: unknown): boolean {
  const entry = pending.get(taskId);
  if (!entry) {
    log.debug("No pending task for webhook callback", { taskId });
    return false;
  }
  log.info("Webhook callback received", { taskId });
  entry.resolve(data);
  return true;
}

/**
 * Called by the webhook HTTP handler when KIE posts a failure callback.
 */
export function rejectWebhook(taskId: string, reason: string): boolean {
  const entry = pending.get(taskId);
  if (!entry) return false;
  log.info("Webhook failure callback received", { taskId, reason });
  entry.reject(new Error(`KIE task failed (webhook): ${reason} (taskId: ${taskId})`));
  return true;
}

export function hasPendingWebhook(taskId: string): boolean {
  return pending.has(taskId);
}

/** Visible for testing. */
export function pendingCount(): number {
  return pending.size;
}
