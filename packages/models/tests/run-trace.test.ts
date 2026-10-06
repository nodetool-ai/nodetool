import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { TRACE_EVENT_LIMIT, TRACE_SPAN_LIMIT, type TraceRecord } from "@nodetool-ai/protocol";
import { initTestDb, getDb } from "../src/db.js";
import { Job } from "../src/job.js";
import { Message } from "../src/message.js";
import { Thread } from "../src/thread.js";
import { Workflow } from "../src/workflow.js";
import { setApplicationBudget } from "../src/application-budget.js";
import { Application } from "../src/application.js";
import { createAppInstance, reserveAppRun, getAppRun, getAppInstance, deleteAppRun, deleteAppInstance, settleAppRun, setAppRunInputs, pruneAppRuns } from "../src/app-instance.js";
import { erasePersonalData, exportPersonalData } from "../src/personal-data.js";
import {
  registerRunTrace, getRunTrace, getRegisteredRunTrace, getRegisteredTrace, setRunTraceRoot,
  writeRunTraceUpdate, listRunTraceRecords, eraseRunTraceParentContent, deleteRunTrace,
  settleRunTrace, pruneRunTraces, markRunTraceIncomplete, registerRunTraceParents, sanitizeRunTraceRecord
} from "../src/run-trace.js";
import { runSpans, runTraces } from "../src/schema/run-traces.js";
import { applicationInvocations } from "../src/schema/application-budgets.js";

const OWNER = "u1";
async function workflowTrace(userId = OWNER, parentRunId?: string) {
  if (!await Workflow.get("wf")) { await Workflow.create({ id: "wf", user_id: "graph-owner", name: "Shared", graph: { nodes: [], edges: [] } }); }
  const job = await Job.create({ user_id: userId, workflow_id: "wf" });
  return registerRunTrace(userId, { kind: "workflow", sourceId: String(job.id), parentRunId, origin: "ui", parents: [] });
}
function span(traceId: string, spanId = "1234567890abcdef"): TraceRecord {
  return { trace_id: traceId, span_id: spanId, parent_span_id: null, name: "workflow.run", kind: "INTERNAL",
    start_time_ms: 1, end_time_ms: 5, duration_ms: 4, status: { code: "OK" },
    attributes: { "llm.request.messages": "A readable prompt", "llm.provider": "test", arbitrary: "private detail" },
    events: [{ id: `${spanId}:0`, name: "log", time_ms: 2, attributes: { "log.message": "hello private log", level: "info" } }], resource: {} };
}
async function appTrace(publicRun = false, applicationId?: string) {
  if (publicRun && !applicationId) {
    const app = await Application.create({ user_id: OWNER, document: JSON.stringify(createEmptyDocument()) });
    applicationId = String(app.id);
    await setApplicationBudget(applicationId, { period: "total", maxUsd: 1, maxInvocations: 10 });
  }
  const instance = await createAppInstance({ userId: OWNER, sourceId: "test:app", applicationId,
    snapshot: { document: { ...createEmptyDocument(), operations: [{ id: "op", name: "Run", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }] }, workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {} } });
  const reserved = await reserveAppRun({ userId: OWNER, instanceId: instance.id, operationId: "op", invocationId: "inv", origin: publicRun ? "public" : "ui", estimatedUsd: 0 });
  if (!reserved.allowed) { throw new Error(reserved.reason); }
  const trace = await registerRunTrace(OWNER, { id: reserved.run.id, kind: "app", sourceId: reserved.run.id, traceId: reserved.run.trace_id ?? undefined, origin: "ui", parents: [] });
  return { trace, instance, run: reserved.run };
}

describe("registered run trace persistence", () => {
  beforeEach(() => { initTestDb(); });
  it("requires owner persisted sources and keeps registered traces isolated", async () => {
    const run = await workflowTrace();
    expect(await getRegisteredRunTrace("foreign", run.trace_id)).toBeNull();
    expect(await getRunTrace(OWNER, run.id.slice(0, 12))).toMatchObject({ id: run.id });
    expect(await getRunTrace("foreign", run.id.slice(0, 12))).toBeNull();
    expect(await getRegisteredTrace(run.trace_id)).toMatchObject({ id: run.id });
    await expect(registerRunTrace("foreign", { kind: "workflow", sourceId: run.source_id, origin: "ui", parents: [] })).rejects.toThrow("Job not found");
    const job = await Job.create({ user_id: "foreign", workflow_id: "wf" });
    await expect(registerRunTrace("foreign", { kind: "workflow", sourceId: String(job.id), traceId: run.trace_id, origin: "ui", parents: [] })).rejects.toThrow("already registered");
    await expect(registerRunTrace(OWNER, { kind: "workflow", sourceId: run.source_id, traceId: "a".repeat(32), origin: "ui", parents: [] })).rejects.toThrow("another identity");
  });
  it("coalesces concurrent registration retries and rejects conflicting identities", async () => {
    const job = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    const input = { kind: "workflow" as const, sourceId: String(job.id), traceId: "a".repeat(32), origin: "ui" as const, parents: [] };
    const results = await Promise.all([registerRunTrace(OWNER, input), registerRunTrace(OWNER, input)]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(await getDb().select().from(runTraces)).toHaveLength(1);
    const next = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    const conflicting = await Promise.allSettled([
      registerRunTrace(OWNER, { ...input, sourceId: String(next.id), traceId: "b".repeat(32) }),
      registerRunTrace(OWNER, { ...input, sourceId: String(next.id), traceId: "c".repeat(32) })
    ]);
    expect(conflicting.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = conflicting.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason.code).toBe("conflict");
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("coalesces registration retries staggered by %i microtasks", async (delay) => {
    const job = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    const input = { kind: "workflow" as const, sourceId: job.id, traceId: "a".repeat(32), origin: "ui" as const, parents: [] };
    const first = registerRunTrace(OWNER, input);
    const retry = async () => {
      for (let index = 0; index < delay; index++) { await Promise.resolve(); }
      return registerRunTrace(OWNER, input);
    };
    const results = await Promise.all([first, retry()]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(await getDb().select().from(runTraces)).toHaveLength(1);
  });
  it("keeps concurrent execution-root assignments consistent with the app record", async () => {
    const { trace, run } = await appTrace();
    const results = await Promise.allSettled([
      setRunTraceRoot(OWNER, trace.id, "a".repeat(16)), setRunTraceRoot(OWNER, trace.id, "b".repeat(16))
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const winner = (await getRunTrace(OWNER, trace.id))?.root_span_id;
    expect((await getAppRun(OWNER, run.id))?.root_span_id).toBe(winner);
    if (!winner) { throw new Error("Root assignment missing"); }
    await setRunTraceRoot(OWNER, trace.id, winner);
  });
  it("reports prefix ambiguity only inside the caller's scope", async () => {
    const first = await Job.create({ user_id: OWNER, workflow_id: "wf" }); const second = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    for (const [index, job] of [first, second].entries()) { await registerRunTrace(OWNER, { id: `abcdefabcdef${String(index).padStart(20, "0")}`, kind: "workflow", sourceId: String(job.id), origin: "ui", parents: [] }); }
    await expect(getRunTrace(OWNER, "abcdefabcdef")).rejects.toThrow("ambiguous");
    expect(await getRunTrace("foreign", "abcdefabcdef")).toBeNull();
  });
  it("splits content, masks run secrets, and returns the same owner record", async () => {
    const run = await workflowTrace(); const record = span(run.trace_id);
    record.attributes["llm.request.messages"] = "hello oauth-secret-value";
    record.attributes["inline"] = "data:image/png;base64,QUJDREVGRw==";
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record }, { secretValues: new Set(["oauth-secret-value"]) });
    const [row] = await getDb().select().from(runSpans);
    expect(JSON.stringify(row?.metadata)).not.toContain("private");
    expect(JSON.stringify(row?.content)).toContain("hello [REDACTED:secret]");
    expect(JSON.stringify(row)).not.toContain("oauth-secret-value");
    expect(JSON.stringify(row)).not.toContain("QUJDREVGRw");
    const read = await listRunTraceRecords(OWNER, run.id);
    expect(read.records[0]?.record.attributes["llm.request.messages"]).toBe("hello [REDACTED:secret]");
    await expect(listRunTraceRecords("foreign", run.id)).rejects.toThrow("Run not found");
  });
  it("coalesces start, events, and repeated finalization with stable event ids", async () => {
    const run = await workflowTrace(); const record = span(run.trace_id);
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_started", record: { ...record, events: [] } });
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_event", record });
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record });
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record });
    const read = await listRunTraceRecords(OWNER, run.id);
    expect(read.resnapshot).toBe(true); expect(read.records).toHaveLength(1); expect(read.records[0]?.record.events).toHaveLength(1);
    expect(read.cursor).toBe(4);
    expect((await listRunTraceRecords(OWNER, run.id, { cursor: 4 })).records).toEqual([]);
  });
  it("shares an app trace with child work and propagates public origin", async () => {
    const { trace } = await appTrace(true);
    const child = await workflowTrace(OWNER, trace.id);
    expect(child.trace_id).toBe(trace.trace_id); expect(child.origin).toBe("public");
    await writeRunTraceUpdate(OWNER, child.id, { kind: "span_ended", record: span(trace.trace_id) });
    const [row] = await getDb().select().from(runSpans); expect(row?.content).toBeNull();
    expect(JSON.stringify((await listRunTraceRecords(OWNER, trace.id)).records)).not.toContain("private");
  });
  it("rejects wrong traces and overlapping spans attributed to different runs", async () => {
    const root = await workflowTrace(); const child = await workflowTrace(OWNER, root.id);
    await writeRunTraceUpdate(OWNER, root.id, { kind: "span_ended", record: span(root.trace_id) });
    await expect(writeRunTraceUpdate(OWNER, child.id, { kind: "span_ended", record: span(root.trace_id) })).rejects.toThrow("another run");
    await expect(writeRunTraceUpdate(OWNER, root.id, { kind: "span_ended", record: span("f".repeat(32)) })).rejects.toThrow("does not match");
  });
  it("preserves final root outcome after span and event caps", async () => {
    const run = await workflowTrace(); await setRunTraceRoot(OWNER, run.id, "1234567890abcdef");
    await getDb().update(runTraces).set({ span_count: TRACE_SPAN_LIMIT, event_count: TRACE_EVENT_LIMIT }).where(eq(runTraces.id, run.id));
    expect(await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: span(run.trace_id, "2234567890abcdef") })).toBeNull();
    const result = await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { ...span(run.trace_id), status: { code: "ERROR", message: "failure" } } });
    expect(result?.truncated).toBe(true); expect(result?.record.status.code).toBe("ERROR"); expect(result?.record.events).toEqual([]);
    await markRunTraceIncomplete(OWNER, run.trace_id, "database unavailable");
    expect((await listRunTraceRecords(OWNER, run.id)).records[0]?.incomplete).toBe(true);
  });
  it("persists SDK truncation markers into the run directory", async () => {
    const trace = await workflowTrace(); const record = span(trace.trace_id);
    record.attributes["nodetool.trace.truncated"] = true;
    record.attributes["nodetool.trace.dropped_events_count"] = 12;
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record });
    expect((await getRegisteredTrace(trace.trace_id))?.truncated).toBe(1);
    expect((await listRunTraceRecords(OWNER, trace.id)).records[0]?.truncated).toBe(true);
  });
  it("expires child copies on enclosing spans and blocks late content restoration", async () => {
    const { trace, run } = await appTrace(); const child = await workflowTrace(OWNER, trace.id);
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await eraseRunTraceParentContent(OWNER, { kind: "job", id: child.source_id });
    const expired = await listRunTraceRecords(OWNER, trace.id, { cursor: 1 });
    expect(expired.records).toHaveLength(1); expect(expired.records[0]?.content_expired).toBe(true);
    expect(expired.records[0]?.record.attributes["llm.request.messages"]).toBeUndefined();
    expect((await getAppRun(OWNER, run.id))?.snapshot).toBeNull();
    await setAppRunInputs(OWNER, run.id, { copied: "must not return" });
    expect((await getAppRun(OWNER, run.id))?.inputs).toBeNull();
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    expect((await getDb().select().from(runSpans))[0]?.content).toBeNull();
  });
  it("chat message and thread deletions erase copied history on ancestor calls", async () => {
    const thread = await Thread.create({ user_id: OWNER }); const first = await Message.create({ user_id: OWNER, thread_id: thread.id, content: "first" });
    const next = await Message.create({ user_id: OWNER, thread_id: thread.id, content: "next" });
    const trace = await registerRunTrace(OWNER, { kind: "chat", sourceId: String(next.id), origin: "ui", parents: [] });
    await registerRunTraceParents(OWNER, trace.id, [{ kind: "message", id: String(first.id) }]);
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await first.delete(); expect((await getRunTrace(OWNER, trace.id))?.content_expired).toBe(1);
    await thread.delete(); expect((await getDb().select().from(runSpans))[0]?.content).toBeNull();
  });
  it("expires implicit summary and provider-session copies when an older message is deleted", async () => {
    const thread = await Thread.create({ user_id: OWNER });
    const old = await Message.create({ user_id: OWNER, thread_id: thread.id, content: "private historical phrase" });
    const current = await Message.create({ user_id: OWNER, thread_id: thread.id, content: "Summary of private historical phrase" });
    const trace = await registerRunTrace(OWNER, { kind: "chat", sourceId: current.id, origin: "ui", parents: [] });
    expect(trace.parents).not.toContainEqual({ kind: "message", id: old.id });
    const record = span(trace.trace_id); record.attributes["llm.request.messages"] = "Summary of private historical phrase";
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record });
    await old.delete();
    expect((await getRunTrace(OWNER, trace.id))?.content_expired).toBe(1);
    expect(JSON.stringify(await listRunTraceRecords(OWNER, trace.id))).not.toContain("private historical phrase");
    expect(await Message.find(current.id)).not.toBeNull();
  });
  it("workflow-owner deletion removes content copied into another owner's run", async () => {
    const workflow = await Workflow.create({ user_id: "graph-owner", name: "Shared", graph: { nodes: [], edges: [] } });
    const job = await Job.create({ user_id: OWNER, workflow_id: workflow.id });
    const trace = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(job.id), origin: "ui", parents: [] });
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await workflow.delete(); expect((await getRunTrace(OWNER, trace.id))?.content_expired).toBe(1);
  });
  it("keeps concurrent source deletion and registration metadata-only", async () => {
    const job = await Job.create({ user_id: OWNER, workflow_id: "missing-saved-workflow" });
    const [result] = await Promise.allSettled([
      registerRunTrace(OWNER, { kind: "workflow", sourceId: String(job.id), origin: "ui", parents: [] }), job.delete()
    ]);
    expect(await Job.get(String(job.id))).toBeNull();
    if (result?.status !== "fulfilled") { throw new Error("Registration must reproduce the deletion race"); }
    const trace = result.value;
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    expect((await getRunTrace(OWNER, trace.id))?.content_expired).toBe(1);
    expect((await getDb().select().from(runSpans))[0]?.content).toBeNull();
  });
  it("checks declared shared workflow parents after concurrent deletion and late registration", async () => {
    const workflow = await Workflow.create({ user_id: "graph-owner", name: "Shared", graph: { nodes: [], edges: [] } });
    const { trace: app, run } = await appTrace();
    await writeRunTraceUpdate(OWNER, app.id, { kind: "span_ended", record: span(app.trace_id) });
    const job = await Job.create({ user_id: OWNER, workflow_id: workflow.id });
    const [result] = await Promise.allSettled([
      registerRunTrace(OWNER, { kind: "workflow", sourceId: String(job.id), parentRunId: app.id, origin: "ui", parents: [] }), workflow.delete()
    ]);
    if (result?.status !== "fulfilled") { throw new Error("Child registration must reproduce the deletion race"); }
    expect(await Job.get(String(job.id))).not.toBeNull();
    await writeRunTraceUpdate(OWNER, result.value.id, { kind: "span_ended", record: span(app.trace_id, "2234567890abcdef") });
    expect((await getRunTrace(OWNER, app.id))?.content_expired).toBe(1);
    expect((await getAppRun(OWNER, run.id))?.snapshot).toBeNull();
    expect((await getDb().select().from(runSpans)).every((row) => row.content === null)).toBe(true);
  });
  it("expires copied ancestor content when a thread disappears during chat registration", async () => {
    const thread = await Thread.create({ user_id: OWNER });
    const message = await Message.create({ user_id: OWNER, thread_id: thread.id, content: "copied text" });
    const { trace: app, run } = await appTrace();
    await writeRunTraceUpdate(OWNER, app.id, { kind: "span_ended", record: span(app.trace_id) });
    const [result] = await Promise.allSettled([
      registerRunTrace(OWNER, { kind: "chat", sourceId: String(message.id), parentRunId: app.id, origin: "ui", parents: [] }), thread.delete()
    ]);
    if (result?.status !== "fulfilled") { throw new Error("Chat registration must reproduce the deletion race"); }
    await writeRunTraceUpdate(OWNER, result.value.id, { kind: "span_ended", record: span(app.trace_id, "2234567890abcdef") });
    expect((await getRunTrace(OWNER, app.id))?.content_expired).toBe(1);
    expect((await getAppRun(OWNER, run.id))?.inputs).toBeNull();
    expect((await getDb().select().from(runSpans)).every((row) => row.content === null)).toBe(true);
  });
  it("allows frozen inline workflow graphs but expires missing declared saved parents", async () => {
    const { trace: app } = await appTrace();
    await writeRunTraceUpdate(OWNER, app.id, { kind: "span_ended", record: span(app.trace_id) });
    const previousCursor = (await listRunTraceRecords(OWNER, app.id)).cursor;
    const inlineJob = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    const inline = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(inlineJob.id), parentRunId: app.id, origin: "ui", parents: [] });
    expect(inline.parents.some((parent) => parent.kind === "workflow")).toBe(false);
    const savedJob = await Job.create({ user_id: OWNER, workflow_id: "wf" });
    const declared = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(savedJob.id), parentRunId: app.id, origin: "ui", parents: [{ kind: "workflow", id: "wf" }] });
    await writeRunTraceUpdate(OWNER, declared.id, { kind: "span_ended", record: span(app.trace_id, "2234567890abcdef") });
    expect((await getRunTrace(OWNER, app.id))?.content_expired).toBe(1);
    const expired = await listRunTraceRecords(OWNER, app.id, { cursor: previousCursor });
    expect(expired.records).toHaveLength(2);
    expect(expired.records.every((record) => record.content_expired)).toBe(true);
  });
  it("distinguishes standalone inline graphs from missing or shared saved workflows", async () => {
    const inlineJob = await Job.create({ user_id: OWNER, workflow_id: "inline:graph" });
    const inline = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(inlineJob.id), origin: "cli", parents: [], inlineWorkflow: true });
    await writeRunTraceUpdate(OWNER, inline.id, { kind: "span_ended", record: span(inline.trace_id) });
    expect((await getRunTrace(OWNER, inline.id))?.content_expired).toBe(0);
    const savedJob = await Job.create({ user_id: OWNER, workflow_id: "deleted:saved" });
    const saved = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(savedJob.id), origin: "cli", parents: [] });
    await writeRunTraceUpdate(OWNER, saved.id, { kind: "span_ended", record: span(saved.trace_id) });
    expect((await getRunTrace(OWNER, saved.id))?.content_expired).toBe(1);
    const shared = await Workflow.create({ id: "shared", user_id: "other", name: "Shared", graph: { nodes: [], edges: [] } });
    const sharedJob = await Job.create({ user_id: OWNER, workflow_id: shared.id });
    const sharedRun = await registerRunTrace(OWNER, { kind: "workflow", sourceId: String(sharedJob.id), origin: "cli", parents: [], inlineWorkflow: true });
    expect(sharedRun.parents).toContainEqual({ kind: "workflow", id: "shared" });
  });
  it("run and instance deletion prevent late writes without retaining content", async () => {
    const { trace, run, instance } = await appTrace();
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await deleteAppRun(OWNER, run.id); expect(await getRunTrace(OWNER, trace.id)).toBeNull();
    expect(await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) })).toBeNull();
    await deleteAppInstance(OWNER, instance.id); expect(await getRegisteredTrace(trace.trace_id)).toBeNull();
  });
  it("app deletion expires copied content", async () => {
    const app = await Application.create({ user_id: OWNER, document: JSON.stringify(createEmptyDocument()) }); const { trace } = await appTrace(false, String(app.id));
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await app.delete(); expect((await getDb().select().from(runSpans))[0]?.content).toBeNull();
  });
  it("updates authoritative late cost without reopening or rewriting terminal outcomes", async () => {
    const trace = await workflowTrace();
    await settleRunTrace(OWNER, trace.id, { status: "completed", costUsd: null });
    const first = await getRunTrace(OWNER, trace.id);
    await settleRunTrace(OWNER, trace.id, { status: "failed", error: "late error", costUsd: 0.25 });
    expect(await getRunTrace(OWNER, trace.id)).toMatchObject({ status: "completed", cost_usd: 0.25, error: null, ended_at: first?.ended_at });
  });
  it("prunes content independently before terminal records and leaves safe summaries", async () => {
    const trace = await workflowTrace(); const record = { ...span(trace.trace_id), status: { code: "ERROR" as const, message: "failed for person@example.com" } };
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record }); await settleRunTrace(OWNER, trace.id, { status: "failed", error: record.status.message });
    await getDb().update(runTraces).set({ started_at: "2020-01-01", ended_at: "2020-01-02" }).where(eq(runTraces.id, trace.id));
    await pruneRunTraces(OWNER, "2021-01-01", "2019-01-01");
    const read = await listRunTraceRecords(OWNER, trace.id);
    expect(read.records[0]?.content_expired).toBe(true); expect(read.records[0]?.record.status.message).toContain("[REDACTED:email]");
    expect(JSON.stringify(read)).not.toContain("A readable prompt");
    await pruneRunTraces(OWNER, "2021-01-01", "2021-01-01"); expect(await getRunTrace(OWNER, trace.id)).toBeNull();
  });
  it("prunes stuck running trace and app content while preserving active records", async () => {
    const { trace, run } = await appTrace();
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    await getDb().update(runTraces).set({ started_at: "2020-01-01" }).where(eq(runTraces.id, trace.id));
    await getDb().update(applicationInvocations).set({ created_at: "2020-01-01" }).where(eq(applicationInvocations.id, run.id));
    await pruneAppRuns(OWNER, "2021-01-01", "2021-01-01");
    expect(await getAppRun(OWNER, run.id)).toMatchObject({ status: "running", content_expired: 1, snapshot: null, inputs: null });
    await pruneRunTraces(OWNER, "2021-01-01", "2021-01-01");
    expect(await getRunTrace(OWNER, trace.id)).toMatchObject({ status: "running", content_expired: 1 });
    expect(JSON.stringify(await listRunTraceRecords(OWNER, trace.id))).not.toContain("A readable prompt");
  });
  it("exports owner content and erases both trace tables with the account", async () => {
    const trace = await workflowTrace(); await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: span(trace.trace_id) });
    const exported = await exportPersonalData(OWNER); expect(exported.tables.nodetool_run_spans?.rowCount).toBe(1);
    expect(JSON.stringify(exported.tables.nodetool_run_spans)).toContain("A readable prompt");
    await erasePersonalData(OWNER); expect(await getRegisteredTrace(trace.trace_id)).toBeNull(); expect(await getDb().select().from(runSpans)).toEqual([]);
  });
  it("binds the execution root to the app record and settles preparation failures", async () => {
    const { trace, run } = await appTrace();
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: { ...span(trace.trace_id), name: "app.run" } }, { isRoot: true });
    expect((await getAppRun(OWNER, run.id))?.root_span_id).toBe("1234567890abcdef");
    expect((await getRunTrace(OWNER, trace.id))?.root_span_id).toBe("1234567890abcdef");
    await settleAppRun(OWNER, run.id, { status: "failed", error: "preparation failed", actualUsd: 0 });
    expect(await getRunTrace(OWNER, trace.id)).toMatchObject({ status: "failed", cost_usd: 0 });
  });
  it("suppresses tainted app history while retaining owner working state", async () => {
    const { trace, run, instance } = await appTrace();
    await settleAppRun(OWNER, run.id, { status: "completed", outputs: { result: "email body" }, contentSuppressed: true });
    expect(await getAppRun(OWNER, run.id)).toMatchObject({ outputs: null, inputs: null, snapshot: null, documents: null, content_expired: 1 });
    expect((await getAppInstance(OWNER, instance.id))?.variables.result).toBe("email body");
    expect((await getRunTrace(OWNER, trace.id))?.content_expired).toBe(1);
  });
  it("reports string caps and omits protected errors from both span and run summaries", async () => {
    const trace = await workflowTrace(); const record = span(trace.trace_id);
    record.attributes["llm.request.messages"] = "readable text ".repeat(2_000);
    const result = await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record });
    expect(result?.truncated).toBe(true);
    const protectedRecord = { ...record, status: { code: "ERROR" as const, message: "third-party email body" } };
    await writeRunTraceUpdate(OWNER, trace.id, { kind: "span_ended", record: protectedRecord }, { contentSuppressed: true });
    await settleRunTrace(OWNER, trace.id, { status: "failed", error: protectedRecord.status.message, contentSuppressed: true });
    expect((await getRunTrace(OWNER, trace.id))?.error).toBeNull();
    expect(JSON.stringify(await listRunTraceRecords(OWNER, trace.id))).not.toContain("third-party email body");
  });
  it("masks short resolved secrets without corrupting immutable tracing identity", () => {
    const input = span("a".repeat(32), "a".repeat(16));
    input.parent_span_id = "a".repeat(16); input.events[0]!.id = "a:event:1";
    input.attributes.text = "a private payload";
    const clean = sanitizeRunTraceRecord(input, { secretValues: ["a"] });
    expect(clean.trace_id).toBe(input.trace_id); expect(clean.span_id).toBe(input.span_id);
    expect(clean.parent_span_id).toBe(input.parent_span_id); expect(clean.events[0]?.id).toBe("a:event:1");
    expect(clean.attributes.text).toBe("[REDACTED:secret] priv[REDACTED:secret]te p[REDACTED:secret]ylo[REDACTED:secret]d");
  });
  it("removes unknown content channels and media in public and suppressed copies", () => {
    const input = { ...span("a".repeat(32)), name: "private custom name", status: { code: "ERROR" as const, message: "private error" } };
    const clean = sanitizeRunTraceRecord(input, { public: true });
    expect(clean.name).toBe("content.span"); expect(clean.status.message).toBeUndefined(); expect(JSON.stringify(clean)).not.toContain("private");
    expect(JSON.stringify(sanitizeRunTraceRecord(input, { contentSuppressed: true }))).not.toContain("A readable prompt");
  });
});
