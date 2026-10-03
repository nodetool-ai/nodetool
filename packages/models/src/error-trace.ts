/**
 * ErrorTrace — redacted error traces stored in the deployment's own database.
 *
 * Writes go through {@link recordErrorTrace} (this server's own failures) or
 * {@link ingestErrorTraces} (traces another install synced here). Both run
 * {@link redactErrorTrace} first, so nothing reaches the table unscrubbed.
 * Reads are always scoped to one user: the agent capabilities, the tRPC router
 * and the CLI all pass the caller's id.
 *
 * See `schema/error-traces.ts` for the columns and `error-trace-redaction.ts`
 * for what redaction removes.
 */

import { and, asc, desc, eq, gte, inArray, isNull, like, lt, lte } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { errorTraces } from "./schema/error-traces.js";
import {
  type ErrorTraceContext,
  type ErrorTraceInput,
  type ErrorTraceSeverity,
  type ErrorTraceSource,
  redactErrorTrace
} from "./error-trace-redaction.js";

const log = createLogger("nodetool.models.error-trace");

export type ErrorTraceOrigin = "local" | "ingest";

export interface ErrorTraceRow {
  id: string;
  user_id: string | null;
  fingerprint: string;
  source: ErrorTraceSource;
  severity: ErrorTraceSeverity;
  error_type: string | null;
  message: string;
  stack: string | null;
  context: ErrorTraceContext | null;
  app_version: string | null;
  platform: string | null;
  origin: ErrorTraceOrigin;
  synced_at: string | null;
  created_at: string;
}

export interface RecordErrorTraceInput extends ErrorTraceInput {
  userId?: string | null;
  /** Override the timestamp. Defaults to now; tests and ingest use it. */
  createdAt?: string;
}

/** How long a trace is kept before the retention sweep removes it. */
export const DEFAULT_ERROR_TRACE_RETENTION_DAYS = 30;

/** Traces accepted from one sync request. */
export const MAX_ERROR_TRACE_INGEST_BATCH = 100;

// ── Flood control ────────────────────────────────────────────────────

/**
 * A failure inside a hot loop can throw thousands of identical errors a
 * minute. The first few explain it; the rest only fill the table. These caps
 * are per process, per minute.
 */
const MAX_PER_FINGERPRINT_PER_MINUTE = 10;
const MAX_PER_MINUTE = 300;

let windowStart = 0;
let windowTotal = 0;
const windowCounts = new Map<string, number>();

function admit(fingerprint: string, now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowTotal = 0;
    windowCounts.clear();
  }
  const count = windowCounts.get(fingerprint) ?? 0;
  if (count >= MAX_PER_FINGERPRINT_PER_MINUTE || windowTotal >= MAX_PER_MINUTE) {
    return false;
  }
  windowCounts.set(fingerprint, count + 1);
  windowTotal += 1;
  return true;
}

/** Reset the flood-control window. Tests only. */
export function resetErrorTraceRateLimit(): void {
  windowStart = 0;
  windowTotal = 0;
  windowCounts.clear();
}

// ── Rows ─────────────────────────────────────────────────────────────

type StoredRow = typeof errorTraces.$inferSelect;

function toRow(row: StoredRow): ErrorTraceRow {
  return {
    id: row.id,
    user_id: row.user_id ?? null,
    fingerprint: row.fingerprint,
    source: row.source as ErrorTraceSource,
    severity: row.severity as ErrorTraceSeverity,
    error_type: row.error_type ?? null,
    message: row.message,
    stack: row.stack ?? null,
    context: row.context ?? null,
    app_version: row.app_version ?? null,
    platform: row.platform ?? null,
    origin: row.origin as ErrorTraceOrigin,
    synced_at: row.synced_at ?? null,
    created_at: row.created_at
  };
}

function buildRow(
  input: RecordErrorTraceInput,
  origin: ErrorTraceOrigin
): ErrorTraceRow {
  const redacted = redactErrorTrace(input);
  return {
    id: createTimeOrderedUuid(),
    user_id: input.userId ?? null,
    ...redacted,
    origin,
    synced_at: null,
    created_at: input.createdAt ?? new Date().toISOString()
  };
}

// ── Write ────────────────────────────────────────────────────────────

/**
 * Store one redacted trace for an error this process observed.
 *
 * Never throws: it runs inside error handlers, and a trace store that fails
 * the request it is reporting on makes the failure worse. Returns `null` when
 * the trace was dropped by flood control or the write failed.
 */
export async function recordErrorTrace(
  input: RecordErrorTraceInput
): Promise<ErrorTraceRow | null> {
  try {
    const row = buildRow(input, "local");
    if (!admit(row.fingerprint, Date.now())) return null;
    await getDb().insert(errorTraces).values(row);
    return row;
  } catch (error) {
    // Logged, not recorded: recording a failure to record would recurse.
    log.warn("Failed to record error trace", { error: String(error) });
    return null;
  }
}

/**
 * Store traces another install synced to this server, under the
 * authenticated caller's id. The sender's redaction is not trusted: each
 * trace is redacted again here. Returns the number stored.
 */
export async function ingestErrorTraces(
  userId: string,
  traces: readonly (ErrorTraceInput & { createdAt?: string })[]
): Promise<number> {
  if (!userId) throw new Error("ingestErrorTraces requires a user id");
  const batch = traces.slice(0, MAX_ERROR_TRACE_INGEST_BATCH);
  if (batch.length === 0) return 0;
  const now = Date.now();
  const rows = batch.map((trace) => {
    // A client clock in the future would pin a row past the retention sweep.
    const created = trace.createdAt ? Date.parse(trace.createdAt) : NaN;
    const createdAt =
      Number.isFinite(created) && created <= now
        ? new Date(created).toISOString()
        : new Date(now).toISOString();
    return buildRow({ ...trace, userId, createdAt }, "ingest");
  });
  await getDb().insert(errorTraces).values(rows);
  return rows.length;
}

// ── Read ─────────────────────────────────────────────────────────────

export interface ListErrorTracesOptions {
  limit?: number;
  source?: ErrorTraceSource;
  severity?: ErrorTraceSeverity;
  fingerprint?: string;
  /** Inclusive lower bound on `created_at`, ISO-8601. */
  since?: string;
  /** Inclusive upper bound on `created_at`, ISO-8601. */
  until?: string;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_LIST_LIMIT);
}

/** One user's traces, newest first. */
export async function listErrorTraces(
  userId: string,
  opts: ListErrorTracesOptions = {}
): Promise<ErrorTraceRow[]> {
  const conditions = [eq(errorTraces.user_id, userId)];
  if (opts.source) conditions.push(eq(errorTraces.source, opts.source));
  if (opts.severity) conditions.push(eq(errorTraces.severity, opts.severity));
  if (opts.fingerprint) {
    conditions.push(eq(errorTraces.fingerprint, opts.fingerprint));
  }
  if (opts.since) conditions.push(gte(errorTraces.created_at, opts.since));
  if (opts.until) conditions.push(lte(errorTraces.created_at, opts.until));

  const rows = await getDb()
    .select()
    .from(errorTraces)
    .where(and(...conditions))
    .orderBy(desc(errorTraces.created_at), desc(errorTraces.id))
    .limit(clampLimit(opts.limit, DEFAULT_LIST_LIMIT));
  return rows.map(toRow);
}

/** Length of the short id agent-facing output may use. */
const SHORT_ID_LENGTH = 12;

export type GetErrorTraceResult =
  | { ok: true; trace: ErrorTraceRow }
  | { ok: false; reason: "not_found" | "ambiguous" };

/**
 * One of the user's traces by full id, or by the exact 12-character prefix
 * agent output shows. A prefix resolves only when it names exactly one of the
 * caller's traces.
 */
export async function getErrorTrace(
  userId: string,
  id: string
): Promise<GetErrorTraceResult> {
  const trimmed = id.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(trimmed)) return { ok: false, reason: "not_found" };
  const db = getDb();
  if (trimmed.length === SHORT_ID_LENGTH) {
    const rows = await db
      .select()
      .from(errorTraces)
      .where(
        and(
          eq(errorTraces.user_id, userId),
          like(errorTraces.id, `${trimmed}%`)
        )
      )
      .limit(2);
    if (rows.length > 1) return { ok: false, reason: "ambiguous" };
    const [row] = rows;
    return row ? { ok: true, trace: toRow(row) } : { ok: false, reason: "not_found" };
  }
  const [row] = await db
    .select()
    .from(errorTraces)
    .where(and(eq(errorTraces.user_id, userId), eq(errorTraces.id, trimmed)))
    .limit(1);
  return row ? { ok: true, trace: toRow(row) } : { ok: false, reason: "not_found" };
}

export interface ErrorTraceGroup {
  fingerprint: string;
  count: number;
  source: ErrorTraceSource;
  severity: ErrorTraceSeverity;
  error_type: string | null;
  message: string;
  first_seen: string;
  last_seen: string;
  /** The newest trace in the group, for `get_error_trace`. */
  latest_id: string;
}

/** Rows a summary reads. Enough to group a busy week without a full scan. */
const SUMMARY_SCAN_LIMIT = 2000;

/**
 * The user's traces grouped by fingerprint, most recent group first. Grouped
 * in application code over a bounded window so it means the same on both
 * dialects.
 */
export async function summarizeErrorTraces(
  userId: string,
  opts: { since?: string; limit?: number } = {}
): Promise<ErrorTraceGroup[]> {
  const rows = await listErrorTracesForSummary(userId, opts.since);
  const groups = new Map<string, ErrorTraceGroup>();
  for (const row of rows) {
    const group = groups.get(row.fingerprint);
    if (group) {
      group.count += 1;
      group.first_seen = row.created_at;
    } else {
      groups.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        count: 1,
        source: row.source,
        severity: row.severity,
        error_type: row.error_type,
        message: row.message,
        first_seen: row.created_at,
        last_seen: row.created_at,
        latest_id: row.id
      });
    }
  }
  return [...groups.values()].slice(0, clampLimit(opts.limit, 20));
}

async function listErrorTracesForSummary(
  userId: string,
  since: string | undefined
): Promise<ErrorTraceRow[]> {
  const conditions = [eq(errorTraces.user_id, userId)];
  if (since) conditions.push(gte(errorTraces.created_at, since));
  const rows = await getDb()
    .select()
    .from(errorTraces)
    .where(and(...conditions))
    .orderBy(desc(errorTraces.created_at), desc(errorTraces.id))
    .limit(SUMMARY_SCAN_LIMIT);
  return rows.map(toRow);
}

// ── Bug-report export ────────────────────────────────────────────────

function fence(text: string): string {
  // A stack containing ``` would close the block early.
  return "```\n" + text.replace(/```/g, "ʼʼʼ") + "\n```";
}

/**
 * Render traces as a Markdown section to paste into a bug report. Only stored
 * (already redacted) fields are used, and the user id is left out.
 */
export function formatErrorReport(
  traces: readonly ErrorTraceRow[],
  opts: { title?: string; generatedAt?: string } = {}
): string {
  const lines: string[] = [
    `## ${opts.title ?? "NodeTool error report"}`,
    "",
    `Generated ${opts.generatedAt ?? new Date().toISOString()}. ` +
      `${traces.length} trace${traces.length === 1 ? "" : "s"}, redacted before storage.`,
    ""
  ];
  for (const trace of traces) {
    lines.push(
      `### ${trace.error_type ?? "Error"}: ${trace.message.split("\n")[0]}`,
      "",
      `- id: \`${trace.id}\``,
      `- when: ${trace.created_at}`,
      `- source: ${trace.source} (${trace.severity})`,
      `- fingerprint: \`${trace.fingerprint}\``
    );
    if (trace.app_version) lines.push(`- version: ${trace.app_version}`);
    if (trace.platform) lines.push(`- platform: ${trace.platform}`);
    for (const [key, value] of Object.entries(trace.context ?? {})) {
      lines.push(`- ${key}: ${String(value)}`);
    }
    lines.push("");
    if (trace.message.includes("\n")) lines.push(fence(trace.message), "");
    if (trace.stack) lines.push(fence(trace.stack), "");
  }
  return lines.join("\n");
}

// ── Sync bookkeeping ─────────────────────────────────────────────────

/** Locally captured traces not yet pushed, oldest first. */
export async function listUnsyncedErrorTraces(
  limit: number = MAX_ERROR_TRACE_INGEST_BATCH
): Promise<ErrorTraceRow[]> {
  const rows = await getDb()
    .select()
    .from(errorTraces)
    .where(and(eq(errorTraces.origin, "local"), isNull(errorTraces.synced_at)))
    .orderBy(asc(errorTraces.created_at), asc(errorTraces.id))
    .limit(clampLimit(limit, MAX_ERROR_TRACE_INGEST_BATCH));
  return rows.map(toRow);
}

export async function markErrorTracesSynced(
  ids: readonly string[],
  syncedAt: string = new Date().toISOString()
): Promise<void> {
  if (ids.length === 0) return;
  await getDb()
    .update(errorTraces)
    .set({ synced_at: syncedAt })
    .where(inArray(errorTraces.id, [...ids]));
}

// ── Retention ────────────────────────────────────────────────────────

/** Drop traces older than `retentionDays`. Returns the number removed. */
export async function pruneErrorTraces(
  retentionDays: number = DEFAULT_ERROR_TRACE_RETENTION_DAYS
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error(`Invalid retention window: ${retentionDays}`);
  }
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const db = getDb();
  const doomed = await db
    .select({ id: errorTraces.id })
    .from(errorTraces)
    .where(lt(errorTraces.created_at, cutoff));
  if (doomed.length === 0) return 0;
  await db.delete(errorTraces).where(lt(errorTraces.created_at, cutoff));
  return doomed.length;
}
