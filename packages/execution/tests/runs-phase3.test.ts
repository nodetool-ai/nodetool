import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { initTestDb, getDb, Job, Workflow, registerRunTrace, writeRunTraceUpdate, settleRunTrace, eraseRunTraceParentContent, deleteRunTrace, createAppInstance, reserveAppRun, setAppRunInputs, settleAppRun } from "@nodetool-ai/models";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { type TraceRecord } from "@nodetool-ai/protocol";
import { runSpans, runTraces } from "../../models/src/schema/run-traces.js";
import { applicationInvocations } from "../../models/src/schema/application-budgets.js";
import { listRuns, getRun, getRunTrace, getRunLogs, awaitRun, readRunUpdates, findRunForSource } from "../src/runs.js";

const OWNER = "run-reader-owner";
const ROOT = "1111111111111111";
const SCRIPT = "2222222222222222";
const FAILURE = "3333333333333333";
async function fixture(userId = OWNER, origin: "ui" | "public" = "ui") {
  if (!await Workflow.get("shared-workflow")) { await Workflow.create({ id: "shared-workflow", user_id: "other", name: "Shared", graph: { nodes: [], edges: [] } }); }
  const job = await Job.create({ user_id: userId, workflow_id: "shared-workflow" });
  const run = await registerRunTrace(userId, { kind: "workflow", sourceId: job.id, origin, parents: [] });
  const records: TraceRecord[] = [
    { trace_id: run.trace_id, span_id: ROOT, parent_span_id: null, name: "workflow.run", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 12, duration_ms: 11, status: { code: "ERROR", message: "Owner text" }, attributes: {}, events: [], resource: {} },
    { trace_id: run.trace_id, span_id: SCRIPT, parent_span_id: ROOT, name: "script.run", kind: "INTERNAL", start_time_ms: 2, end_time_ms: 11, duration_ms: 9, status: { code: "ERROR" }, attributes: {}, events: [], resource: {} },
    { trace_id: run.trace_id, span_id: FAILURE, parent_span_id: SCRIPT, name: "llm.chat", kind: "CLIENT", start_time_ms: 3, end_time_ms: 10, duration_ms: 7, status: { code: "ERROR", message: "Expected provider failure" },
      attributes: { "llm.provider": "test", "gen_ai.usage.cost_usd": 0.25, "llm.request.messages": "Private prompt", "llm.response.content": "Private response" },
      events: [{ id: "event-a", name: "log", time_ms: 5, attributes: { "log.level": "info", "log.source": "script", "log.message": "First private line" } },
        { id: "event-b", name: "log", time_ms: 6, attributes: { "log.level": "error", "log.source": "script", "log.message": "Last private line" } }], resource: {} }
  ];
  for (const record of records) { await writeRunTraceUpdate(userId, run.id, { kind: "span_ended", record }, { isRoot: record.span_id === ROOT }); }
  await settleRunTrace(userId, run.id, { status: "failed", costUsd: 0.25, error: "Expected provider failure" });
  return { run, job, records };
}
describe("phase 3 common run readers", () => {
  beforeEach(() => { initTestDb(); });
  it("names the causal failed child with its root path and keeps summary metadata-only", async () => {
    const { run } = await fixture(); const result = await getRun(OWNER, run.id.slice(0, 12));
    expect(result.summary.first_failed_span_id).toBe(FAILURE);
    expect(result.summary.failure_path.map((span) => span.span_id)).toEqual([ROOT, SCRIPT, FAILURE]);
    expect(result.summary.cost_by_provider).toEqual({ test: 0.25 });
    expect(result.summary.counts_by_name).toEqual({ "workflow.run": 1, "script.run": 1, "llm.chat": 1 });
    expect(result.summary.content_state).toBe("available");
    expect(JSON.stringify(result)).not.toContain("Private prompt");
    expect(JSON.stringify(result)).not.toContain("private line");
    // Invalid JSON in the content column proves summary does not deserialize it.
    await getDb().update(runSpans).set({ content: sql`'invalid JSON'` }).where(eq(runSpans.run_id, run.id));
    expect((await getRun(OWNER, run.id)).summary.first_failed_span_id).toBe(FAILURE);
  });
  it("resolves source and directory ids in owner scope, rejects ambiguous and foreign ids", async () => {
    const { run, job } = await fixture();
    expect((await getRun(OWNER, job.id.slice(0, 12))).run.id).toBe(run.id);
    expect(await findRunForSource(OWNER, "workflow", job.id.slice(0, 12))).toMatchObject({ id: run.id });
    await expect(getRun("foreign", run.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getRun(OWNER, run.id.slice(0, 11))).rejects.toMatchObject({ code: "not_found" });
    const second = await fixture();
    await getDb().update(runTraces).set({ id: `${run.id.slice(0, 12)}${"f".repeat(20)}` }).where(eq(runTraces.id, second.run.id));
    await expect(getRun(OWNER, run.id.slice(0, 12))).rejects.toMatchObject({ code: "ambiguous" });
  });
  it("requires explicit focused content and bounds depth/name/error queries", async () => {
    const { run } = await fixture();
    expect((await getRunTrace(OWNER, run.id, { depth: 0 })).nodes.map((node) => node.record.span_id)).toEqual([ROOT]);
    expect((await getRunTrace(OWNER, run.id, { name: "llm", errors_only: true })).nodes.map((node) => node.record.span_id)).toEqual([FAILURE]);
    await expect(getRunTrace(OWNER, run.id, { include_content: true })).rejects.toMatchObject({ code: "invalid_input" });
    const focused = await getRunTrace(OWNER, run.id, { focus_span_id: FAILURE, include_content: true });
    expect(focused.nodes[0]?.record.attributes["llm.request.messages"]).toBe("Private prompt");
    await expect(getRunTrace(OWNER, run.id, { focus_span_id: "a".repeat(16) })).rejects.toMatchObject({ code: "not_found" });
  });
  it("allows a named span's prompt beyond the default preview while retaining a fixed response bound", async () => {
    const { run, records } = await fixture(); const record = records[2]; if (!record) { throw new Error("Missing failure fixture"); }
    const prompt = "A readable detailed prompt. ".repeat(200);
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, attributes: { ...record.attributes, "llm.request.messages": prompt } } });
    const focused = await getRunTrace(OWNER, run.id, { include_content: true, focus_span_id: FAILURE });
    expect(focused.nodes[0]?.record.attributes["llm.request.messages"]).toBe(prompt);
    expect(Buffer.byteLength(JSON.stringify(focused))).toBeLessThan(40_000);
  });
  it("lists filtered logs oldest first, paginates stable events, and offers a bounded newest tail", async () => {
    const { run } = await fixture();
    const first = await getRunLogs(OWNER, run.id, { limit: 1, include_content: true });
    expect(first.logs[0]?.attributes["log.message"]).toBe("First private line");
    expect(first.next_cursor).not.toBeNull();
    const second = await getRunLogs(OWNER, run.id, { cursor: first.next_cursor ?? undefined, include_content: true });
    expect(second.logs.map((log) => log.time_ms)).toEqual([6]);
    expect((await getRunLogs(OWNER, run.id, { newest: true, limit: 1, include_content: true })).logs[0]?.attributes["log.message"]).toBe("Last private line");
    expect((await getRunLogs(OWNER, run.id, { level: "error", source: "script", span_id: FAILURE })).logs).toHaveLength(1);
    expect(JSON.stringify(await getRunLogs(OWNER, run.id))).not.toContain("private line");
  });
  it("reports expiry and public exclusion without recovering content", async () => {
    const { run } = await fixture();
    await eraseRunTraceParentContent(OWNER, { kind: "job", id: run.source_id });
    const expired = await getRunTrace(OWNER, run.id, { focus_span_id: FAILURE, include_content: true });
    expect(expired.content_state).toBe("expired"); expect(JSON.stringify(expired)).not.toContain("Private prompt");
    const visitor = await fixture(OWNER, "public");
    const publicTrace = await getRunTrace(OWNER, visitor.run.id, { focus_span_id: FAILURE, include_content: true });
    expect(publicTrace.content_state).toBe("public"); expect(JSON.stringify(publicTrace)).not.toContain("Private prompt");
  });
  it("marks coalesced cursor replay as a resnapshot and exposes newest committed data", async () => {
    const { run, records } = await fixture(); const first = await readRunUpdates(OWNER, run.id, { limit: 1 });
    expect(first.has_more).toBe(true); expect(first.resnapshot_required).toBe(true);
    const record = records[0]; if (!record) { throw new Error("Missing fixture span"); }
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, duration_ms: 100 } });
    const replay = await readRunUpdates(OWNER, run.id, { cursor: first.cursor });
    expect(replay.records.find((entry) => entry.record.span_id === ROOT)?.record.duration_ms).toBe(100);
    expect(replay.records.every((entry) => entry.cursor > first.cursor)).toBe(true);
  });
  it("handles terminal, timeout, abort and deletion without installing run listeners", async () => {
    const { run } = await fixture(); expect((await awaitRun(OWNER, run.id)).run.status).toBe("failed");
    await getDb().update(runTraces).set({ status: "running" }).where(eq(runTraces.id, run.id));
    await expect(awaitRun(OWNER, run.id, { timeout_ms: 1 })).rejects.toMatchObject({ code: "timeout" });
    const controller = new AbortController(); const aborted = awaitRun(OWNER, run.id, { signal: controller.signal }); controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: "aborted" });
    const deleted = awaitRun(OWNER, run.id, { poll_interval_ms: 10 }); await deleteRunTrace(OWNER, run.id);
    await expect(deleted).rejects.toMatchObject({ code: "not_found" });
  });
  it("paginates owner records deterministically and applies all metadata filters", async () => {
    const { run } = await fixture(); await fixture(); await fixture("foreign");
    const first = await listRuns(OWNER, { limit: 1, kind: "workflow", workflow_id: "shared-workflow", status: "failed", origin: "ui" });
    expect(first.runs).toHaveLength(1); expect(first.next_cursor).not.toBeNull();
    const next = await listRuns(OWNER, { limit: 1, cursor: first.next_cursor ?? undefined });
    expect(next.runs).toHaveLength(1); expect(next.runs[0]?.id).not.toBe(first.runs[0]?.id);
    expect((await listRuns(OWNER, { since: "2099-01-01T00:00:00Z" })).runs).toEqual([]);
    expect((await listRuns(OWNER, { until: "2000-01-01T00:00:00Z" })).runs).toEqual([]);
    expect((await listRuns(OWNER, { app_id: "no-app" })).runs).toEqual([]);
    expect((await getRun(OWNER, run.id)).run.trace_id).toBe(run.trace_id);
    await expect(listRuns(OWNER, { cursor: "invalid" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(listRuns(OWNER, { limit: 101 })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("bounds large cyclic and deeply nested traces without recursion overflow", async () => {
    const { run } = await fixture(); const db = getDb(); await db.delete(runSpans).where(eq(runSpans.run_id, run.id));
    for (let offset = 0; offset < 2_000; offset += 100) {
      await db.insert(runSpans).values(Array.from({ length: 100 }, (_, entry) => {
        const index = offset + entry; const id = (index + 1).toString(16).padStart(16, "0");
        const parent = (index === 0 ? 2_000 : index).toString(16).padStart(16, "0");
        const metadata: TraceRecord = { trace_id: run.trace_id, span_id: id, parent_span_id: parent, name: "node.process", kind: "INTERNAL", start_time_ms: index,
          end_time_ms: index + 1, duration_ms: 1, status: { code: index === 1_999 ? "ERROR" : "OK" }, attributes: {}, events: [], resource: {} };
        return { id: `span-${index}`, user_id: OWNER, run_id: run.id, trace_id: run.trace_id, span_id: id, cursor: index + 1, update_kind: "span_ended", metadata };
      }));
    }
    const summary = await getRun(OWNER, run.id); expect(summary.summary.span_count).toBe(2_000); expect(summary.summary.incomplete).toBe(true);
    expect(summary.summary.failure_path).toHaveLength(10); expect(summary.summary.summary_truncated).toBe(true);
    expect(JSON.stringify(summary).length).toBeLessThan(20_000);
    const trace = await getRunTrace(OWNER, run.id, { depth: 64, limit: 20 }); expect(trace.nodes).toHaveLength(20); expect(trace.limited).toBe(true);
  });
  it("keeps successful ancestors when tracing errors and resolves equal end-time failures causally", async () => {
    const { run, records } = await fixture();
    for (const record of records) { await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, end_time_ms: 10, status: { code: record.span_id === FAILURE ? "ERROR" : "OK" } } }); }
    expect((await getRunTrace(OWNER, run.id, { errors_only: true })).nodes.map((node) => node.record.span_id)).toEqual([ROOT, SCRIPT, FAILURE]);
    for (const record of records) { await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, end_time_ms: 10 } }); }
    expect((await getRun(OWNER, run.id)).summary.first_failed_span_id).toBe(FAILURE);
  });
  it("pages complete event snapshots before advancing the durable cursor", async () => {
    const { run, records } = await fixture();
    for (const record of records.slice(0, 2)) {
      await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, events: Array.from({ length: 128 }, (_, index) => ({ id: `${record.span_id}-${index}`, name: "log", time_ms: index })) } });
    }
    const first = await readRunUpdates(OWNER, run.id, { limit: 500 }); expect(first.has_more).toBe(true);
    const second = await readRunUpdates(OWNER, run.id, { cursor: first.cursor, limit: 500 });
    expect([...first.records, ...second.records].reduce((count, entry) => count + entry.record.events.length, 0)).toBe(258);
    expect(second.has_more).toBe(false);
  });
  it("counts serialized attribute keys in the response budget and caps provider names", async () => {
    const { run, records } = await fixture(); const record = records[2]; if (!record) { throw new Error("Missing failure fixture"); }
    const keys = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`${index}-${"attribute label ".repeat(13)}`, ""]));
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...record, attributes: { ...record.attributes, "llm.provider": "Provider ".repeat(2_500) }, events: Array.from({ length: 10 }, (_, index) => ({ id: `wide-${index}`, name: "log", time_ms: index, attributes: keys })) } });
    const logs = await getRunLogs(OWNER, run.id, { include_content: true, limit: 100 });
    expect(logs.limited).toBe(true); expect(Buffer.byteLength(JSON.stringify(logs))).toBeLessThan(100_000);
    expect(Object.keys((await getRun(OWNER, run.id)).summary.cost_by_provider)[0]?.length).toBeLessThanOrEqual(200);
  });
  it("caps deletion provenance on public run records", async () => {
    const { run } = await fixture();
    await getDb().update(runTraces).set({ parents: Array.from({ length: 1_000 }, (_, index) => ({ kind: "message" as const, id: `message-${index}` })) }).where(eq(runTraces.id, run.id));
    const result = await getRun(OWNER, run.id); expect(result.run.parents).toHaveLength(20); expect(result.run.parents_limited).toBe(true);
    expect((await listRuns(OWNER)).runs[0]?.parents).toHaveLength(20);
  });
  it("lists app identity and finds an exact operation beyond 500 unrelated runs", async () => {
    const instance = await createAppInstance({ userId: OWNER, sourceId: "example:recovery", snapshot: { document: { ...createEmptyDocument(), operations: [{ id: "abcdef012345", name: "Run", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }] }, workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {} } });
    const reserved = await reserveAppRun({ userId: OWNER, instanceId: instance.id, operationId: "abcdef012345", invocationId: "recovery", origin: "ui" });
    if (!reserved.allowed) { throw new Error(reserved.reason); }
    const trace = await registerRunTrace(OWNER, { kind: "app", sourceId: reserved.run.id, origin: "ui", parents: [] });
    await getDb().update(runTraces).set({ started_at: "2020-01-01T00:00:00.000Z" }).where(eq(runTraces.id, trace.id));
    for (let offset = 0; offset < 600; offset += 100) {
      await getDb().insert(runTraces).values(Array.from({ length: 100 }, (_, index) => {
        const id = (offset + index + 1).toString(16).padStart(32, "0");
        return { id, user_id: OWNER, kind: "app", source_id: `legacy-${id}`, canonical_root_id: id, trace_id: id, origin: "ui", started_at: "2026-01-01T00:00:00.000Z", parents: [{ kind: "instance" as const, id: instance.id }] };
      }));
    }
    const options = { kind: "app" as const, instance_id: instance.id.slice(0, 12), operation_id: "abcdef012345", limit: 1 };
    const page = await listRuns(OWNER, options);
    expect(page.runs.map((run) => run.id)).toEqual([trace.id]);
    expect(page.next_cursor).toBeNull();
    expect(page.runs[0]?.app).toEqual((await getRun(OWNER, trace.id)).run.app);
    expect(page.runs[0]?.app).not.toHaveProperty("inputs");
    expect((await listRuns(OWNER, { ...options, operation_id: "abcdef01234" })).runs).toEqual([]);
    expect((await listRuns("foreign", { ...options, instance_id: instance.id })).runs).toEqual([]);
    const legacy = await listRuns(OWNER, { kind: "app", instance_id: instance.id, limit: 1 });
    expect(legacy.runs[0]?.app).toBeUndefined();
    expect(legacy.next_cursor).not.toBeNull();
    const next = await listRuns(OWNER, { kind: "app", instance_id: instance.id, limit: 1, cursor: legacy.next_cursor ?? undefined });
    expect(next.runs[0]?.id).not.toBe(legacy.runs[0]?.id);
  });
  it("offers bounded app input/output drill-down while default summaries avoid private columns", async () => {
    const instance = await createAppInstance({ userId: OWNER, sourceId: "example:run-reader", snapshot: { document: { ...createEmptyDocument(), operations: [{ id: "op", name: "Run", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }] }, workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {} } });
    const reserved = await reserveAppRun({ userId: OWNER, instanceId: instance.id, operationId: "op", invocationId: "test", origin: "ui" });
    if (!reserved.allowed) { throw new Error(reserved.reason); }
    await setAppRunInputs(OWNER, reserved.run.id, { prompt: "Private app input" });
    await settleAppRun(OWNER, reserved.run.id, { status: "completed", outputs: { answer: "Private app output" } });
    const trace = await registerRunTrace(OWNER, { kind: "app", sourceId: reserved.run.id, origin: "ui", parents: [] });
    const metadata = await getRun(OWNER, trace.id);
    expect(metadata.run.app).toMatchObject({ instance_id: instance.id, operation_id: "op" });
    expect(metadata.run.app).not.toHaveProperty("inputs"); expect(metadata.run.app).not.toHaveProperty("outputs");
    expect(metadata.summary.content_state).toBe("available");
    expect((await getRun(OWNER, trace.id, { include_content: true })).run.app).toMatchObject({ inputs: { prompt: "Private app input" }, outputs: { answer: "Private app output" }, content_limited: false });
    await expect(getRun("foreign", trace.id, { include_content: true })).rejects.toMatchObject({ code: "not_found" });
    await getDb().update(applicationInvocations).set({ inputs: sql`'invalid JSON'` }).where(eq(applicationInvocations.id, reserved.run.id));
    expect((await getRun(OWNER, trace.id)).run.app).not.toHaveProperty("inputs");
    await getDb().update(applicationInvocations).set({ inputs: { oversized: "Readable oversized input. ".repeat(5_000) } }).where(eq(applicationInvocations.id, reserved.run.id));
    expect((await getRun(OWNER, trace.id, { include_content: true })).run.app).toMatchObject({ inputs: null, content_limited: true });
    await eraseRunTraceParentContent(OWNER, { kind: "app_run", id: reserved.run.id });
    const expired = await getRun(OWNER, trace.id, { include_content: true });
    expect(expired.summary.content_state).toBe("expired"); expect(expired.run.app).toMatchObject({ inputs: null, outputs: null });
  });
});
