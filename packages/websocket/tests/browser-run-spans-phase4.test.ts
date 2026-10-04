import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initTestDb, Job, Workflow, registerRunTrace, writeRunTraceUpdate, listRunTraceRecords,
  settleRunTrace, getDatabase, pruneRunTraces
} from "@nodetool-ai/models";
import { ingestBrowserRunSpans, subscribeRunTraceUpdates, registerContextRunTrace, getRun } from "@nodetool-ai/execution";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { BROWSER_TRACE_SOURCE_KEY, BROWSER_TRACE_CLOSE_WINDOW_MS, TRACE_SPAN_LIMIT, type TraceRecord, type RunTraceRegistration } from "@nodetool-ai/protocol";
import { eq } from "drizzle-orm";
import runSpansRoutes from "../src/routes/run-spans.js";
import { isAppSessionCommandAllowed } from "../src/lib/app-session-scope.js";

const OWNER = "browser-trace-owner";
let server: FastifyInstance;
let run: RunTraceRegistration;
function record(spanId = "1".repeat(16), parent: string | null = null): TraceRecord {
  const start = Date.now() - 10;
  return { trace_id: run.trace_id, span_id: spanId, parent_span_id: parent, name: "ui.action", kind: "INTERNAL", start_time_ms: start, end_time_ms: start + 5,
    duration_ms: 5, status: { code: "OK" }, attributes: { "ui.widget.id": "button", "ui.resolved.value": "Private browser prompt" },
    events: [{ id: `${spanId}:0`, name: "log", time_ms: start + 1, attributes: { "log.level": "info", "log.message": "Private browser output" } }],
    resource: { [BROWSER_TRACE_SOURCE_KEY]: "browser" } };
}
async function post(records: TraceRecord[], options: { id?: string; user?: string; visitor?: boolean } = {}) {
  return server.inject({ method: "POST", url: `/api/runs/${options.id ?? run.id}/spans`, headers: { "x-test-user": options.user ?? OWNER, ...(options.visitor ? { "x-test-visitor": "1" } : {}) }, payload: { records } });
}
beforeEach(async () => {
  initTestDb();
  const workflow = await Workflow.create({ user_id: OWNER, name: "Browser fixture", graph: { nodes: [], edges: [] } });
  const job = await Job.create({ user_id: OWNER, workflow_id: workflow.id });
  run = await registerRunTrace(OWNER, { kind: "workflow", sourceId: job.id, origin: "ui", parents: [{ kind: "job", id: job.id }, { kind: "workflow", id: workflow.id }] });
  server = Fastify();
  server.addHook("onRequest", async (request) => {
    const user = request.headers["x-test-user"];
    request.userId = typeof user === "string" ? user : undefined;
    if (request.headers["x-test-visitor"] === "1") { request.appSession = { applicationId: "visitor", version: 1 }; }
  });
  await server.register(runSpansRoutes);
});
afterEach(async () => { await server.close(); });

describe("phase 4 owner browser span ingestion", () => {
  it("stores and publishes the same sanitized shape with immutable retries and full/prefix source ids", async () => {
    const secret = "opaque run credential 83928";
    const context = new ProcessingContext({ jobId: run.source_id, userId: OWNER, secretResolver: () => secret });
    await registerContextRunTrace(context, { kind: "workflow", id: run.id, sourceId: run.source_id, traceId: run.trace_id, origin: "ui", parents: run.parents });
    await context.getSecret("provider-key");
    await settleRunTrace(OWNER, run.id, { status: "completed" });
    const input = record(); input.attributes["ui.resolved.value"] = `Prompt ${secret}`;
    const updates: TraceRecord[] = [];
    const unsubscribe = subscribeRunTraceUpdates((_user, update) => { updates.push(update.record); });
    try {
      const first = await post([input], { id: run.source_id.slice(0, 12) });
      expect(first.statusCode).toBe(200); expect(first.json()).toEqual({ accepted: 1, duplicate: 0, dropped: 0 });
      const original = await listRunTraceRecords(OWNER, run.id);
      expect(JSON.stringify(original)).not.toContain(secret);
      expect(original.records[0]?.record.attributes["ui.resolved.value"]).toContain("REDACTED");
      expect(original.records[0]?.record.resource[BROWSER_TRACE_SOURCE_KEY]).toBe("browser");
      expect(updates).toEqual(original.records.map((update) => update.record));
      input.name = "ui.widget_error"; input.attributes["ui.resolved.value"] = "retry must not replace original";
      expect((await post([input], { id: run.id.slice(0, 12) })).json()).toEqual({ accepted: 0, duplicate: 1, dropped: 0 });
      expect(await listRunTraceRecords(OWNER, run.id)).toEqual(original);
      expect(updates).toHaveLength(1);
    } finally { unsubscribe(); }
  });
  it("concurrent retries insert one row and advance one durable cursor", async () => {
    const results = await Promise.all([ingestBrowserRunSpans(OWNER, run.id, { records: [record()] }), ingestBrowserRunSpans(OWNER, run.id, { records: [record()] })]);
    expect(results.reduce((sum, result) => sum + result.accepted, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.duplicate, 0)).toBe(1);
    const stored = await listRunTraceRecords(OWNER, run.id); expect(stored.records).toHaveLength(1); expect(stored.cursor).toBe(1);
  });
  it("omits inline media from structured and pre-encoded browser content while preserving asset references", async () => {
    const context = new ProcessingContext({ jobId: run.source_id, userId: OWNER });
    await registerContextRunTrace(context, { kind: "workflow", id: run.id, sourceId: run.source_id, traceId: run.trace_id, origin: "ui", parents: run.parents });
    await settleRunTrace(OWNER, run.id, { status: "completed" });
    const input = record();
    const image = { type: "image", data: "QUJDREVGRw==", asset_id: "c".repeat(32), uri: `asset://${"c".repeat(32)}` };
    input.attributes["ui.resolved.value"] = { image };
    input.events[0]!.attributes = { "log.message": JSON.stringify({ image, buffer: { type: "Buffer", data: [1, 2, 3] } }) };
    expect((await post([input])).statusCode).toBe(200);
    const stored = await listRunTraceRecords(OWNER, run.id);
    const text = JSON.stringify(stored);
    expect(text).not.toContain(image.data); expect(text).not.toContain("[1,2,3]");
    expect(text).toContain(image.uri); expect(text).toContain("omitted:media");
  });
  it("refuses another owner and visitor sessions without storing spans", async () => {
    expect((await post([record()], { user: "foreign" })).statusCode).toBe(404);
    expect((await post([record()], { visitor: true })).statusCode).toBe(401);
    expect((await server.inject({ method: "POST", url: `/api/runs/${run.id}/spans`, payload: { records: [record()] } })).statusCode).toBe(401);
    expect(isAppSessionCommandAllowed("run_spans")).toBe(false);
    expect(isAppSessionCommandAllowed("span_ingest")).toBe(false);
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(0);
  });
  it("suppresses active workflow content until its run-only secret set is complete", async () => {
    const secret = "workflow credential resolved later 98657";
    const context = new ProcessingContext({ jobId: run.source_id, userId: OWNER, secretResolver: () => secret });
    await registerContextRunTrace(context, { kind: "workflow", id: run.id, sourceId: run.source_id, traceId: run.trace_id, origin: "ui", parents: run.parents });
    const input = record(); input.attributes["ui.resolved.value"] = secret;
    expect((await post([input])).statusCode).toBe(200);
    const active = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(active)).not.toContain(secret);
    expect(active.records[0]?.record.attributes["nodetool.trace.content_suppressed"]).toBe(true);
    await context.getSecret("late-workflow-key");
    await settleRunTrace(OWNER, run.id, { status: "completed" });
    input.span_id = "2".repeat(16);
    expect((await post([input])).statusCode).toBe(200);
    const terminal = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(terminal)).not.toContain(secret);
    expect(terminal.records.find((span) => span.record.span_id === input.span_id)?.record.attributes["ui.resolved.value"]).toContain("REDACTED");
  });
  it("rejects public and old runs but accepts recent terminal spans", async () => {
    const db = getDatabase();
    if (db.dialect !== "sqlite") { throw new Error("SQLite fixture required"); }
    await db.db.update(db.schema.runTraces).set({ origin: "public" }).where(eq(db.schema.runTraces.id, run.id));
    expect((await post([record()])).statusCode).toBe(400);
    await db.db.update(db.schema.runTraces).set({ origin: "ui" }).where(eq(db.schema.runTraces.id, run.id));
    await settleRunTrace(OWNER, run.id, { status: "completed" });
    expect((await post([record()])).statusCode).toBe(200);
    await db.db.update(db.schema.runTraces).set({ ended_at: new Date(Date.now() - BROWSER_TRACE_CLOSE_WINDOW_MS - 1).toISOString() }).where(eq(db.schema.runTraces.id, run.id));
    expect((await post([record("2".repeat(16))])).statusCode).toBe(400);
  });
  it.each(["wrong trace", "zero span", "self parent", "missing provenance", "server name", "future time", "reversed time", "wrong duration", "event outside span"])("rejects %s before insert", async (invalid) => {
    const input = record();
    if (invalid === "wrong trace") { input.trace_id = "f".repeat(32); }
    if (invalid === "zero span") { input.span_id = "0".repeat(16); }
    if (invalid === "self parent") { input.parent_span_id = input.span_id; }
    if (invalid === "missing provenance") { input.resource = {}; }
    if (invalid === "server name") { input.name = "llm.chat"; }
    if (invalid === "future time") { input.start_time_ms += 60_000; input.end_time_ms += 60_000; input.events = []; }
    if (invalid === "reversed time") { input.end_time_ms = input.start_time_ms - 1; }
    if (invalid === "wrong duration") { input.duration_ms = 99; }
    if (invalid === "event outside span") { input.events[0]!.time_ms = input.end_time_ms + 1; }
    expect((await post([input])).statusCode).toBe(400);
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(0);
  });
  it("rejects cyclic batches and closes a cycle across later batches while safely preserving missing parents", async () => {
    const a = record("1".repeat(16), "2".repeat(16)); const b = record("2".repeat(16), "1".repeat(16));
    expect((await post([a, b])).statusCode).toBe(400);
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(0);
    expect((await post([a])).statusCode).toBe(200);
    expect((await post([b])).statusCode).toBe(400);
    expect((await listRunTraceRecords(OWNER, run.id)).records[0]?.record.parent_span_id).toBe(b.span_id);
  });
  it("cannot replace the server root or another server span", async () => {
    const root = record("a".repeat(16)); root.name = "workflow.run"; root.resource = {};
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: root }, { isRoot: true });
    const child = { ...root, span_id: "b".repeat(16), parent_span_id: root.span_id, name: "node.process" };
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: child });
    const before = await listRunTraceRecords(OWNER, run.id);
    expect((await post([record(root.span_id)])).statusCode).toBe(400);
    expect((await post([record(child.span_id)])).statusCode).toBe(400);
    expect(await listRunTraceRecords(OWNER, run.id)).toEqual(before);
  });
  it("enforces the transport byte limit and per-batch record cap", async () => {
    const huge = record(); huge.attributes["ui.resolved.value"] = "x".repeat(256_000);
    expect((await post([huge])).statusCode).toBe(413);
    expect((await post(Array.from({ length: 51 }, () => record()))).statusCode).toBe(400);
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(0);
  });
  it("applies the shared span cap and reports dropped records and truncation", async () => {
    const db = getDatabase(); if (db.dialect !== "sqlite") { throw new Error("SQLite fixture required"); }
    await db.db.update(db.schema.runTraces).set({ span_count: TRACE_SPAN_LIMIT }).where(eq(db.schema.runTraces.id, run.id));
    expect((await post([record()])).json()).toEqual({ accepted: 0, duplicate: 0, dropped: 1 });
    const [stored] = await db.db.select().from(db.schema.runTraces).where(eq(db.schema.runTraces.id, run.id)); expect(stored?.truncated).toBe(1);
  });
  it("retains an explicit lost-batch indicator in the content-free run summary", async () => {
    const input = record(); input.attributes["nodetool.trace.incomplete"] = true; input.attributes["nodetool.trace.dropped_browser_spans"] = 2;
    expect((await post([input])).statusCode).toBe(200);
    expect((await getRun(OWNER, run.id)).summary.incomplete).toBe(true);
    const [stored] = (await listRunTraceRecords(OWNER, run.id)).records;
    expect(stored?.incomplete).toBe(true);
    expect(stored?.record.attributes["nodetool.trace.dropped_browser_spans"]).toBe(2);
  });
  it("validates ancestry through a large stored chain without recursive tree traversal", async () => {
    const db = getDatabase(); if (db.dialect !== "sqlite") { throw new Error("SQLite fixture required"); }
    const size = 1_500;
    const rows = Array.from({ length: size }, (_, index) => {
      const spanId = (index + 1).toString(16).padStart(16, "0");
      const metadata = record(spanId, index === 0 ? null : index.toString(16).padStart(16, "0"));
      metadata.attributes = {}; metadata.events = [];
      return { id: (index + 1).toString(16).padStart(32, "0"), user_id: OWNER, run_id: run.id, trace_id: run.trace_id, span_id: spanId,
        cursor: index + 1, update_kind: "span_ended", metadata, content: null, error_summary: null, content_expired: 0, truncated: 0, incomplete: 0 };
    });
    for (let offset = 0; offset < rows.length; offset += 250) { await db.db.insert(db.schema.runSpans).values(rows.slice(offset, offset + 250)); }
    await db.db.update(db.schema.runTraces).set({ span_count: size, next_cursor: size }).where(eq(db.schema.runTraces.id, run.id));
    const input = record("e".repeat(16), size.toString(16).padStart(16, "0"));
    expect((await post([input])).json()).toEqual({ accepted: 1, duplicate: 0, dropped: 0 });
    expect((await getRun(OWNER, run.id)).summary.span_count).toBe(size + 1);
  });
  it("suppresses unknown worker content and cannot restore expired content", async () => {
    expect((await post([record()])).statusCode).toBe(200);
    let stored = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(stored)).not.toContain("Private browser");
    expect(stored.records[0]?.record.attributes["nodetool.trace.content_suppressed"]).toBe(true);
    await registerContextRunTrace(new ProcessingContext({ jobId: run.source_id, userId: OWNER }), { kind: "workflow", id: run.id, sourceId: run.source_id, traceId: run.trace_id, origin: "ui", parents: run.parents });
    await pruneRunTraces(OWNER, new Date(Date.now() + 1_000).toISOString(), "1970-01-01T00:00:00.000Z");
    expect((await post([record("3".repeat(16))])).statusCode).toBe(200);
    stored = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(stored)).not.toContain("Private browser");
    expect(stored.records.every((update) => update.content_expired)).toBe(true);
    expect(stored.records.every((update) => update.record.resource[BROWSER_TRACE_SOURCE_KEY] === "browser")).toBe(true);
  });
});
