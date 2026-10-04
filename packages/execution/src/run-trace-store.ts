import {
  getRegisteredTrace,
  getRunTrace,
  markRunTraceIncomplete,
  sanitizeRunTraceRecord,
  writeRunTraceUpdate
} from "@nodetool-ai/models";
import {
  configureRunTraceStore,
  initTelemetry,
  type RunTraceStore
} from "@nodetool-ai/runtime";
import type { StoredRunTraceUpdate } from "@nodetool-ai/protocol";

export type RunTraceUpdateListener = (
  userId: string,
  update: StoredRunTraceUpdate
) => void;

const listeners = new Set<RunTraceUpdateListener>();
let configured = false;

/** Subscribe to committed, sanitized snapshots. Transport hosts still enforce ownership. */
export function subscribeRunTraceUpdates(listener: RunTraceUpdateListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const adapter: RunTraceStore = {
  lookup: getRegisteredTrace,
  sanitize: sanitizeRunTraceRecord,
  async write(updates) {
    for (const write of updates) {
      const registration = write.userId && write.runId
        ? await getRunTrace(write.userId, write.runId)
        : await getRegisteredTrace(write.update.record.trace_id);
      if (!registration || registration.trace_id !== write.update.record.trace_id) {
        continue;
      }
      const committed = await writeRunTraceUpdate(
        registration.user_id,
        registration.id,
        write.update,
        {
          secretValues: write.secretValues,
          contentSuppressed: write.contentSuppressed,
          isRoot: write.isRoot
        }
      );
      if (!committed) { continue; }
      for (const listener of listeners) {
        try { listener(registration.user_id, committed); }
        catch { /* A disconnected reader cannot fail durable recording. */ }
      }
    }
  },
  async markIncomplete(traceId, reason) {
    const registration = await getRegisteredTrace(traceId);
    if (registration) {
      await markRunTraceIncomplete(registration.user_id, traceId, reason);
    }
  },
  async flush() { /* Writes are awaited by the processor before this hook. */ }
};

/** Install the database bridge even if an external sink initialized telemetry first. */
export async function ensureRunTraceTelemetry(): Promise<void> {
  if (!configured) {
    configureRunTraceStore(adapter);
    configured = true;
  }
  await initTelemetry();
}
