import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, like, sql, type SQL } from "drizzle-orm";
import {
  TRACE_CONTENT_KEYS, isTraceContentKey, TRACE_CONTENT_BYTE_LIMIT, TRACE_EVENT_LIMIT, TRACE_SPAN_LIMIT, TRACE_STRING_LIMIT,
  recombineTraceRecord, runTraceParentSchema, runTraceRegistrationSchema,
  runTraceUpdateSchema, splitTraceRecord,
  type RunTraceParent, type RunTraceRegistration, type RunTraceUpdate,
  type StoredRunTraceUpdate, type TraceRecord
} from "@nodetool-ai/protocol";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDatabase } from "./db.js";
import { collectSecretValues, redactErrorText, redactErrorTrace } from "./error-trace-redaction.js";
import type { runSpans, runTraces } from "./schema/run-traces.js";

type TraceRow = typeof runTraces.$inferSelect;
type SpanRow = typeof runSpans.$inferSelect;
export class RunTraceError extends Error {
  constructor(readonly code: "not_found" | "conflict" | "invalid_input", message: string) {
    super(message); this.name = "RunTraceError";
  }
}
export interface RunTraceSanitizationOptions {
  secretValues?: readonly string[] | ReadonlySet<string>;
  public?: boolean;
  contentSuppressed?: boolean;
}

type SanitizedTraceValue = string | number | boolean | null | SanitizedTraceValue[] | { [key: string]: SanitizedTraceValue };
function sanitizeValue(value: unknown, secrets: readonly string[], depth = 0): SanitizedTraceValue {
  if (typeof value === "string") { return redactErrorText(value, { secretValues: secrets }).slice(0, TRACE_STRING_LIMIT); }
  if (typeof value === "number") { return Number.isFinite(value) ? value : null; }
  if (typeof value === "boolean" || value === null) { return value; }
  if (depth > 10 || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) { return "[omitted]"; }
  if (Array.isArray(value)) { return value.slice(0, 1_000).map((entry) => sanitizeValue(entry, secrets, depth + 1)); }
  if (typeof value === "object" && value !== null) {
    if ("type" in value && value.type === "Buffer") { return "[omitted:media]"; }
    return Object.fromEntries(Object.entries(value).slice(0, 1_000).map(([key, entry]) => [
      redactErrorText(key, { secretValues: secrets }).slice(0, 200),
      /^(?:password|api[_-]?key|authorization|cookie|secret|access[_-]?token|refresh[_-]?token)$/i.test(key)
        ? "[REDACTED:secret]" : sanitizeValue(entry, secrets, depth + 1)
    ]));
  }
  return null;
}
function sanitizeAttributes(attributes: Record<string, unknown>, secrets: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attributes).slice(0, 1_000).map(([key, value]) => [
    !isTraceContentKey(key) || TRACE_CONTENT_KEYS.some((contentKey) => contentKey === key)
      ? key : redactErrorText(key, { secretValues: secrets }).slice(0, 200),
    /^(?:password|api[_-]?key|authorization|cookie|secret|access[_-]?token|refresh[_-]?token)$/i.test(key)
      ? "[REDACTED:secret]" : sanitizeValue(value, secrets)
  ]));
}
function safeSummary(error: string | null | undefined, secrets: readonly string[] = []): string | null {
  return error ? redactErrorTrace({ source: "server", message: error }, { secretValues: secrets }).message : null;
}
/** Sanitize both stored and external span copies before content classification. */
export function sanitizeRunTraceRecord(record: TraceRecord, options: RunTraceSanitizationOptions = {}): TraceRecord {
  const secrets = [...new Set([...collectSecretValues(), ...(options.secretValues ?? [])])].filter((secret) => secret.length > 0);
  const status: TraceRecord["status"] = { code: record.status.code };
  if (record.status.message !== undefined) { status.message = redactErrorText(record.status.message, { secretValues: secrets }).slice(0, TRACE_STRING_LIMIT); }
  const parsed = runTraceUpdateSchema.shape.record.parse({
    ...record,
    name: redactErrorText(record.name, { secretValues: secrets }).slice(0, 200),
    status,
    attributes: sanitizeAttributes(record.attributes, secrets),
    resource: sanitizeAttributes(record.resource, secrets),
    events: record.events.slice(0, 1_000).map((event) => {
      const sanitized = { ...event, name: redactErrorText(event.name, { secretValues: secrets }).slice(0, 200) };
      if (event.attributes) { sanitized.attributes = sanitizeAttributes(event.attributes, secrets); }
      return sanitized;
    })
  });
  const split = splitTraceRecord(parsed);
  if (options.public || options.contentSuppressed) { return split.record; }
  if (Buffer.byteLength(JSON.stringify(split.content)) > TRACE_CONTENT_BYTE_LIMIT) {
    split.record.attributes["nodetool.trace.truncated"] = true; return split.record;
  }
  return recombineTraceRecord(split.record, split.content);
}

function registration(row: TraceRow): RunTraceRegistration { return runTraceRegistrationSchema.parse(row); }
function parentKey(parent: RunTraceParent): string { return `${parent.kind}:${parent.id}`; }
function unionParents(...groups: RunTraceParent[][]): RunTraceParent[] {
  const parents = new Map<string, RunTraceParent>();
  for (const group of groups) { for (const parent of group) { parents.set(parentKey(parent), runTraceParentSchema.parse(parent)); } }
  return [...parents.values()];
}
async function rowsForTrace(traceId: string, userId?: string): Promise<TraceRow[]> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const where = and(eq(t.trace_id, traceId), userId ? eq(t.user_id, userId) : undefined);
  return c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(where) : await c.db.select().from(c.schema.runTraces).where(where);
}
/** Resolve a full run id or a unique exact 12-character prefix inside its owner scope. */
export async function getRunTrace(userId: string, id: string): Promise<RunTraceRegistration | null> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const where = and(eq(t.user_id, userId), /^[0-9a-f]{12}$/.test(id) ? like(t.id, `${id}%`) : eq(t.id, id));
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(where).limit(2) : await c.db.select().from(c.schema.runTraces).where(where).limit(2);
  if (rows.length > 1) { throw new RunTraceError("conflict", "Run prefix is ambiguous"); }
  return rows[0] ? registration(rows[0]) : null;
}
/** Privileged telemetry lookup. Callers must not expose this result without ownership checks. */
export async function getRegisteredTrace(traceId: string): Promise<RunTraceRegistration | null> {
  const rows = await rowsForTrace(traceId); const root = rows.find((row) => row.id === row.canonical_root_id);
  return root ? registration(root) : null;
}
export async function getRegisteredRunTrace(userId: string, traceId: string, runId?: string): Promise<RunTraceRegistration | null> {
  if (runId) { const run = await getRunTrace(userId, runId); return run?.trace_id === traceId ? run : null; }
  const root = await getRegisteredTrace(traceId); return root?.user_id === userId ? root : null;
}
export interface RegisterRunTraceInput {
  id?: string; kind: RunTraceRegistration["kind"]; sourceId: string; traceId?: string;
  parentRunId?: string; origin: RunTraceRegistration["origin"]; parents: RunTraceParent[];
  /** Trusted host supplied an inline graph, rather than loading a saved workflow. */
  inlineWorkflow?: boolean;
}
async function checkSource(userId: string, input: RegisterRunTraceInput): Promise<{ origin?: RunTraceRegistration["origin"]; expired: boolean; parents: RunTraceParent[] }> {
  const c = getDatabase();
  if (input.kind === "app") {
    const t = c.schema.applicationInvocations; const where = and(eq(t.id, input.sourceId), eq(t.user_id, userId));
    const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.applicationInvocations).where(where).limit(1) : await c.db.select().from(c.schema.applicationInvocations).where(where).limit(1);
    const row = rows[0]; if (!row || !row.instance_id) { throw new RunTraceError("not_found", "App run not found"); }
    return { origin: row.origin === "public" ? "public" : undefined, expired: row.content_expired !== 0, parents: [{ kind: "instance", id: row.instance_id }, ...(row.application_id ? [{ kind: "app" as const, id: row.application_id }] : [])] };
  }
  if (input.kind === "workflow") {
    const t = c.schema.jobs; const where = and(eq(t.id, input.sourceId), eq(t.user_id, userId));
    const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.jobs).where(where).limit(1) : await c.db.select().from(c.schema.jobs).where(where).limit(1);
    if (rows.length === 0) { throw new RunTraceError("not_found", "Job not found"); }
    const workflowId = rows[0]?.workflow_id;
    let inlineGraph = input.inlineWorkflow === true;
    if (workflowId && !inlineGraph && input.parentRunId) {
      const parent = await getRunTrace(userId, input.parentRunId);
      if (parent?.kind === "app") {
        const a = c.schema.applicationInvocations;
        const where = and(eq(a.id, parent.source_id), eq(a.user_id, userId));
        const appRows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.applicationInvocations).where(where).limit(1) : await c.db.select().from(c.schema.applicationInvocations).where(where).limit(1);
        const snapshot = appRows[0]?.snapshot;
        inlineGraph = Boolean(snapshot?.workflow_graphs && Object.hasOwn(snapshot.workflow_graphs, workflowId));
      }
    }
    let frozenInline = false;
    if (workflowId && inlineGraph) {
      const w = c.schema.workflows;
      const workflowRows = c.dialect === "sqlite" ? await c.db.select({ id: c.schema.workflows.id }).from(c.schema.workflows).where(eq(w.id, workflowId)).limit(1) : await c.db.select({ id: c.schema.workflows.id }).from(c.schema.workflows).where(eq(w.id, workflowId)).limit(1);
      frozenInline = workflowRows.length === 0;
    }
    return { expired: false, parents: workflowId && !frozenInline ? [{ kind: "workflow", id: workflowId }] : [] };
  } else {
    const t = c.schema.messages; const where = and(eq(t.id, input.sourceId), eq(t.user_id, userId));
    const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.messages).where(where).limit(1) : await c.db.select().from(c.schema.messages).where(where).limit(1);
    if (rows.length === 0) { throw new RunTraceError("not_found", "Message not found"); }
    return { expired: false, parents: rows[0]?.thread_id ? [{ kind: "thread", id: rows[0].thread_id }] : [] };
  }
}
/** Register one persisted app invocation, job, or chat message before tracing its execution. */
export async function registerRunTrace(userId: string, input: RegisterRunTraceInput): Promise<RunTraceRegistration> {
  const source = await checkSource(userId, input); const c = getDatabase(); const t = c.schema.runTraces;
  const existingWhere = and(eq(t.user_id, userId), eq(t.kind, input.kind), eq(t.source_id, input.sourceId));
  const existing = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(existingWhere).limit(1) : await c.db.select().from(c.schema.runTraces).where(existingWhere).limit(1);
  if (existing[0]) {
    if (input.id && input.id !== existing[0].id || input.traceId && input.traceId !== existing[0].trace_id) { throw new RunTraceError("conflict", "Run is already registered under another identity"); }
    return registration(existing[0]);
  }
  const parent = input.parentRunId ? await getRunTrace(userId, input.parentRunId) : null;
  if (input.parentRunId && !parent) { throw new RunTraceError("not_found", "Parent run not found"); }
  if (parent && input.traceId && input.traceId !== parent.trace_id) { throw new RunTraceError("conflict", "Child trace must match its parent"); }
  const traceId = parent?.trace_id ?? input.traceId ?? randomBytes(16).toString("hex");
  if (!/^[0-9a-f]{32}$/.test(traceId) || /^0+$/.test(traceId)) { throw new RunTraceError("invalid_input", "Invalid trace id"); }
  const traceRows = await rowsForTrace(traceId);
  const winner = traceRows.find((row) => row.user_id === userId && row.kind === input.kind && row.source_id === input.sourceId);
  if (winner) {
    if (input.id && input.id !== winner.id || input.traceId && input.traceId !== winner.trace_id) { throw new RunTraceError("conflict", "Run is already registered under another identity"); }
    return registration(winner);
  }
  if (traceRows.some((row) => row.user_id !== userId) || !parent && traceRows.length > 0) { throw new RunTraceError("conflict", "Trace is already registered"); }
  const id = input.id ?? (input.kind === "app" ? input.sourceId : createTimeOrderedUuid());
  if (!/^[0-9a-f]{32}$/.test(id)) { throw new RunTraceError("invalid_input", "Invalid run id"); }
  const root = parent ? traceRows.find((row) => row.id === row.canonical_root_id) : null;
  if (parent && !root) { throw new RunTraceError("not_found", "Parent trace has been deleted"); }
  const parents = unionParents(...traceRows.map((row) => row.parents), input.parents, source.parents, [{ kind: input.kind === "app" ? "app_run" : input.kind === "workflow" ? "job" : "message", id: input.sourceId }]);
  const row: TraceRow = { id, user_id: userId, kind: input.kind, source_id: input.sourceId, parent_run_id: parent?.id ?? null,
    canonical_root_id: root?.id ?? id, trace_id: traceId, root_span_id: null, origin: parent?.origin ?? source.origin ?? input.origin,
    status: "running", started_at: new Date().toISOString(), ended_at: null, cost_usd: null, error: null,
    content_expired: root?.content_expired ?? (source.expired ? 1 : 0), truncated: root?.truncated ?? 0, incomplete: root?.incomplete ?? 0,
    parents, next_cursor: 0, span_count: 0, event_count: 0 };
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const live = tx.select().from(c.schema.runTraces).where(eq(c.schema.runTraces.trace_id, traceId)).all();
      if (parent) {
        const liveRoot = live.find((entry) => entry.id === entry.canonical_root_id);
        if (!liveRoot || !live.some((entry) => entry.id === parent.id)) { throw new RunTraceError("not_found", "Parent trace deleted"); }
        row.content_expired = liveRoot.content_expired; row.incomplete = liveRoot.incomplete; row.truncated = liveRoot.truncated;
      }
      row.parents = unionParents(...live.map((entry) => entry.parents), parents);
      const inserted = tx.insert(c.schema.runTraces).values(row).onConflictDoNothing().returning().get();
      if (!inserted) {
        const winner = tx.select().from(c.schema.runTraces).where(existingWhere).get();
        if (!winner || input.id && winner.id !== input.id || input.traceId && winner.trace_id !== input.traceId) { throw new RunTraceError("conflict", "Run registration identity conflicts"); }
        Object.assign(row, winner); return;
      }
      tx.update(c.schema.runTraces).set({ parents: row.parents }).where(and(eq(c.schema.runTraces.trace_id, traceId), eq(c.schema.runTraces.user_id, userId))).run();
    });
  } else {
    await c.db.transaction(async (tx) => {
      if (root) {
        const [liveRoot] = await tx.select().from(c.schema.runTraces).where(eq(c.schema.runTraces.id, root.id)).for("update");
        if (!liveRoot) { throw new RunTraceError("not_found", "Parent trace deleted"); }
        const live = await tx.select().from(c.schema.runTraces).where(eq(c.schema.runTraces.trace_id, traceId));
        if (!live.some((entry) => entry.id === parent?.id)) { throw new RunTraceError("not_found", "Parent run deleted"); }
        row.content_expired = liveRoot.content_expired; row.incomplete = liveRoot.incomplete; row.truncated = liveRoot.truncated;
        row.parents = unionParents(...live.map((entry) => entry.parents), parents);
      }
      const [inserted] = await tx.insert(c.schema.runTraces).values(row).onConflictDoNothing().returning();
      if (!inserted) {
        const [winner] = await tx.select().from(c.schema.runTraces).where(existingWhere);
        if (!winner || input.id && winner.id !== input.id || input.traceId && winner.trace_id !== input.traceId) { throw new RunTraceError("conflict", "Run registration identity conflicts"); }
        Object.assign(row, winner); return;
      }
      await tx.update(c.schema.runTraces).set({ parents: row.parents }).where(and(eq(c.schema.runTraces.trace_id, traceId), eq(c.schema.runTraces.user_id, userId)));
    });
  }
  return registration(row);
}
export async function setRunTraceRoot(userId: string, id: string, spanId: string): Promise<void> {
  if (!/^[0-9a-f]{16}$/.test(spanId) || /^0+$/.test(spanId)) { throw new RunTraceError("invalid_input", "Invalid span id"); }
  const run = await getRunTrace(userId, id); if (!run) { throw new RunTraceError("not_found", "Run not found"); }
  if (run.root_span_id && run.root_span_id !== spanId) { throw new RunTraceError("conflict", "Execution root already assigned"); }
  const c = getDatabase(); const where = and(eq(c.schema.runTraces.id, run.id), eq(c.schema.runTraces.user_id, userId), isNull(c.schema.runTraces.root_span_id));
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const current = tx.select().from(c.schema.runTraces).where(and(eq(c.schema.runTraces.id, run.id), eq(c.schema.runTraces.user_id, userId))).get();
      if (!current) { throw new RunTraceError("not_found", "Run deleted"); }
      if (current.root_span_id && current.root_span_id !== spanId) { throw new RunTraceError("conflict", "Execution root already assigned"); }
      tx.update(c.schema.runTraces).set({ root_span_id: spanId }).where(where).run();
      if (run.kind === "app") { tx.update(c.schema.applicationInvocations).set({ root_span_id: spanId }).where(and(eq(c.schema.applicationInvocations.id, run.source_id), eq(c.schema.applicationInvocations.user_id, userId), isNotNull(c.schema.applicationInvocations.instance_id))).run(); }
    });
  } else {
    await c.db.transaction(async (tx) => {
      const [current] = await tx.select().from(c.schema.runTraces).where(and(eq(c.schema.runTraces.id, run.id), eq(c.schema.runTraces.user_id, userId))).for("update");
      if (!current) { throw new RunTraceError("not_found", "Run deleted"); }
      if (current.root_span_id && current.root_span_id !== spanId) { throw new RunTraceError("conflict", "Execution root already assigned"); }
      await tx.update(c.schema.runTraces).set({ root_span_id: spanId }).where(where);
      if (run.kind === "app") { await tx.update(c.schema.applicationInvocations).set({ root_span_id: spanId }).where(and(eq(c.schema.applicationInvocations.id, run.source_id), eq(c.schema.applicationInvocations.user_id, userId), isNotNull(c.schema.applicationInvocations.instance_id))); }
    });
  }
}
export async function settleRunTrace(userId: string, id: string, outcome: { status: "completed" | "failed" | "cancelled"; error?: string; costUsd?: number | null; secretValues?: readonly string[] | ReadonlySet<string>; contentSuppressed?: boolean }): Promise<void> {
  const run = await getRunTrace(userId, id); if (!run) { return; }
  if (outcome.costUsd !== undefined && outcome.costUsd !== null && (!Number.isFinite(outcome.costUsd) || outcome.costUsd < 0)) { throw new RunTraceError("invalid_input", "Invalid cost"); }
  if (run.status !== "running" && outcome.costUsd === undefined) { return; }
  const patch: Partial<TraceRow> = {};
  if (run.status === "running") {
    patch.status = outcome.status; patch.ended_at = new Date().toISOString();
    patch.error = run.origin === "public" || outcome.contentSuppressed || run.content_expired !== 0 ? null : safeSummary(outcome.error, [...new Set([...collectSecretValues(), ...(outcome.secretValues ?? [])])]);
  }
  if (outcome.costUsd !== undefined) { patch.cost_usd = outcome.costUsd; }
  const c = getDatabase(); const where = and(eq(c.schema.runTraces.id, run.id), eq(c.schema.runTraces.user_id, userId), eq(c.schema.runTraces.status, run.status));
  if (c.dialect === "sqlite") { await c.db.update(c.schema.runTraces).set(patch).where(where); }
  else { await c.db.update(c.schema.runTraces).set(patch).where(where); }
}
export async function registerRunTraceParent(userId: string, id: string, parent: RunTraceParent): Promise<void> {
  await registerRunTraceParents(userId, id, [parent]);
}
/** Associate copied source records in one union update under the trace lock. */
export async function registerRunTraceParents(userId: string, id: string, parents: RunTraceParent[]): Promise<void> {
  const run = await getRunTrace(userId, id); if (!run) { throw new RunTraceError("not_found", "Run not found"); }
  const c = getDatabase();
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const t = c.schema.runTraces;
      const rows = tx.select().from(t).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId))).all();
      if (!rows.some((row) => row.parent_run_id === null)) { throw new RunTraceError("not_found", "Trace deleted"); }
      tx.update(t).set({ parents: unionParents(...rows.map((row) => row.parents), parents) }).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId))).run();
    });
  } else {
    await c.db.transaction(async (tx) => {
      const t = c.schema.runTraces;
      const root = await tx.select({ id: t.id }).from(t).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId), isNull(t.parent_run_id))).for("update");
      if (root.length === 0) { throw new RunTraceError("not_found", "Trace deleted"); }
      const rows = await tx.select().from(t).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId)));
      await tx.update(t).set({ parents: unionParents(...rows.map((row) => row.parents), parents) }).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId)));
    });
  }
}

function stored(row: SpanRow, root: TraceRow): StoredRunTraceUpdate {
  const record = recombineTraceRecord(row.metadata, row.content_expired || root.content_expired ? null : row.content);
  if (row.error_summary && !record.status.message) { record.status = { ...record.status, message: row.error_summary }; }
  if (root.truncated) { record.attributes["nodetool.trace.truncated"] = true; }
  if (root.incomplete) { record.attributes["nodetool.trace.incomplete"] = true; }
  return { kind: runTraceUpdateSchema.shape.kind.parse(row.update_kind), record, run_id: row.run_id, cursor: row.cursor,
    content_expired: Boolean(row.content_expired || root.content_expired), truncated: Boolean(row.truncated || root.truncated), incomplete: Boolean(row.incomplete || root.incomplete) };
}
function hasCappedValues(value: unknown, depth = 0): boolean {
  if (typeof value === "string") { return value.length > TRACE_STRING_LIMIT; }
  if (Array.isArray(value)) { return value.length > 1_000 || value.some((entry) => hasCappedValues(entry, depth + 1)); }
  if (typeof value === "object" && value !== null) { return depth > 10 || Object.keys(value).length > 1_000 || Object.values(value).some((entry) => hasCappedValues(entry, depth + 1)); }
  return false;
}
interface PlannedWrite { row: SpanRow; nextCursor: number; spanCount: number; eventCount: number; truncated: boolean }
function planWrite(root: TraceRow, existing: SpanRow | undefined, run: TraceRow, update: RunTraceUpdate, options: RunTraceSanitizationOptions & { isRoot?: boolean }): PlannedWrite | null {
  const parsed = runTraceUpdateSchema.parse(update);
  if (parsed.record.trace_id !== run.trace_id) { throw new RunTraceError("invalid_input", "Span trace does not match run"); }
  if (existing && existing.run_id !== run.id) { throw new RunTraceError("conflict", "Span belongs to another run"); }
  if (options.isRoot && run.root_span_id && run.root_span_id !== parsed.record.span_id) { throw new RunTraceError("conflict", "Execution root already assigned"); }
  const isRoot = run.root_span_id === parsed.record.span_id || options.isRoot === true;
  if (!existing && root.span_count >= TRACE_SPAN_LIMIT && !isRoot) { return null; }
  const secrets = [...new Set([...collectSecretValues(), ...(options.secretValues ?? [])])];
  const clean = sanitizeRunTraceRecord(parsed.record, { ...options, public: run.origin === "public", contentSuppressed: options.contentSuppressed || root.content_expired !== 0 });
  const oldRecord = existing ? recombineTraceRecord(existing.metadata, root.content_expired ? null : existing.content) : null;
  const events = new Map(oldRecord?.events.map((event, index) => [event.id ?? `${clean.span_id}:${index}`, event]) ?? []);
  let added = 0; let truncated = Boolean(root.truncated) || clean.attributes["nodetool.trace.truncated"] === true || hasCappedValues(parsed.record); let eventCount = root.event_count;
  for (const [index, event] of clean.events.entries()) {
    const eventId = event.id ?? `${clean.span_id}:${index}`;
    if (!events.has(eventId)) {
      if (eventCount >= TRACE_EVENT_LIMIT) { truncated = true; continue; }
      added++; eventCount++;
    }
    events.set(eventId, { ...event, id: eventId });
  }
  const merged = { ...clean, events: [...events.values()] };
  const split = splitTraceRecord(merged);
  if (root.content_expired || run.origin === "public" || options.contentSuppressed) { split.content = null; }
  const contentTooLarge = split.content !== null && Buffer.byteLength(JSON.stringify(split.content)) > TRACE_CONTENT_BYTE_LIMIT;
  if (contentTooLarge) { split.content = null; truncated = true; }
  const nextCursor = root.next_cursor + 1;
  const row: SpanRow = { id: existing?.id ?? createTimeOrderedUuid(), user_id: run.user_id, run_id: run.id, trace_id: run.trace_id,
    span_id: clean.span_id, cursor: nextCursor, update_kind: existing?.update_kind === "span_ended" ? "span_ended" : parsed.kind,
    metadata: existing?.update_kind === "span_ended" && parsed.kind !== "span_ended" ? { ...split.record, end_time_ms: existing.metadata.end_time_ms, duration_ms: existing.metadata.duration_ms, status: existing.metadata.status } : split.record,
    content: split.content, error_summary: run.origin === "public" || options.contentSuppressed ? null : root.content_expired ? existing?.error_summary ?? null : safeSummary(parsed.record.status.message, secrets) ?? existing?.error_summary ?? null, content_expired: root.content_expired,
    truncated: truncated ? 1 : 0, incomplete: root.incomplete };
  return { row, nextCursor, spanCount: root.span_count + (existing ? 0 : 1), eventCount: root.event_count + added, truncated };
}
function groupedTraceParents(root: TraceRow, run: TraceRow): Map<RunTraceParent["kind"], string[]> {
  const groups = new Map<RunTraceParent["kind"], string[]>();
  const source: RunTraceParent = { kind: run.kind === "app" ? "app_run" : run.kind === "workflow" ? "job" : "message", id: run.source_id };
  for (const parent of unionParents(root.parents, [source])) {
    const ids = groups.get(parent.kind) ?? []; ids.push(parent.id); groups.set(parent.kind, ids);
  }
  return groups;
}
/** Atomically merge and sanitize the latest complete span under its canonical trace lock. */
export async function writeRunTraceUpdate(userId: string, runId: string, update: RunTraceUpdate, options: RunTraceSanitizationOptions & { isRoot?: boolean } = {}): Promise<StoredRunTraceUpdate | null> {
  const run = await getRunTrace(userId, runId); if (!run) { return null; }
  const c = getDatabase();
  if (c.dialect === "sqlite") {
    return c.db.transaction((tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      const current = tx.select().from(t).where(and(eq(t.id, run.id), eq(t.user_id, userId))).get(); if (!current) { return null; }
      const root = tx.select().from(t).where(and(eq(t.id, current.canonical_root_id), eq(t.user_id, userId))).get(); if (!root) { return null; }
      if (!root.content_expired) {
        const tables = { app: c.schema.applications, instance: c.schema.appInstances, app_run: c.schema.applicationInvocations,
          workflow: c.schema.workflows, job: c.schema.jobs, thread: c.schema.threads, message: c.schema.messages };
        let missing = false;
        for (const [kind, ids] of groupedTraceParents(root, current)) {
          const table = tables[kind];
          for (let offset = 0; offset < ids.length; offset += 500) {
            const batch = ids.slice(offset, offset + 500);
            const rows = tx.select({ id: table.id }).from(table).where(and(inArray(table.id, batch), kind === "workflow" ? undefined : eq(table.user_id, userId), kind === "app_run" ? isNotNull(c.schema.applicationInvocations.instance_id) : undefined)).all();
            if (rows.length !== batch.length) { missing = true; break; }
          }
          if (missing) { break; }
        }
        if (missing) {
          root.content_expired = 1; current.content_expired = 1;
          tx.update(t).set({ content_expired: 1 }).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId))).run();
          const expiredSpans = tx.select({ id: s.id }).from(s).where(and(eq(s.trace_id, run.trace_id), eq(s.user_id, userId))).orderBy(asc(s.cursor)).all();
          for (let offset = 0; offset < expiredSpans.length; offset += 200) {
            const batch = expiredSpans.slice(offset, offset + 200);
            const cases = batch.map((row, index) => sql`when ${row.id} then CAST(${root.next_cursor + offset + index + 1} AS integer)`);
            tx.update(s).set({ content: null, content_expired: 1, cursor: sql`case ${s.id} ${sql.join(cases, sql` `)} end` }).where(inArray(s.id, batch.map((row) => row.id))).run();
          }
          root.next_cursor += expiredSpans.length;
          tx.update(t).set({ next_cursor: root.next_cursor }).where(eq(t.id, root.id)).run();
          const apps = root.parents.filter((parent) => parent.kind === "app_run").map((parent) => parent.id);
          if (apps.length > 0) { tx.update(c.schema.applicationInvocations).set({ snapshot: null, inputs: null, outputs: null, documents: null, content_expired: 1 }).where(and(eq(c.schema.applicationInvocations.user_id, userId), inArray(c.schema.applicationInvocations.id, apps))).run(); }
        }
      }
      const existing = tx.select().from(s).where(and(eq(s.trace_id, run.trace_id), eq(s.span_id, update.record.span_id))).get();
      const planned = planWrite(root, existing, current, update, options);
      if (!planned) { tx.update(t).set({ truncated: 1 }).where(eq(t.trace_id, run.trace_id)).run(); return null; }
      if (options.isRoot && !current.root_span_id) {
        tx.update(t).set({ root_span_id: update.record.span_id }).where(eq(t.id, current.id)).run();
        if (current.kind === "app") { tx.update(c.schema.applicationInvocations).set({ root_span_id: update.record.span_id }).where(and(eq(c.schema.applicationInvocations.id, current.source_id), eq(c.schema.applicationInvocations.user_id, userId), isNotNull(c.schema.applicationInvocations.instance_id))).run(); }
      }
      tx.insert(s).values(planned.row).onConflictDoUpdate({ target: [s.trace_id, s.span_id], set: planned.row }).run();
      tx.update(t).set({ next_cursor: planned.nextCursor, span_count: planned.spanCount, event_count: planned.eventCount, truncated: planned.truncated ? 1 : 0 }).where(eq(t.id, root.id)).run();
      return stored(planned.row, { ...root, truncated: planned.truncated ? 1 : 0 });
    });
  }
  return c.db.transaction(async (tx) => {
    const t = c.schema.runTraces; const s = c.schema.runSpans;
    const [root] = await tx.select().from(t).where(and(eq(t.trace_id, run.trace_id), isNull(t.parent_run_id))).for("update");
    if (!root) { return null; }
    const [current] = await tx.select().from(t).where(and(eq(t.id, run.id), eq(t.user_id, userId))); if (!current) { return null; }
    if (!root.content_expired) {
      const tables = { app: c.schema.applications, instance: c.schema.appInstances, app_run: c.schema.applicationInvocations,
        workflow: c.schema.workflows, job: c.schema.jobs, thread: c.schema.threads, message: c.schema.messages };
      let missing = false;
      for (const [kind, ids] of groupedTraceParents(root, current)) {
        const table = tables[kind];
        for (let offset = 0; offset < ids.length; offset += 500) {
          const batch = ids.slice(offset, offset + 500);
          const rows = await tx.select({ id: table.id }).from(table).where(and(inArray(table.id, batch), kind === "workflow" ? undefined : eq(table.user_id, userId), kind === "app_run" ? isNotNull(c.schema.applicationInvocations.instance_id) : undefined)).for("key share");
          if (rows.length !== batch.length) { missing = true; break; }
        }
        if (missing) { break; }
      }
      if (missing) {
        root.content_expired = 1; current.content_expired = 1;
        await tx.update(t).set({ content_expired: 1 }).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId)));
        const expiredSpans = await tx.select({ id: s.id }).from(s).where(and(eq(s.trace_id, run.trace_id), eq(s.user_id, userId))).orderBy(asc(s.cursor));
        for (let offset = 0; offset < expiredSpans.length; offset += 200) {
          const batch = expiredSpans.slice(offset, offset + 200);
          const cases = batch.map((row, index) => sql`when ${row.id} then CAST(${root.next_cursor + offset + index + 1} AS integer)`);
          await tx.update(s).set({ content: null, content_expired: 1, cursor: sql`case ${s.id} ${sql.join(cases, sql` `)} end` }).where(inArray(s.id, batch.map((row) => row.id)));
        }
        root.next_cursor += expiredSpans.length;
        await tx.update(t).set({ next_cursor: root.next_cursor }).where(eq(t.id, root.id));
        const apps = root.parents.filter((parent) => parent.kind === "app_run").map((parent) => parent.id);
        if (apps.length > 0) { await tx.update(c.schema.applicationInvocations).set({ snapshot: null, inputs: null, outputs: null, documents: null, content_expired: 1 }).where(and(eq(c.schema.applicationInvocations.user_id, userId), inArray(c.schema.applicationInvocations.id, apps))); }
      }
    }
    const [existing] = await tx.select().from(s).where(and(eq(s.trace_id, run.trace_id), eq(s.span_id, update.record.span_id)));
    const planned = planWrite(root, existing, current, update, options);
    if (!planned) { await tx.update(t).set({ truncated: 1 }).where(eq(t.trace_id, run.trace_id)); return null; }
    if (options.isRoot && !current.root_span_id) {
      await tx.update(t).set({ root_span_id: update.record.span_id }).where(eq(t.id, current.id));
      if (current.kind === "app") { await tx.update(c.schema.applicationInvocations).set({ root_span_id: update.record.span_id }).where(and(eq(c.schema.applicationInvocations.id, current.source_id), eq(c.schema.applicationInvocations.user_id, userId), isNotNull(c.schema.applicationInvocations.instance_id))); }
    }
    await tx.insert(s).values(planned.row).onConflictDoUpdate({ target: [s.trace_id, s.span_id], set: planned.row });
    await tx.update(t).set({ next_cursor: planned.nextCursor, span_count: planned.spanCount, event_count: planned.eventCount, truncated: planned.truncated ? 1 : 0 }).where(eq(t.id, root.id));
    return stored(planned.row, { ...root, truncated: planned.truncated ? 1 : 0 });
  });
}
/** Coalesced replay returns complete latest spans, never stale content-bearing updates. */
export async function listRunTraceRecords(userId: string, id: string, options: { cursor?: number; limit?: number } = {}): Promise<{ records: StoredRunTraceUpdate[]; cursor: number; resnapshot: true }> {
  const run = await getRunTrace(userId, id); if (!run) { throw new RunTraceError("not_found", "Run not found"); }
  const root = (await rowsForTrace(run.trace_id, userId)).find((row) => row.id === row.canonical_root_id);
  if (!root) { throw new RunTraceError("not_found", "Trace not found"); }
  const c = getDatabase(); const s = c.schema.runSpans; const cursor = options.cursor ?? 0;
  if (!Number.isInteger(cursor) || cursor < 0) { throw new RunTraceError("invalid_input", "Invalid cursor"); }
  const where = and(eq(s.user_id, userId), eq(s.trace_id, run.trace_id), gt(s.cursor, cursor));
  const limit = Math.min(TRACE_SPAN_LIMIT + 1, Math.max(1, options.limit ?? 200));
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runSpans).where(where).orderBy(asc(s.cursor)).limit(limit) : await c.db.select().from(c.schema.runSpans).where(where).orderBy(asc(s.cursor)).limit(limit);
  return { records: rows.map((row) => stored(row, root)), cursor: rows.at(-1)?.cursor ?? cursor, resnapshot: true };
}
export async function markRunTraceIncomplete(userId: string, traceId: string, _reason: string): Promise<void> {
  const c = getDatabase(); const t = c.schema.runTraces; const where = and(eq(t.user_id, userId), eq(t.trace_id, traceId));
  if (c.dialect === "sqlite") { await c.db.update(c.schema.runTraces).set({ incomplete: 1 }).where(where); }
  else { await c.db.update(c.schema.runTraces).set({ incomplete: 1 }).where(where); }
}

async function expireTrace(traceId: string, userId: string): Promise<void> {
  const c = getDatabase();
  const patch = { content_expired: 1 };
  const appPatch = { snapshot: null, inputs: null, outputs: null, documents: null, content_expired: 1 };
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      const root = tx.select().from(t).where(and(eq(t.trace_id, traceId), eq(t.user_id, userId), isNull(t.parent_run_id))).get();
      if (!root) { return; }
      tx.update(t).set(patch).where(and(eq(t.trace_id, traceId), eq(t.user_id, userId))).run();
      const spans = tx.select({ id: s.id }).from(s).where(and(eq(s.trace_id, traceId), eq(s.user_id, userId))).orderBy(asc(s.cursor)).all();
      for (let offset = 0; offset < spans.length; offset += 200) {
        const batch = spans.slice(offset, offset + 200);
        const cases = batch.map((row, index) => sql`when ${row.id} then CAST(${root.next_cursor + offset + index + 1} AS integer)`);
        tx.update(s).set({ content: null, content_expired: 1, cursor: sql`case ${s.id} ${sql.join(cases, sql` `)} end` }).where(inArray(s.id, batch.map((row) => row.id))).run();
      }
      tx.update(t).set({ next_cursor: root.next_cursor + spans.length }).where(eq(t.id, root.id)).run();
      const runIds = tx.select({ source: t.source_id }).from(t).where(and(eq(t.trace_id, traceId), eq(t.kind, "app"), eq(t.user_id, userId))).all().map((row) => row.source);
      if (runIds.length > 0) { tx.update(c.schema.applicationInvocations).set(appPatch).where(and(eq(c.schema.applicationInvocations.user_id, userId), inArray(c.schema.applicationInvocations.id, runIds))).run(); }
    });
  } else {
    await c.db.transaction(async (tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      const [root] = await tx.select().from(t).where(and(eq(t.trace_id, traceId), eq(t.user_id, userId), isNull(t.parent_run_id))).for("update");
      if (!root) { return; }
      await tx.update(t).set(patch).where(and(eq(t.trace_id, traceId), eq(t.user_id, userId)));
      const spans = await tx.select({ id: s.id }).from(s).where(and(eq(s.trace_id, traceId), eq(s.user_id, userId))).orderBy(asc(s.cursor));
      for (let offset = 0; offset < spans.length; offset += 200) {
        const batch = spans.slice(offset, offset + 200);
        const cases = batch.map((row, index) => sql`when ${row.id} then CAST(${root.next_cursor + offset + index + 1} AS integer)`);
        await tx.update(s).set({ content: null, content_expired: 1, cursor: sql`case ${s.id} ${sql.join(cases, sql` `)} end` }).where(inArray(s.id, batch.map((row) => row.id)));
      }
      await tx.update(t).set({ next_cursor: root.next_cursor + spans.length }).where(eq(t.id, root.id));
      const runIds = (await tx.select({ source: t.source_id }).from(t).where(and(eq(t.trace_id, traceId), eq(t.kind, "app"), eq(t.user_id, userId)))).map((row) => row.source);
      if (runIds.length > 0) { await tx.update(c.schema.applicationInvocations).set(appPatch).where(and(eq(c.schema.applicationInvocations.user_id, userId), inArray(c.schema.applicationInvocations.id, runIds))); }
    });
  }
}
function parentCondition(parent: RunTraceParent): SQL {
  const c = getDatabase(); const t = c.schema.runTraces;
  return c.dialect === "sqlite"
    ? sql`EXISTS (SELECT 1 FROM json_each(${t.parents}) AS p WHERE json_extract(p.value, '$.kind') = ${parent.kind} AND json_extract(p.value, '$.id') = ${parent.id})`
    : sql`${t.parents}::jsonb @> ${JSON.stringify([parent])}::jsonb`;
}
/** Expire every attributable copy in an owner's enclosing traces before deleting a parent. */
export async function eraseRunTraceParentContent(userId: string, parent: RunTraceParent): Promise<void> {
  const c = getDatabase(); const where = and(eq(c.schema.runTraces.user_id, userId), parentCondition(parent));
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(where) : await c.db.select().from(c.schema.runTraces).where(where);
  const ids = new Set(rows.filter((row) => row.parents.some((entry) => parentKey(entry) === parentKey(parent))).map((row) => row.trace_id));
  for (const traceId of ids) { await expireTrace(traceId, userId); }
}
/** Internal deletion hook, called after a model loads its own resource and authorizes deletion. */
export async function eraseRunTraceParentForModelDeletion(parent: RunTraceParent): Promise<void> {
  const c = getDatabase();
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(parentCondition(parent)) : await c.db.select().from(c.schema.runTraces).where(parentCondition(parent));
  const matched = rows.filter((row) => row.parents.some((entry) => parentKey(entry) === parentKey(parent)));
  const traces = new Map(matched.map((row) => [row.trace_id, row.user_id]));
  for (const [traceId, userId] of traces) { await expireTrace(traceId, userId); }
}
/** Remove one directory record and its spans, preventing late updates from restoring it. */
export async function deleteRunTrace(userId: string, id: string): Promise<boolean> {
  const run = await getRunTrace(userId, id); if (!run) { return false; }
  await expireTrace(run.trace_id, userId);
  const c = getDatabase();
  if (c.dialect === "sqlite") {
    c.db.transaction((tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      const row = tx.select().from(t).where(and(eq(t.id, run.id), eq(t.user_id, userId))).get(); if (!row) { return; }
      const root = row.canonical_root_id === row.id;
      tx.delete(s).where(and(eq(s.user_id, userId), root ? eq(s.trace_id, run.trace_id) : eq(s.run_id, run.id))).run();
      tx.delete(t).where(and(eq(t.user_id, userId), root ? eq(t.trace_id, run.trace_id) : eq(t.id, run.id))).run();
    });
  } else {
    await c.db.transaction(async (tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      const [rootRow] = await tx.select().from(t).where(and(eq(t.trace_id, run.trace_id), eq(t.user_id, userId), isNull(t.parent_run_id))).for("update"); if (!rootRow) { return; }
      const root = rootRow.id === run.id;
      await tx.delete(s).where(and(eq(s.user_id, userId), root ? eq(s.trace_id, run.trace_id) : eq(s.run_id, run.id)));
      await tx.delete(t).where(and(eq(t.user_id, userId), root ? eq(t.trace_id, run.trace_id) : eq(t.id, run.id)));
    });
  }
  return true;
}
/** Apply the content horizon independently of the terminal run-record horizon. */
export async function pruneRunTraces(userId: string, contentCutoff: string, recordCutoff: string): Promise<void> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const condition = eq(t.user_id, userId);
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(condition) : await c.db.select().from(c.schema.runTraces).where(condition);
  const expired = new Set(rows.filter((row) => row.started_at < contentCutoff && !row.content_expired).map((row) => row.trace_id));
  for (const traceId of expired) { await expireTrace(traceId, userId); }
  for (const row of rows.filter((entry) => entry.status !== "running" && entry.ended_at && entry.ended_at < recordCutoff)) { await deleteRunTrace(userId, row.id); }
}

/** Privileged retention enumeration, never exposed to owner-facing readers. */
export async function listRunTraceOwners(): Promise<string[]> {
  const c = getDatabase();
  const rows = c.dialect === "sqlite"
    ? await c.db.selectDistinct({ user_id: c.schema.runTraces.user_id }).from(c.schema.runTraces)
    : await c.db.selectDistinct({ user_id: c.schema.runTraces.user_id }).from(c.schema.runTraces);
  return rows.map((row) => row.user_id);
}

/** Internal portability read with an explicitly narrowed dialect. */
export async function exportRunTraceTable(userId: string, kind: "spans" | "traces", limit: number): Promise<readonly Record<string, unknown>[]> {
  const c = getDatabase();
  if (c.dialect === "sqlite") {
    return kind === "spans" ? await c.db.select().from(c.schema.runSpans).where(eq(c.schema.runSpans.user_id, userId)).limit(limit)
      : await c.db.select().from(c.schema.runTraces).where(eq(c.schema.runTraces.user_id, userId)).limit(limit);
  }
  return kind === "spans" ? await c.db.select().from(c.schema.runSpans).where(eq(c.schema.runSpans.user_id, userId)).limit(limit)
    : await c.db.select().from(c.schema.runTraces).where(eq(c.schema.runTraces.user_id, userId)).limit(limit);
}
/** Internal account-erasure step. Directory removal also catches any metadata written between steps. */
export async function eraseRunTraceTable(userId: string, kind: "spans" | "traces"): Promise<number> {
  const c = getDatabase();
  if (c.dialect === "sqlite") {
    return c.db.transaction((tx) => {
      const t = c.schema.runTraces; const s = c.schema.runSpans;
      tx.update(t).set({ content_expired: 1 }).where(eq(t.user_id, userId)).run();
      const counted = kind === "spans" ? tx.select({ id: s.id }).from(s).where(eq(s.user_id, userId)).all()
        : tx.select({ id: t.id }).from(t).where(eq(t.user_id, userId)).all();
      tx.delete(s).where(eq(s.user_id, userId)).run();
      if (kind === "traces") { tx.delete(t).where(eq(t.user_id, userId)).run(); }
      return counted.length;
    });
  }
  return c.db.transaction(async (tx) => {
    const t = c.schema.runTraces; const s = c.schema.runSpans;
    await tx.select({ id: t.id }).from(t).where(and(eq(t.user_id, userId), isNull(t.parent_run_id))).for("update");
    await tx.update(t).set({ content_expired: 1 }).where(eq(t.user_id, userId));
    const counted = kind === "spans" ? await tx.select({ id: s.id }).from(s).where(eq(s.user_id, userId))
      : await tx.select({ id: t.id }).from(t).where(eq(t.user_id, userId));
    await tx.delete(s).where(eq(s.user_id, userId));
    if (kind === "traces") { await tx.delete(t).where(eq(t.user_id, userId)); }
    return counted.length;
  });
}
