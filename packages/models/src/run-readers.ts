import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { TRACE_SPAN_LIMIT, TRACE_RESTRICTED_CAPABILITY_MODULES, RUN_READER_CONTENT_LIMIT, runTraceRegistrationSchema, type RunListOptions, type RunTraceRegistration, type GetRunResult } from "@nodetool-ai/protocol";
import { getDatabase } from "./db.js";
import { RunTraceError } from "./run-trace.js";
import type { runSpans } from "./schema/run-traces.js";

export type RunReaderSpan = typeof runSpans.$inferSelect & { has_content: boolean };
const listCursorSchema = z.object({ started_at: z.string(), id: z.string() });
export function encodeRunListCursor(run: RunTraceRegistration): string {
  return Buffer.from(JSON.stringify({ started_at: run.started_at, id: run.id })).toString("base64url");
}
function parseListCursor(value: string): z.infer<typeof listCursorSchema> {
  try { return listCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString())); }
  catch { throw new RunTraceError("invalid_input", "Invalid run cursor"); }
}
function idMatch(column: Parameters<typeof eq>[0], id: string): SQL {
  return /^[0-9a-f]{12}$/.test(id) ? sql`${column} LIKE ${`${id}%`}` : eq(column, id);
}
/** A source id and directory id resolve to one unique run inside the caller's scope. */
export async function resolveRunReader(userId: string, id: string, kind?: RunTraceRegistration["kind"]): Promise<RunTraceRegistration | null> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const where = and(eq(t.user_id, userId), kind ? eq(t.kind, kind) : undefined, or(idMatch(t.id, id), idMatch(t.source_id, id)));
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(where).limit(2) : await c.db.select().from(c.schema.runTraces).where(where).limit(2);
  if (rows.length > 1) { throw new RunTraceError("conflict", "Run id is ambiguous"); }
  return rows[0] ? runTraceRegistrationSchema.parse(rows[0]) : null;
}
export async function findRunReaderSource(userId: string, kind: RunTraceRegistration["kind"], sourceId: string): Promise<RunTraceRegistration | null> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const where = and(eq(t.user_id, userId), eq(t.kind, kind), idMatch(t.source_id, sourceId));
  const rows = c.dialect === "sqlite" ? await c.db.select().from(c.schema.runTraces).where(where).limit(2) : await c.db.select().from(c.schema.runTraces).where(where).limit(2);
  if (rows.length > 1) { throw new RunTraceError("conflict", "Run source id is ambiguous"); }
  return rows[0] ? runTraceRegistrationSchema.parse(rows[0]) : null;
}
async function resolveParentId(userId: string, kind: "app" | "instance" | "workflow" | "thread", id: string): Promise<string> {
  if (!/^[0-9a-f]{12}$/.test(id)) { return id; }
  const c = getDatabase(); const t = c.schema.runTraces;
  // DISTINCT is applied to parent ids inside the owner's directory, including shared workflows.
  const expression = c.dialect === "sqlite" ? sql<string>`json_extract(p.value, '$.id')` : sql<string>`p.value->>'id'`;
  const kindExpression = c.dialect === "sqlite" ? sql`json_extract(p.value, '$.kind')` : sql`p.value->>'kind'`;
  const where = and(eq(t.user_id, userId), sql`${kindExpression} = ${kind}`, sql`${expression} LIKE ${`${id}%`}`);
  const rows = c.dialect === "sqlite" ? await c.db.selectDistinct({ id: expression }).from(c.schema.runTraces).innerJoin(sql`json_each(${t.parents}) p`, sql`true`).where(where).limit(2)
    : await c.db.selectDistinct({ id: expression }).from(c.schema.runTraces).innerJoin(sql`jsonb_array_elements(${t.parents}::jsonb) AS p(value)`, sql`true`).where(where).limit(2);
  if (rows.length > 1) { throw new RunTraceError("conflict", `${kind} id is ambiguous`); }
  if (!rows[0]) { throw new RunTraceError("not_found", `${kind} not found`); }
  return rows[0].id;
}
function restrictedRunContent(userId: string, traceId: SQL | string): SQL {
  const c = getDatabase();
  const moduleExpression = c.dialect === "sqlite" ? sql`json_extract(s.metadata, '$.attributes."capability.module"')` : sql`s.metadata::jsonb->'attributes'->>'capability.module'`;
  const toolExpression = c.dialect === "sqlite" ? sql`json_extract(s.metadata, '$.attributes."tool.module"')` : sql`s.metadata::jsonb->'attributes'->>'tool.module'`;
  return sql`EXISTS (SELECT 1 FROM ${c.schema.runSpans} s WHERE s.user_id = ${userId} AND s.trace_id = ${traceId} AND (${moduleExpression} IN (${sql.join(TRACE_RESTRICTED_CAPABILITY_MODULES.map((name) => sql`${name}`), sql`,`)}) OR ${toolExpression} IN (${sql.join(TRACE_RESTRICTED_CAPABILITY_MODULES.map((name) => sql`${name}`), sql`,`)})))`;
}
function appHistoryProjection(userId: string, traceId: SQL | string, privateRun: SQL) {
  const c = getDatabase(); const a = c.schema.applicationInvocations;
  const costState = sql<string>`CASE WHEN ${a.actual_usd} IS NOT NULL THEN 'settled' WHEN ${a.status} = 'running' OR ${a.known_llm_usd} IS NOT NULL THEN 'unsettled' ELSE 'unavailable' END`;
  const restricted = restrictedRunContent(userId, traceId);
  const mediaType = sql`CASE WHEN asset.content_type LIKE 'image/%' THEN 'image' WHEN asset.content_type LIKE 'video/%' THEN 'video' WHEN asset.content_type LIKE 'audio/%' THEN 'audio' END`;
  const assetIds = c.dialect === "sqlite" ? sql`json_each(p.asset_ids) output` : sql`jsonb_array_elements_text(p.asset_ids::jsonb) output(value)`;
  const result = c.dialect === "sqlite" ? sql`json_object('type', ${mediaType}, 'asset_id', asset.id)` : sql`json_build_object('type', ${mediaType}, 'asset_id', asset.id)::text`;
  const reference = sql<string | null>`CASE WHEN NOT (${privateRun}) OR ${a.origin} = 'public' OR ${a.content_expired} <> 0 OR ${restricted} THEN NULL ELSE (SELECT ${result} FROM ${c.schema.generationAttachments} attachment JOIN ${c.schema.predictions} p ON attachment.generation_id = p.id JOIN ${assetIds} ON true JOIN ${c.schema.assets} asset ON asset.id = output.value WHERE attachment.target_type = 'app_run' AND attachment.target_id = ${a}.${sql.identifier("id")} AND p.user_id = ${userId} AND asset.user_id = ${userId} AND p.status = 'completed' AND ${mediaType} IS NOT NULL ORDER BY p.id, asset.id LIMIT 1) END`;
  return { actual_usd: sql<number | null>`${a.actual_usd}`, cost_state: costState, result_reference: reference };
}
const resultReferenceSchema = z.object({ type: z.enum(["image", "video", "audio"]), asset_id: z.string() });
function parseAppHistory<T extends { cost_state: string; result_reference: string | null }>(row: T) {
  return { ...row, cost_state: z.enum(["settled", "unsettled", "unavailable"]).parse(row.cost_state), result_reference: row.result_reference ? resultReferenceSchema.parse(JSON.parse(row.result_reference)) : null };
}
export async function queryRunReaders(userId: string, options: RunListOptions): Promise<Array<RunTraceRegistration & { app?: NonNullable<GetRunResult["run"]["app"]> }>> {
  const c = getDatabase(); const t = c.schema.runTraces;
  const conditions: Array<SQL | undefined> = [eq(t.user_id, userId), options.kind ? eq(t.kind, options.kind) : undefined,
    options.status ? eq(t.status, options.status) : undefined, options.origin ? eq(t.origin, options.origin) : undefined,
    options.since ? gte(t.started_at, options.since) : undefined, options.until ? lte(t.started_at, options.until) : undefined];
  const filters: Array<["app" | "instance" | "workflow" | "thread", string | undefined]> = [["app", options.app_id], ["instance", options.instance_id], ["workflow", options.workflow_id], ["thread", options.thread_id]];
  for (const [kind, input] of filters) {
    if (!input) { continue; }
    const id = await resolveParentId(userId, kind, input);
    conditions.push(c.dialect === "sqlite"
      ? sql`EXISTS (SELECT 1 FROM json_each(${t.parents}) p WHERE json_extract(p.value, '$.kind') = ${kind} AND json_extract(p.value, '$.id') = ${id})`
      : sql`${t.parents}::jsonb @> ${JSON.stringify([{ kind, id }])}::jsonb`);
  }
  const a = c.schema.applicationInvocations;
  if (options.operation_id) { conditions.push(eq(a.operation_id, options.operation_id)); }
  if (options.cursor) {
    const cursor = parseListCursor(options.cursor);
    conditions.push(or(lt(t.started_at, cursor.started_at), and(eq(t.started_at, cursor.started_at), lt(t.id, cursor.id))));
  }
  const where = and(...conditions); const limit = (options.limit ?? 20) + 1;
  const join = and(eq(t.kind, "app"), eq(a.id, t.source_id), eq(a.user_id, userId));
  const rows = c.dialect === "sqlite"
    ? await c.db.select({ run: c.schema.runTraces, app: { id: c.schema.applicationInvocations.id, instance_id: c.schema.applicationInvocations.instance_id, operation_id: c.schema.applicationInvocations.operation_id, app_version: c.schema.applicationInvocations.version, application_id: c.schema.applicationInvocations.application_id, ...appHistoryProjection(userId, sql`${t.trace_id}`, sql`${t.origin} <> ${"public"} AND ${t.content_expired} = 0`) } }).from(c.schema.runTraces).leftJoin(c.schema.applicationInvocations, join).where(where).orderBy(desc(t.started_at), desc(t.id)).limit(limit)
    : await c.db.select({ run: c.schema.runTraces, app: { id: c.schema.applicationInvocations.id, instance_id: c.schema.applicationInvocations.instance_id, operation_id: c.schema.applicationInvocations.operation_id, app_version: c.schema.applicationInvocations.version, application_id: c.schema.applicationInvocations.application_id, ...appHistoryProjection(userId, sql`${t.trace_id}`, sql`${t.origin} <> ${"public"} AND ${t.content_expired} = 0`) } }).from(c.schema.runTraces).leftJoin(c.schema.applicationInvocations, join).where(where).orderBy(desc(t.started_at), desc(t.id)).limit(limit);
  return rows.map((row) => ({ ...runTraceRegistrationSchema.parse(row.run), ...(row.app ? { app: { instance_id: row.app.instance_id, operation_id: row.app.operation_id, app_version: row.app.app_version, application_id: row.app.application_id, ...parseAppHistory({ actual_usd: row.app.actual_usd, cost_state: row.app.cost_state, result_reference: row.app.result_reference }) } } : {}) }));
}
/** Metadata-only readers never load the content column. All reads use the indexed owner/trace path. */
export async function queryRunReaderSpans(userId: string, run: RunTraceRegistration, options: { includeContent?: boolean; cursor?: number; limit?: number; spanIds?: readonly string[] } = {}): Promise<RunReaderSpan[]> {
  const c = getDatabase(); const s = c.schema.runSpans;
  const where = and(eq(s.user_id, userId), eq(s.trace_id, run.trace_id), options.cursor === undefined ? undefined : gt(s.cursor, options.cursor), options.spanIds ? inArray(s.span_id, [...options.spanIds]) : undefined);
  if (c.dialect === "sqlite") {
    const table = c.schema.runSpans;
    const selection = { id: table.id, user_id: table.user_id, run_id: table.run_id, trace_id: table.trace_id, span_id: table.span_id, cursor: table.cursor, update_kind: table.update_kind,
      metadata: table.metadata, content: options.includeContent && run.origin !== "public" && !run.content_expired ? table.content : sql<null>`NULL`,
      has_content: sql<boolean>`CASE WHEN ${table.content} IS NOT NULL THEN 1 ELSE 0 END`.mapWith(Boolean), error_summary: table.error_summary, content_expired: table.content_expired, truncated: table.truncated, incomplete: table.incomplete };
    return c.db.select(selection).from(table).where(where).orderBy(asc(table.cursor)).limit(options.limit ?? TRACE_SPAN_LIMIT + 1);
  }
  const table = c.schema.runSpans;
  const selection = { id: table.id, user_id: table.user_id, run_id: table.run_id, trace_id: table.trace_id, span_id: table.span_id, cursor: table.cursor, update_kind: table.update_kind,
    metadata: table.metadata, content: options.includeContent && run.origin !== "public" && !run.content_expired ? table.content : sql<null>`NULL`,
    has_content: sql<boolean>`CASE WHEN ${table.content} IS NOT NULL THEN true ELSE false END`, error_summary: table.error_summary, content_expired: table.content_expired, truncated: table.truncated, incomplete: table.incomplete };
  return c.db.select(selection).from(table).where(where).orderBy(asc(table.cursor)).limit(options.limit ?? TRACE_SPAN_LIMIT + 1);
}
export async function queryRunReaderGenerationIds(userId: string, run: RunTraceRegistration): Promise<string[]> {
  if (run.kind !== "app") { return []; }
  const c = getDatabase(); const a = c.schema.generationAttachments; const p = c.schema.predictions;
  const where = and(eq(p.user_id, userId), eq(a.target_type, "app_run"), eq(a.target_id, run.source_id));
  const rows = c.dialect === "sqlite" ? await c.db.selectDistinct({ id: c.schema.generationAttachments.generation_id }).from(c.schema.generationAttachments).innerJoin(c.schema.predictions, eq(a.generation_id, p.id)).where(where).orderBy(asc(a.generation_id)).limit(101)
    : await c.db.selectDistinct({ id: c.schema.generationAttachments.generation_id }).from(c.schema.generationAttachments).innerJoin(c.schema.predictions, eq(a.generation_id, p.id)).where(where).orderBy(asc(a.generation_id)).limit(101);
  return rows.map((row) => row.id);
}
export async function queryRunReaderDocuments(userId: string, run: RunTraceRegistration): Promise<Array<{kind:string;id:string}>> {
  if (run.kind !== "app" || run.origin === "public" || run.content_expired) { return []; }
  const c = getDatabase(); const a = c.schema.applicationInvocations;
  const where = and(eq(a.user_id, userId), eq(a.id, run.source_id), eq(a.content_expired, 0), sql`(${a.origin} IS NULL OR ${a.origin} <> ${"public"})`, sql`NOT ${restrictedRunContent(userId, run.trace_id)}`);
  const entries = c.dialect === "sqlite" ? sql`json_each(${a.documents}) document` : sql`jsonb_array_elements(${a.documents}::jsonb) document(value)`;
  const kind = c.dialect === "sqlite" ? sql<string>`json_extract(document.value, '$.kind')` : sql<string>`document.value->>'kind'`;
  const id = c.dialect === "sqlite" ? sql<string>`json_extract(document.value, '$.id')` : sql<string>`document.value->>'id'`;
  const rows = c.dialect === "sqlite" ? await c.db.select({ kind, id }).from(c.schema.applicationInvocations).innerJoin(entries, sql`true`).where(where).limit(101)
    : await c.db.select({ kind, id }).from(c.schema.applicationInvocations).innerJoin(entries, sql`true`).where(where).limit(101);
  return rows;
}
export async function queryRunReaderDocumentIds(userId: string, run: RunTraceRegistration): Promise<string[]> {
  return (await queryRunReaderDocuments(userId, run)).map((document) => document.id);
}
export async function queryRunReaderAppMetadata(userId: string, run: RunTraceRegistration) {
  if (run.kind !== "app") { return undefined; }
  const c = getDatabase(); const t = c.schema.applicationInvocations; const where = and(eq(t.user_id, userId), eq(t.id, run.source_id));
  const rows = c.dialect === "sqlite" ? await c.db.select({ instance_id: c.schema.applicationInvocations.instance_id, operation_id: c.schema.applicationInvocations.operation_id, app_version: c.schema.applicationInvocations.version, application_id: c.schema.applicationInvocations.application_id, ...appHistoryProjection(userId, run.trace_id, sql`${run.origin === "public" || run.content_expired ? 0 : 1} = 1`) }).from(c.schema.applicationInvocations).where(where).limit(1)
    : await c.db.select({ instance_id: c.schema.applicationInvocations.instance_id, operation_id: c.schema.applicationInvocations.operation_id, app_version: c.schema.applicationInvocations.version, application_id: c.schema.applicationInvocations.application_id, ...appHistoryProjection(userId, run.trace_id, sql`${run.origin === "public" || run.content_expired ? 0 : 1} = 1`) }).from(c.schema.applicationInvocations).where(where).limit(1);
  return rows[0] ? parseAppHistory(rows[0]) : undefined;
}
type AppReaderContent = Pick<NonNullable<GetRunResult["run"]["app"]>, "inputs" | "outputs" | "content_limited">;
export async function queryRunReaderAppContent(userId: string, run: RunTraceRegistration): Promise<AppReaderContent> {
  if (run.kind !== "app" || run.origin === "public" || run.content_expired) { return { inputs: null, outputs: null, content_limited: false }; }
  const c = getDatabase(); const t = c.schema.applicationInvocations;
  const inputSize = c.dialect === "sqlite" ? sql`length(CAST(${t.inputs} AS BLOB))` : sql`octet_length(${t.inputs})`;
  const outputSize = c.dialect === "sqlite" ? sql`length(CAST(${t.outputs} AS BLOB))` : sql`octet_length(${t.outputs})`;
  const inputs = sql<string | null>`CASE WHEN ${inputSize} <= ${RUN_READER_CONTENT_LIMIT} THEN ${t.inputs} ELSE NULL END`;
  const outputs = sql<string | null>`CASE WHEN ${outputSize} <= ${RUN_READER_CONTENT_LIMIT} THEN ${t.outputs} ELSE NULL END`;
  const limited = sql<boolean>`CASE WHEN ${inputSize} > ${RUN_READER_CONTENT_LIMIT} OR ${outputSize} > ${RUN_READER_CONTENT_LIMIT} THEN 1 ELSE 0 END`.mapWith(Boolean);
  const where = and(eq(t.user_id, userId), eq(t.id, run.source_id), eq(t.content_expired, 0));
  const rows = c.dialect === "sqlite" ? await c.db.select({ inputs, outputs, limited }).from(c.schema.applicationInvocations).where(where).limit(1)
    : await c.db.select({ inputs, outputs, limited }).from(c.schema.applicationInvocations).where(where).limit(1);
  const row = rows[0];
  const parse = (value: string | null | undefined): NonNullable<AppReaderContent["inputs"]> | null => value ? z.record(z.string(), z.unknown()).parse(JSON.parse(value)) : null;
  return { inputs: parse(row?.inputs), outputs: parse(row?.outputs), content_limited: row?.limited ?? false };
}
export async function queryRunReaderAppContentPresent(userId: string, run: RunTraceRegistration): Promise<boolean> {
  if (run.kind !== "app" || run.origin === "public" || run.content_expired) { return false; }
  const c = getDatabase(); const t = c.schema.applicationInvocations;
  const present = sql<boolean>`CASE WHEN ${t.inputs} IS NOT NULL OR ${t.outputs} IS NOT NULL THEN 1 ELSE 0 END`.mapWith(Boolean);
  const where = and(eq(t.user_id, userId), eq(t.id, run.source_id), eq(t.content_expired, 0));
  const rows = c.dialect === "sqlite" ? await c.db.select({ present }).from(c.schema.applicationInvocations).where(where).limit(1)
    : await c.db.select({ present }).from(c.schema.applicationInvocations).where(where).limit(1);
  return rows[0]?.present ?? false;
}
export async function queryRunReaderGenerationCosts(userId: string, run: RunTraceRegistration, ids: readonly string[]) {
  const c = getDatabase(); const p = c.schema.predictions;
  const where = and(eq(p.user_id, userId), or(ids.length ? inArray(p.id, [...ids]) : undefined, run.kind === "workflow" ? eq(p.job_id, run.source_id) : undefined));
  if (ids.length === 0 && run.kind !== "workflow") { return []; }
  const rows = c.dialect === "sqlite" ? await c.db.select({ id: c.schema.predictions.id, provider: c.schema.predictions.provider, cost: c.schema.predictions.cost }).from(c.schema.predictions).where(where).orderBy(asc(p.id)).limit(101)
    : await c.db.select({ id: c.schema.predictions.id, provider: c.schema.predictions.provider, cost: c.schema.predictions.cost }).from(c.schema.predictions).where(where).orderBy(asc(p.id)).limit(101);
  return rows;
}
