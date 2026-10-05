import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  TRACE_RESTRICTED_CAPABILITY_MODULES, RUN_SUMMARY_SPAN_LIMIT, RUN_READER_STRING_LIMIT, RUN_READER_CONTENT_LIMIT,
  recombineTraceRecord, runListOptionsSchema, runGetOptionsSchema, runTraceOptionsSchema, runLogsOptionsSchema, runAwaitOptionsSchema, runUpdatesOptionsSchema,
  type RunListOptions, type RunGetOptions, type RunTraceOptions, type RunLogsOptions, type RunAwaitOptions, type RunUpdatesOptions,
  type GetRunResult, type ListRunsResult, type GetRunTraceResult, type GetRunLogsResult, type RunUpdatesResult,
  type RunReaderFlags, type RunTraceRegistration, type TraceRecord, type RunLog
} from "@nodetool-ai/protocol";
import {
  resolveRunReader, findRunReaderSource, queryRunReaders, queryRunReaderSpans, queryRunReaderGenerationIds, queryRunReaderDocuments, queryRunReaderAppMetadata, queryRunReaderAppContent, queryRunReaderAppContentPresent, queryRunReaderGenerationCosts, encodeRunListCursor,
  RunTraceError, type RunReaderSpan
} from "@nodetool-ai/models";

export class RunsError extends Error {
  constructor(readonly code: "not_found" | "ambiguous" | "invalid_input" | "timeout" | "aborted", message: string) {
    super(message); this.name = "RunsError";
  }
}
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) { throw new RunsError("invalid_input", result.error.message); }
  return result.data;
}
async function modelRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (error instanceof RunTraceError) { throw new RunsError(error.code === "conflict" ? "ambiguous" : error.code, error.message); }
    throw error;
  }
}
async function resolve(userId: string, id: string): Promise<RunTraceRegistration> {
  const run = await modelRead(() => resolveRunReader(userId, id));
  if (!run) { throw new RunsError("not_found", "Run not found"); }
  return run;
}
export async function findRunForSource(userId: string, kind: RunTraceRegistration["kind"], sourceId: string): Promise<RunTraceRegistration | null> {
  return modelRead(() => findRunReaderSource(userId, kind, sourceId));
}
function publicRunRecord(run: RunTraceRegistration): GetRunResult["run"] {
  return { ...run, error: run.error?.slice(0, 500) ?? null, parents: run.parents.slice(0, 20), parents_limited: run.parents.length > 20 };
}
export async function listRuns(userId: string, options: RunListOptions = {}): Promise<ListRunsResult> {
  const parsed = validate(runListOptionsSchema, options);
  if (parsed.since && parsed.until && parsed.since > parsed.until) { throw new RunsError("invalid_input", "since must precede until"); }
  const rows = await modelRead(() => queryRunReaders(userId, parsed)); const runs = rows.slice(0, parsed.limit);
  const last = runs.at(-1);
  return { runs: runs.map((run) => ({ ...publicRunRecord(run), ...(run.app ? { app: run.app } : {}) })), next_cursor: rows.length > parsed.limit && last ? encodeRunListCursor(last) : null };
}
function compareSpans(a: RunReaderSpan, b: RunReaderSpan): number {
  return a.metadata.start_time_ms - b.metadata.start_time_ms || a.span_id.localeCompare(b.span_id);
}
interface SpanTree {
  ordered: Array<{ row: RunReaderSpan; depth: number }>;
  byId: Map<string, RunReaderSpan>;
  children: Map<string, RunReaderSpan[]>;
  incomplete: boolean;
}
/** Iterative traversal visits each span once, including disconnected and cyclic components. */
function spanTree(rows: RunReaderSpan[]): SpanTree {
  const sorted = [...rows].sort(compareSpans); const byId = new Map(sorted.map((row) => [row.span_id, row]));
  const children = new Map<string, RunReaderSpan[]>(); const roots: RunReaderSpan[] = []; let incomplete = false;
  for (const row of sorted) {
    const parent = row.metadata.parent_span_id;
    if (parent && byId.has(parent) && parent !== row.span_id) {
      const siblings = children.get(parent) ?? []; siblings.push(row); children.set(parent, siblings);
    } else { roots.push(row); if (parent) { incomplete = true; } }
  }
  const seen = new Set<string>(); const ordered: Array<{ row: RunReaderSpan; depth: number }> = [];
  const visit = (root: RunReaderSpan): void => {
    const queue = [{ row: root, depth: 0 }];
    for (let index = 0; index < queue.length; index++) {
      const entry = queue[index]; if (!entry || seen.has(entry.row.span_id)) { continue; }
      seen.add(entry.row.span_id); ordered.push(entry);
      for (const child of children.get(entry.row.span_id) ?? []) { queue.push({ row: child, depth: entry.depth + 1 }); }
    }
  };
  for (const root of roots) { visit(root); }
  for (const row of sorted) { if (!seen.has(row.span_id)) { incomplete = true; visit(row); } }
  return { ordered, byId, children, incomplete };
}
function scopedRows(run: RunTraceRegistration, rows: RunReaderSpan[]): RunReaderSpan[] {
  if (!run.parent_run_id) { return rows; }
  if (!run.root_span_id) { return rows.filter((row) => row.run_id === run.id); }
  const tree = spanTree(rows); const allowed = new Set<string>(); const queue = [run.root_span_id];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]; if (!id || allowed.has(id)) { continue; }
    allowed.add(id); for (const child of tree.children.get(id) ?? []) { queue.push(child.span_id); }
  }
  return rows.filter((row) => allowed.has(row.span_id));
}
function flags(run: RunTraceRegistration, rows: RunReaderSpan[], incomplete = false): RunReaderFlags {
  const expired = Boolean(run.content_expired || rows.some((row) => row.content_expired));
  const suppressed = rows.some((row) => TRACE_RESTRICTED_CAPABILITY_MODULES.some((module) => row.metadata.attributes["tool.module"] === module || row.metadata.attributes["capability.module"] === module));
  return { content_state: run.origin === "public" ? "public" : expired ? "expired" : rows.some((row) => row.has_content) ? "available" : suppressed ? "suppressed" : "absent",
    content_expired: expired, truncated: Boolean(run.truncated || rows.some((row) => row.truncated)), incomplete: Boolean(run.incomplete || incomplete || rows.some((row) => row.incomplete)) };
}
function spanSummary(row: RunReaderSpan): GetRunResult["summary"]["failure_path"][number] {
  return { span_id: row.span_id, parent_span_id: row.metadata.parent_span_id, name: row.metadata.name, status: row.metadata.status.code,
    duration_ms: row.metadata.duration_ms, error: row.error_summary?.slice(0, 500) ?? null };
}
export async function getRun(userId: string, id: string, options: RunGetOptions = {}): Promise<GetRunResult> {
  const parsed = validate(runGetOptionsSchema, options);
  const run = await resolve(userId, id); const all = await queryRunReaderSpans(userId, run); const rows = scopedRows(run, all); const tree = spanTree(rows);
  const depths = new Map(tree.ordered.map((entry) => [entry.row.span_id, entry.depth]));
  const failed = [...rows].filter((row) => row.metadata.status.code === "ERROR").sort((a, b) => a.metadata.end_time_ms - b.metadata.end_time_ms || (depths.get(b.span_id) ?? 0) - (depths.get(a.span_id) ?? 0) || compareSpans(a, b))[0];
  const path: RunReaderSpan[] = []; const pathIds = new Set<string>(); let current: RunReaderSpan | undefined = failed;
  while (current && !pathIds.has(current.span_id)) { pathIds.add(current.span_id); path.push(current); current = current.metadata.parent_span_id ? tree.byId.get(current.metadata.parent_span_id) : undefined; }
  path.reverse();
  const counts = new Map<string, number>(); const costs = new Map<string, number>(); const generations = new Set<string>(); const documents = new Set<string>(); const chargedGenerations = new Set<string>();
  for (const row of rows) {
    counts.set(row.metadata.name, (counts.get(row.metadata.name) ?? 0) + 1);
    const attrs = row.metadata.attributes; const cost = attrs["gen_ai.usage.cost_usd"];
    const provider = attrs["llm.provider"] ?? attrs["gen_ai.system"] ?? attrs["generation.provider"];
    if (typeof cost === "number" && Number.isFinite(cost) && typeof provider === "string") { const name = provider.slice(0, 200); costs.set(name, (costs.get(name) ?? 0) + cost); if (typeof attrs["generation.id"] === "string") { chargedGenerations.add(attrs["generation.id"]); } }
    if (typeof attrs["generation.id"] === "string") { generations.add(attrs["generation.id"]); }
    if (run.kind !== "app" && run.origin !== "public" && !run.content_expired && typeof attrs["document.id"] === "string") { documents.add(attrs["document.id"]); }
  }
  for (const generation of await queryRunReaderGenerationIds(userId, run)) { generations.add(generation); }
  const documentReferences = await queryRunReaderDocuments(userId, run);
  for (const document of documentReferences) { documents.add(document.id); }
  for (const generation of await queryRunReaderGenerationCosts(userId, run, [...generations].slice(0, 100))) {
    generations.add(generation.id);
    if (!chargedGenerations.has(generation.id) && generation.cost !== null && Number.isFinite(generation.cost)) { const provider = generation.provider.slice(0, 200); costs.set(provider, (costs.get(provider) ?? 0) + generation.cost); }
  }
  const app = await queryRunReaderAppMetadata(userId, run); const record = publicRunRecord(run); if (app) { record.app = app; }
  if (record.app && parsed.include_content) {
    const content = await queryRunReaderAppContent(userId, run); const budget: ReaderBudget = { remaining: RUN_READER_CONTENT_LIMIT, string_limit: RUN_READER_CONTENT_LIMIT };
    record.app.inputs = content.inputs ? boundedAttributes(content.inputs, budget) : null;
    record.app.outputs = content.outputs ? boundedAttributes(content.outputs, budget) : null;
    record.app.content_limited = Boolean(content.content_limited || budget.limited);
  }
  const recordingFlags = flags(run, rows, tree.incomplete);
  if (recordingFlags.content_state === "absent" && await queryRunReaderAppContentPresent(userId, run)) { recordingFlags.content_state = "available"; }
  const failurePath = path.length > RUN_SUMMARY_SPAN_LIMIT ? [...path.slice(0, RUN_SUMMARY_SPAN_LIMIT - 1), ...path.slice(-1)] : path;
  return { run: record, summary: { ...recordingFlags, first_failed_span_id: failed?.span_id ?? null,
    failure_path: failurePath.map(spanSummary), cost_by_provider: Object.fromEntries([...costs].sort(([a], [b]) => a.localeCompare(b)).slice(0, 20)),
    slowest_spans: [...rows].sort((a, b) => b.metadata.duration_ms - a.metadata.duration_ms || compareSpans(a, b)).slice(0, RUN_SUMMARY_SPAN_LIMIT).map(spanSummary),
    counts_by_name: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)).slice(0, 50)), span_count: rows.length, event_count: rows.reduce((count, row) => count + row.metadata.events.length, 0),
    documents: documentReferences.slice(0, 100), documents_limited: documentReferences.length > 100, generation_ids: [...generations].sort().slice(0, 100), document_ids: [...documents].sort().slice(0, 100),
    summary_truncated: path.length > RUN_SUMMARY_SPAN_LIMIT || counts.size > 50 || costs.size > 20 || generations.size > 100 || documents.size > 100 } };
}
interface ReaderBudget { remaining: number; string_limit?: number; limited?: boolean }
function boundedValue<T>(value: T, budget: ReaderBudget): T | string {
  if (budget.remaining <= 0) { return "[reader limit]"; }
  const encoded = JSON.stringify(value) ?? "null";
  const limit = Math.min(budget.string_limit ?? RUN_READER_STRING_LIMIT, budget.remaining);
  if (Buffer.byteLength(encoded) > limit) { budget.limited = true; }
  const result = Buffer.byteLength(encoded) > limit ? `${Buffer.from(typeof value === "string" ? value : encoded).subarray(0, Math.max(0, limit / 2 - 20)).toString()}[reader limit]` : value;
  const size = Buffer.byteLength(JSON.stringify(result) ?? "null");
  if (size > budget.remaining) { budget.remaining = 0; budget.limited = true; return "[reader limit]"; }
  budget.remaining -= size; return result;
}
type ReaderAttributes = TraceRecord["attributes"];
function boundedAttributes(attrs: ReaderAttributes, budget: ReaderBudget): ReaderAttributes {
  const result: ReaderAttributes = {};
  if (Object.keys(attrs).length > 100) { budget.limited = true; }
  for (const [inputKey, value] of Object.entries(attrs).slice(0, 100)) {
    const key = inputKey.slice(0, 200); const size = Buffer.byteLength(JSON.stringify(key)) + 3;
    if (budget.remaining <= size) { budget.remaining = 0; budget.limited = true; break; }
    budget.remaining -= size; result[key] = boundedValue(value, budget);
  }
  return result;
}
function boundedRecord(record: TraceRecord, budget: ReaderBudget & { events: number }, fullEvents = false): TraceRecord {
  const attributes = (attrs: Record<string, unknown>): Record<string, unknown> => boundedAttributes(attrs, budget);
  const status: TraceRecord["status"] = { code: record.status.code };
  if (record.status.message !== undefined) { status.message = String(boundedValue(record.status.message, budget)); }
  const events = record.events.slice(0, Math.min(fullEvents ? 1_000 : 128, budget.events)); budget.events -= events.length;
  if (events.length < record.events.length) { budget.limited = true; }
  return { ...record, name: record.name.slice(0, 200), status, attributes: attributes(record.attributes), resource: attributes(record.resource),
    events: events.map((event) => ({ ...event, name: event.name.slice(0, 200), attributes: attributes(event.attributes ?? {}) })) };
}
export async function getRunTrace(userId: string, id: string, options: RunTraceOptions = {}): Promise<GetRunTraceResult> {
  const parsed = validate(runTraceOptionsSchema, options);
  if (parsed.include_content && !parsed.focus_span_id) { throw new RunsError("invalid_input", "Content drill-down requires focus_span_id"); }
  const run = await resolve(userId, id); const rows = scopedRows(run, await queryRunReaderSpans(userId, run)); const tree = spanTree(rows);
  let entries = tree.ordered;
  if (parsed.focus_span_id) {
    const focus = tree.byId.get(parsed.focus_span_id); if (!focus) { throw new RunsError("not_found", "Span not found in run"); }
    entries = []; const seen = new Set<string>(); const queue = [{ row: focus, depth: 0 }];
    for (let index = 0; index < queue.length; index++) { const entry = queue[index]; if (!entry || seen.has(entry.row.span_id)) { continue; } seen.add(entry.row.span_id); entries.push(entry);
      for (const child of tree.children.get(entry.row.span_id) ?? []) { queue.push({ row: child, depth: entry.depth + 1 }); } }
  }
  const errorPath = new Set<string>();
  if (parsed.errors_only) {
    for (const entry of entries) {
      if (entry.row.metadata.status.code !== "ERROR") { continue; }
      let row: RunReaderSpan | undefined = entry.row;
      while (row && !errorPath.has(row.span_id)) { errorPath.add(row.span_id); row = row.metadata.parent_span_id ? tree.byId.get(row.metadata.parent_span_id) : undefined; }
    }
  }
  const filtered = entries.filter((entry) => entry.depth <= parsed.depth && (!parsed.name || entry.row.metadata.name.includes(parsed.name)) && (!parsed.errors_only || errorPath.has(entry.row.span_id)));
  const contentRows = parsed.include_content && parsed.focus_span_id ? await queryRunReaderSpans(userId, run, { includeContent: true, spanIds: [parsed.focus_span_id] }) : [];
  const content = new Map(contentRows.map((row) => [row.span_id, row.content])); const budget: ReaderBudget & { events: number } = { remaining: RUN_READER_CONTENT_LIMIT, events: 200 };
  const nodes = filtered.slice(0, parsed.limit).map(({ row, depth }) => {
    budget.string_limit = parsed.include_content && row.span_id === parsed.focus_span_id ? RUN_READER_CONTENT_LIMIT : RUN_READER_STRING_LIMIT;
    return { depth, record: boundedRecord(recombineTraceRecord(row.metadata, content.get(row.span_id) ?? null), budget) };
  });
  return { run: publicRunRecord(run), nodes, ...flags(run, rows, tree.incomplete), next_cursor: null, limited: filtered.length > parsed.limit || Boolean(budget.limited) || budget.remaining <= 0 || budget.events <= 0 };
}
const logsCursorSchema = z.object({ time_ms: z.number(), id: z.string() });
function logCursor(log: RunLog): string { return Buffer.from(JSON.stringify({ time_ms: log.time_ms, id: log.id })).toString("base64url"); }
export async function getRunLogs(userId: string, id: string, options: RunLogsOptions = {}): Promise<GetRunLogsResult> {
  const parsed = validate(runLogsOptionsSchema, options); const run = await resolve(userId, id);
  const rows = scopedRows(run, await queryRunReaderSpans(userId, run)); const logs: RunLog[] = [];
  let cursor: z.infer<typeof logsCursorSchema> | undefined;
  if (parsed.cursor) { try { cursor = logsCursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, "base64url").toString())); } catch { throw new RunsError("invalid_input", "Invalid log cursor"); } }
  for (const row of rows) {
    if (parsed.span_id && row.span_id !== parsed.span_id) { continue; }
    const record = recombineTraceRecord(row.metadata, parsed.include_content ? row.content : null);
    for (const [index, event] of record.events.entries()) {
      const attrs = event.attributes ?? {}; const level = attrs["log.level"] ?? attrs.level; const source = attrs["log.source"] ?? attrs.source;
      const entry: RunLog = { id: `${row.span_id}:${event.id ?? index}`, span_id: row.span_id, span_name: record.name, time_ms: event.time_ms, name: event.name,
        level: typeof level === "string" ? level : null, source: typeof source === "string" ? source : null, attributes: attrs };
      if ((parsed.level && entry.level !== parsed.level) || (parsed.source && entry.source !== parsed.source) || (parsed.since_ms !== undefined && entry.time_ms < parsed.since_ms) || (parsed.until_ms !== undefined && entry.time_ms > parsed.until_ms)) { continue; }
      if (cursor && (entry.time_ms < cursor.time_ms || entry.time_ms === cursor.time_ms && entry.id <= cursor.id)) { continue; }
      logs.push(entry);
    }
  }
  logs.sort((a, b) => a.time_ms - b.time_ms || a.id.localeCompare(b.id));
  const page = parsed.newest ? logs.slice(-parsed.limit) : logs.slice(0, parsed.limit); const budget: ReaderBudget = { remaining: RUN_READER_CONTENT_LIMIT, string_limit: parsed.include_content && parsed.span_id ? RUN_READER_CONTENT_LIMIT : RUN_READER_STRING_LIMIT };
  const spanIds = [...new Set(page.map((entry) => entry.span_id))];
  const contentRows = parsed.include_content ? await queryRunReaderSpans(userId, run, { includeContent: true, spanIds: spanIds.slice(0, 10) }) : [];
  const contents = new Map<string, TraceRecord["events"][number]>();
  for (const row of contentRows) { for (const [index, event] of recombineTraceRecord(row.metadata, row.content).events.entries()) { contents.set(`${row.span_id}:${event.id ?? index}`, event); } }
  const bounded = page.map((entry) => {
    const content = contents.get(entry.id); const attrs = content?.attributes ?? entry.attributes;
    return { ...entry, name: (content?.name ?? entry.name).slice(0, 200), attributes: boundedAttributes(attrs, budget) };
  });
  const last = page.at(-1);
  return { run: publicRunRecord(run), logs: bounded, ...flags(run, rows), next_cursor: !parsed.newest && logs.length > parsed.limit && last ? logCursor(last) : null, limited: Boolean(budget.limited) || budget.remaining <= 0 || parsed.include_content && spanIds.length > 10 };
}
/** Polling reads latest snapshots. It deliberately never promises append-only replay. */
export async function readRunUpdates(userId: string, id: string, options: RunUpdatesOptions = {}): Promise<RunUpdatesResult> {
  const parsed = validate(runUpdatesOptionsSchema, options); const run = await resolve(userId, id);
  const all = scopedRows(run, await queryRunReaderSpans(userId, run));
  const rows = all.filter((row) => row.cursor > parsed.cursor); const page: RunReaderSpan[] = []; let eventCount = 0;
  for (const row of rows) {
    if (page.length >= (parsed.include_content ? Math.min(10, parsed.limit) : parsed.limit) || page.length > 0 && eventCount + row.metadata.events.length > 200) { break; }
    page.push(row); eventCount += row.metadata.events.length;
  }
  const budget: ReaderBudget & { events: number } = { remaining: RUN_READER_CONTENT_LIMIT, events: Math.max(200, eventCount) };
  const contentRows = parsed.include_content ? await queryRunReaderSpans(userId, run, { includeContent: true, spanIds: page.map((row) => row.span_id) }) : [];
  const content = new Map(contentRows.map((row) => [row.span_id, row.content]));
  const recordingFlags = flags(run, all);
  return { run: publicRunRecord(run), ...recordingFlags, records: page.map((row) => ({ kind: validate(z.enum(["span_started", "span_updated", "span_ended", "span_event"]), row.update_kind),
    record: boundedRecord(recombineTraceRecord(row.metadata, content.get(row.span_id) ?? null), budget, true), run_id: row.run_id, cursor: row.cursor,
    content_expired: Boolean(row.content_expired), truncated: Boolean(row.truncated), incomplete: Boolean(row.incomplete) })), cursor: page.at(-1)?.cursor ?? parsed.cursor,
    has_more: rows.length > page.length, resnapshot_required: true, limited: Boolean(budget.limited) || budget.remaining <= 0 || budget.events <= 0,
    trace_settled: Boolean(run.root_span_id && all.some((row) => row.span_id === run.root_span_id && row.update_kind === "span_ended") && all.every((row) => row.update_kind === "span_ended")) };
}
export async function awaitRun(userId: string, id: string, options: RunAwaitOptions & { signal?: AbortSignal } = {}): Promise<GetRunResult> {
  const parsed = validate(runAwaitOptionsSchema, options); const deadline = Date.now() + parsed.timeout_ms;
  while (true) {
    if (options.signal?.aborted) { throw new RunsError("aborted", "Waiting for run was aborted"); }
    const run = await resolve(userId, id);
    if (run.status !== "running") { return getRun(userId, run.id); }
    const remaining = deadline - Date.now(); if (remaining <= 0) { throw new RunsError("timeout", "Timed out waiting for run"); }
    try { await delay(Math.min(parsed.poll_interval_ms, remaining), undefined, { signal: options.signal }); }
    catch (error) { if (options.signal?.aborted) { throw new RunsError("aborted", "Waiting for run was aborted"); } throw error; }
  }
}
