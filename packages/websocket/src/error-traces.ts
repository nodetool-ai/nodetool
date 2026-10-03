/**
 * Server-side error tracing: capture, retention and opt-in sync.
 *
 * Capture: {@link captureError} turns a thrown value into a redacted row in
 * `nodetool_error_traces` (see `@nodetool-ai/models` `recordErrorTrace`). It
 * is fire-and-forget and never throws, so an error handler can call it
 * without making its own failure worse.
 *
 * Retention: traces older than `NODETOOL_ERROR_TRACE_RETENTION_DAYS` (default
 * 30) are pruned at startup and once a day.
 *
 * Sync: off unless both `NODETOOL_ERROR_TRACE_SYNC_URL` and
 * `NODETOOL_ERROR_TRACE_SYNC_TOKEN` are set. Then locally captured traces are
 * pushed every few minutes to that NodeTool server's `errorTraces.ingest`
 * procedure, authenticated by the access token. The receiving server stores
 * them under the token's user and redacts them again; on the hosted service
 * that database is Supabase. A local install never holds database
 * credentials for the cloud.
 *
 * Capture can be switched off entirely with `NODETOOL_ERROR_TRACES=0`.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  DEFAULT_ERROR_TRACE_RETENTION_DAYS,
  MAX_ERROR_TRACE_INGEST_BATCH,
  describeThrown,
  listUnsyncedErrorTraces,
  markErrorTracesSynced,
  pruneErrorTraces,
  recordErrorTrace,
  type ErrorTraceRow,
  type ErrorTraceSeverity,
  type ErrorTraceSource
} from "@nodetool-ai/models";
import { getVersion } from "./routes/health.js";

const log = createLogger("nodetool.websocket.error-traces");

type Env = Record<string, string | undefined>;

/** False when `NODETOOL_ERROR_TRACES` is `0`, `false` or `off`. */
export function isErrorTracingEnabled(env: Env = process.env): boolean {
  const value = env["NODETOOL_ERROR_TRACES"]?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

export interface CaptureErrorOptions {
  source: ErrorTraceSource;
  userId?: string | null;
  severity?: ErrorTraceSeverity;
  /** Identifiers only; keys outside `ERROR_TRACE_CONTEXT_KEYS` are dropped. */
  context?: Record<string, unknown>;
}

/** Record a redacted trace for `error`. Fire-and-forget; never throws. */
export function captureError(error: unknown, opts: CaptureErrorOptions): void {
  if (!isErrorTracingEnabled()) return;
  try {
    const { errorType, message, stack } = describeThrown(error);
    void recordErrorTrace({
      source: opts.source,
      severity: opts.severity,
      userId: opts.userId ?? null,
      errorType,
      message,
      stack,
      context: { runtime: "node", ...opts.context },
      appVersion: getVersion(),
      platform: process.platform
    });
  } catch (captureFailure) {
    // Capturing must never become a second failure inside an error handler.
    log.warn("Error trace capture failed", { error: String(captureFailure) });
  }
}

// ── Sync ─────────────────────────────────────────────────────────────

export interface ErrorTraceSyncConfig {
  /** Base URL of the receiving NodeTool server, e.g. https://api.nodetool.ai */
  url: string;
  /** A NodeTool access token for the account the traces belong to. */
  token: string;
}

/** The sync target from the environment, or null when sync is off. */
export function errorTraceSyncConfig(env: Env = process.env): ErrorTraceSyncConfig | null {
  const url = env["NODETOOL_ERROR_TRACE_SYNC_URL"]?.trim();
  const token = env["NODETOOL_ERROR_TRACE_SYNC_TOKEN"]?.trim();
  if (!url || !token) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    log.warn("NODETOOL_ERROR_TRACE_SYNC_URL is not a URL; error trace sync is off");
    return null;
  }
  // The token is a bearer credential; plain HTTP would expose it, except to
  // a server on this machine.
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    log.warn("NODETOOL_ERROR_TRACE_SYNC_URL must use https; error trace sync is off");
    return null;
  }
  return { url: parsed.origin, token };
}

function toWire(trace: ErrorTraceRow): Record<string, unknown> {
  return {
    source: trace.source,
    severity: trace.severity,
    error_type: trace.error_type,
    message: trace.message,
    stack: trace.stack,
    context: trace.context,
    app_version: trace.app_version,
    platform: trace.platform,
    created_at: trace.created_at
  };
}

export interface SyncResult {
  pushed: number;
  /** Set when a batch was refused; the traces stay unsynced for a retry. */
  error?: string;
}

/**
 * Push unsynced local traces in batches until none remain or a batch fails.
 * `fetchImpl` is injectable for tests.
 */
export async function syncErrorTraces(
  config: ErrorTraceSyncConfig,
  fetchImpl: typeof fetch = fetch
): Promise<SyncResult> {
  let pushed = 0;
  for (;;) {
    const batch = await listUnsyncedErrorTraces(MAX_ERROR_TRACE_INGEST_BATCH);
    if (batch.length === 0) return { pushed };
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}/trpc/errorTraces.ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`
        },
        body: JSON.stringify({ traces: batch.map(toWire) }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      return { pushed, error: error instanceof Error ? error.message : String(error) };
    }
    if (!response.ok) {
      return { pushed, error: `sync target answered HTTP ${response.status}` };
    }
    await markErrorTracesSynced(batch.map((trace) => trace.id));
    pushed += batch.length;
    if (batch.length < MAX_ERROR_TRACE_INGEST_BATCH) return { pushed };
  }
}

// ── Maintenance loop ─────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function retentionDays(env: Env): number {
  const raw = Number(env["NODETOOL_ERROR_TRACE_RETENTION_DAYS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ERROR_TRACE_RETENTION_DAYS;
}

/** Start pruning, and syncing when configured. Returns a stop function. */
export function startErrorTraceMaintenance(env: Env = process.env): () => void {
  const prune = (): void => {
    void pruneErrorTraces(retentionDays(env))
      .then((removed) => {
        if (removed > 0) log.info("Pruned expired error traces", { removed });
      })
      .catch((error: unknown) => {
        log.warn("Error trace pruning failed", { error: String(error) });
      });
  };
  prune();
  const timers = [setInterval(prune, DAY_MS)];

  const config = errorTraceSyncConfig(env);
  if (config) {
    log.info("Error trace sync is on", { target: config.url });
    let running = false;
    const sync = (): void => {
      if (running) return;
      running = true;
      void syncErrorTraces(config)
        .then((result) => {
          if (result.error) {
            log.warn("Error trace sync stopped early", { ...result });
          } else if (result.pushed > 0) {
            log.info("Synced error traces", { pushed: result.pushed });
          }
        })
        .catch((error: unknown) => {
          log.warn("Error trace sync failed", { error: String(error) });
        })
        .finally(() => {
          running = false;
        });
    };
    timers.push(setInterval(sync, SYNC_INTERVAL_MS));
  }
  for (const timer of timers) timer.unref?.();
  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
