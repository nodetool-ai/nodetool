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
import { missingRuntimeDetailsOf, RUNTIME_NPM_PACKAGES, type StoredRunTraceUpdate } from "@nodetool-ai/protocol";
import { safeProcessEnv } from "@nodetool-ai/config";

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

/** Publish only records already committed and sanitized by the run store. */
export function publishCommittedRunTraceUpdate(userId: string, update: StoredRunTraceUpdate): void {
  for (const listener of listeners) {
    try { listener(userId, update); }
    catch { /* A disconnected reader cannot fail durable recording. */ }
  }
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
      publishCommittedRunTraceUpdate(registration.user_id, committed);
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

function hasExplicitTraceSink(): boolean {
  const env = safeProcessEnv();
  return Boolean(env["TRACELOOP_API_KEY"] || env["OTEL_EXPORTER_OTLP_ENDPOINT"] || env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] || env["NODETOOL_TRACE_FILE"])
    || env["OTEL_TRACES_EXPORTER"] === "console"
    || ["pretty", "json", "1", "true"].some((value) => env["NODETOOL_TRACE_STDOUT"] === value);
}

function isAbsentTracingPeer(error: unknown): boolean {
  const details = missingRuntimeDetailsOf(error);
  if (details?.runtimePackage !== "tracing" || !RUNTIME_NPM_PACKAGES.tracing.packageNames.some((name) => name === details.missing)) {
    return false;
  }
  if (!(error instanceof Error) || !(error.cause instanceof Error) || !("code" in error.cause)) {
    return false;
  }
  const cause = error.cause;
  return (cause.code === "ERR_MODULE_NOT_FOUND" && cause.message.startsWith(`Cannot find package '${details.missing}'`))
    || (cause.code === "MODULE_NOT_FOUND" && cause.message.startsWith(`Cannot find module '${details.missing}'`));
}

/** Enable durable tracing when installed, while keeping core execution available without it. */
export async function ensureRunTraceTelemetry(): Promise<void> {
  if (!configured) {
    configureRunTraceStore(adapter);
    configured = true;
  }
  try {
    await initTelemetry();
  } catch (error) {
    // An absent optional peer disables automatic recording. Explicit sinks and broken installs still fail.
    if (hasExplicitTraceSink() || !isAbsentTracingPeer(error)) {
      throw error;
    }
  }
}
