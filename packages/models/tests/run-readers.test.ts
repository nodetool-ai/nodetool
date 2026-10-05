import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, getDb } from "../src/db.js";
import { runTraces, runSpans } from "../src/schema/run-traces.js";
import { resolveRunReader, queryRunReaders, queryRunReaderSpans } from "../src/run-readers.js";
import { Job } from "../src/job.js";
import { registerRunTrace, deleteRunTrace } from "../src/run-trace.js";
import { eq } from "drizzle-orm";
import { jobs } from "../src/schema/jobs.js";

const OWNER = "reader-owner";
async function directory(id: string, source: string, parents: Array<{ kind: "workflow" | "instance" | "app" | "thread"; id: string }> = []) {
  await getDb().insert(runTraces).values({ id, user_id: OWNER, kind: "workflow", source_id: source, canonical_root_id: id, trace_id: id, origin: "ui", started_at: "2026-01-01T00:00:00.000Z", parents });
}
describe("bounded run reader persistence queries", () => {
  beforeEach(() => { initTestDb(); });
  it("rejects ambiguity across source and directory namespaces", async () => {
    await directory("a".repeat(32), "b".repeat(32));
    await directory("b".repeat(32), "c".repeat(32));
    await expect(resolveRunReader(OWNER, "b".repeat(32))).rejects.toMatchObject({ code: "conflict" });
    expect(await resolveRunReader("foreign", "b".repeat(32))).toBeNull();
  });
  it("checks every matching compact parent including multiple parents on one run", async () => {
    const prefix = "aabbccddeeff";
    await directory("1".repeat(32), "2".repeat(32), [
      { kind: "workflow", id: `${prefix}${"1".repeat(20)}` }, { kind: "workflow", id: `${prefix}${"2".repeat(20)}` }
    ]);
    await expect(queryRunReaders(OWNER, { workflow_id: prefix })).rejects.toMatchObject({ code: "conflict" });
    expect(await queryRunReaders(OWNER, { workflow_id: `${prefix}${"1".repeat(20)}` })).toHaveLength(1);
    await expect(queryRunReaders("foreign", { workflow_id: prefix })).rejects.toMatchObject({ code: "not_found" });
  });
  it("filters each parent kind and preserves full trace and span ids", async () => {
    const prefix = "aabbccddeeff"; const id = `${prefix}${"1".repeat(20)}`;
    await directory("1".repeat(32), "2".repeat(32), [{ kind: "app", id }, { kind: "instance", id }, { kind: "thread", id }]);
    for (const filter of [{ app_id: prefix }, { instance_id: prefix }, { thread_id: prefix }]) { expect(await queryRunReaders(OWNER, filter)).toHaveLength(1); }
    const run = await resolveRunReader(OWNER, "1".repeat(12)); if (!run) { throw new Error("Fixture absent"); }
    const spanId = "3".repeat(16);
    await getDb().insert(runSpans).values({ id: "span", user_id: OWNER, run_id: run.id, trace_id: run.trace_id, span_id: spanId, cursor: 1, update_kind: "span_ended",
      metadata: { trace_id: run.trace_id, span_id: spanId, parent_span_id: null, name: "workflow.run", kind: "INTERNAL", start_time_ms: 0, end_time_ms: 1, duration_ms: 1, status: { code: "OK" }, attributes: {}, events: [], resource: {} }, content: { attributes: { private: "owner content" } } });
    const metadata = await queryRunReaderSpans(OWNER, run);
    expect(metadata[0]).toMatchObject({ trace_id: run.trace_id, span_id: spanId, content: null, has_content: true });
    expect((await queryRunReaderSpans(OWNER, run, { includeContent: true, spanIds: [spanId] }))[0]?.content).toEqual({ attributes: { private: "owner content" } });
    expect(await queryRunReaderSpans("foreign", run, { includeContent: true })).toEqual([]);
    expect(await queryRunReaderSpans(OWNER, run, { spanIds: [] })).toEqual([]);
  });
  it("keeps the trace provenance marker through stale job finalization and root deletion", async () => {
    const stale = await Job.create({ user_id: OWNER, workflow_id: "inline", logs: [{ message: "Legacy private log" }] });
    expect(stale.has_run_trace).toBe(0);
    const run = await registerRunTrace(OWNER, { kind: "workflow", sourceId: stale.id, inlineWorkflow: true, origin: "ui", parents: [] });
    stale.markCompleted(); await stale.save();
    expect((await Job.get(stale.id))?.has_run_trace).toBe(1);
    // Older phase 2 records may need retrofit before a root directory disappears.
    const child = await Job.create({ user_id: OWNER, workflow_id: "inline" });
    await registerRunTrace(OWNER, { kind: "workflow", sourceId: child.id, inlineWorkflow: true, parentRunId: run.id, origin: "ui", parents: [] });
    await getDb().update(jobs).set({ has_run_trace: 0 }).where(eq(jobs.id, child.id));
    await deleteRunTrace(OWNER, run.id);
    expect((await Job.get(stale.id))?.has_run_trace).toBe(1);
    expect((await Job.get(child.id))?.has_run_trace).toBe(1);
    expect(await resolveRunReader(OWNER, child.id)).toBeNull();
    await child.save(); expect((await Job.get(child.id))?.has_run_trace).toBe(1);
  });
});
