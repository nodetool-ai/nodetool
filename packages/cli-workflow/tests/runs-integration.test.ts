import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, createAppInstance, initDb, migrateSqliteDb, getRawDb, MigrationRunner, SQLiteMigrationAdapter, Job, registerRunTrace, writeRunTraceUpdate } from "@nodetool-ai/models";
import { getRun, getRunLogs, getRunTrace, listRuns } from "@nodetool-ai/execution";
import { executeAppOperation } from "@nodetool-ai/execution/service";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { ProcessingContext, flushTelemetry } from "@nodetool-ai/runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { GetRunResult, GetRunTraceResult, RunUpdatesResult } from "@nodetool-ai/protocol";

const cli = fileURLToPath(new URL("../dist/nodetool.js", import.meta.url));
let directory: string;
let databasePath: string;
let runId: string;
let foreignId: string;
let failedSpanId: string;
let env: NodeJS.ProcessEnv;
function command(args: string[]): string {
  return execFileSync(process.execPath, [cli, "runs", ...args, "--json"], { env, encoding: "utf8", timeout: 30_000 });
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "nodetool-runs-cli-")); databasePath = join(directory, "runs.sqlite");
  await closeDb(); await migrateSqliteDb(databasePath); initDb(databasePath);
  env = { ...process.env, DB_PATH: databasePath, DATABASE_URL: "", NODETOOL_API_URL: "", LOG_LEVEL: "ERROR", NODETOOL_TRACE_FILE: "", NODETOOL_TRACE_STDOUT: "", OTEL_EXPORTER_OTLP_ENDPOINT: "" };
  const instance = await createAppInstance({ userId: "1", sourceId: "cli-failure-fixture", snapshot: {
    document: { schemaVersion: 4, ui: { content: [], root: { props: {} } }, resources: [], variables: [],
      operations: [{ id: "fail", name: "Fail", workflowId: "", target: { kind: "script", scriptId: "script", scriptVersion: 1 }, policy: "parallel", inputs: {}, outputs: {} }] },
    workflow_graphs: {}, script_documents: { script: { ...emptyJsScriptDocument(), code: 'console.error("deliberate CLI failure");\nthrow new Error("deliberate CLI failure");\nreturn null;' } }
  } });
  const result = await executeAppOperation({ userId: "1", instanceId: instance.id, operationId: "fail", invocationId: "cli-failure", origin: "debug",
    context: new ProcessingContext({ jobId: "cli-fixture", userId: "1" }), registry: new NodeRegistry(),
    scriptRunner: (context, input) => createJsScriptAppRunner("1", { context })(input) });
  await flushTelemetry(); runId = result.run.id;
  expect(result.run.status).toBe("failed"); expect(result.run.error).toContain("deliberate CLI failure");
  const tree = await getRunTrace("1", runId);
  const script = tree.nodes.find(({ record }) => record.name === "script.run");
  expect(script?.record.status.code).toBe("ERROR");
  if (!script) { throw new Error("Failure fixture did not record its script span"); }
  failedSpanId = script.record.span_id;
  for (let index = 0; index < 2; index++) {
    const start = Date.now();
    await writeRunTraceUpdate("1", runId, { kind: "span_ended", record: {
      trace_id: result.run.trace_id, span_id: `00000000000000a${index + 1}`, parent_span_id: result.run.root_span_id,
      name: "node.process", kind: "INTERNAL", start_time_ms: start, end_time_ms: start + 1, duration_ms: 1,
      status: { code: "OK" }, attributes: {}, resource: {}, events: Array.from({ length: 128 }, (_, event) => ({
        id: `fixture-${index}-${event}`, name: "log", time_ms: start + event, attributes: { level: "info", source: "fixture" }
      }))
    } });
  }
  foreignId = `${runId.slice(0, 12)}${runId.slice(12).split("").map((value) => value === "a" ? "b" : "a").join("")}`;
  await Job.create<Job>({ id: "foreign-cli-job", user_id: "foreign", status: "running" });
  await registerRunTrace("foreign", { id: foreignId, kind: "workflow", sourceId: "foreign-cli-job", origin: "cli", parents: [] });
}, 30_000);
afterAll(async () => { await closeDb(); if (directory) { rmSync(directory, { recursive: true, force: true }); } });

describe("runs CLI against persisted app execution", () => {
  it("migrates a fresh local database before listing runs", async () => {
    const freshPath = join(directory, "fresh.sqlite");
    const result = spawnSync(process.execPath, [cli, "runs", "list", "--json"], { env: { ...env, DB_PATH: freshPath }, encoding: "utf8", timeout: 30_000 });
    expect(result.status, result.stderr).toBe(0); expect(JSON.parse(result.stdout)).toEqual({ runs: [], next_cursor: null });
    await closeDb();
    try {
      initDb(freshPath);
      expect(getRawDb().prepare("SELECT name FROM sqlite_master WHERE name = 'nodetool_run_traces'").get()).toBeDefined();
      expect(getRawDb().prepare("PRAGMA table_info(nodetool_jobs)").all()).toContainEqual(expect.objectContaining({ name: "has_run_trace" }));
    } finally { await closeDb(); initDb(databasePath); }
  });
  it("migrates an older tracked local database and preserves its jobs", async () => {
    const olderPath = join(directory, "older.sqlite"); await closeDb();
    try {
      initDb(olderPath);
      await new MigrationRunner(new SQLiteMigrationAdapter(getRawDb())).migrate({ target: "20261004_000000" });
      expect(getRawDb().prepare("PRAGMA table_info(nodetool_jobs)").all()).not.toContainEqual(expect.objectContaining({ name: "has_run_trace" }));
      getRawDb().prepare("INSERT INTO nodetool_jobs (id, user_id, workflow_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run("legacy-cli-job", "1", "legacy-workflow", "completed", "2026-01-01", "2026-01-01");
      await closeDb();
      const result = spawnSync(process.execPath, [cli, "runs", "list", "--json"], { env: { ...env, DB_PATH: olderPath }, encoding: "utf8", timeout: 30_000 });
      expect(result.status, result.stderr).toBe(0); expect(JSON.parse(result.stdout)).toEqual({ runs: [], next_cursor: null });
      initDb(olderPath);
      expect(getRawDb().prepare("SELECT id, has_run_trace FROM nodetool_jobs WHERE id = ?").get("legacy-cli-job"))
        .toEqual({ id: "legacy-cli-job", has_run_trace: 0 });
      expect(getRawDb().prepare("SELECT version FROM _nodetool_migrations WHERE version = '20261004_000002'").get()).toBeDefined();
    } finally { await closeDb(); initDb(databasePath); }
  });
  it("shows the causal failed span through an owner-scoped exact 12-character ID", async () => {
    const shown = JSON.parse(command(["show", runId.slice(0, 12)])) as GetRunResult;
    expect(shown).toEqual(await getRun("1", runId));
    expect(shown.run.id).toBe(runId); expect(shown.run.status).toBe("failed");
    expect(shown.summary.first_failed_span_id).toBe(failedSpanId);
    expect(shown.summary.failure_path.map((span) => span.name)).toEqual(["app.run", "script.run"]);
    expect(shown.summary.failure_path.at(-1)?.span_id).toHaveLength(16);
    expect(shown.run.app).not.toHaveProperty("inputs"); expect(shown.run.app).not.toHaveProperty("outputs");
    const withContent = JSON.parse(command(["show", runId, "--include-content"])) as GetRunResult;
    expect(withContent).toEqual(await getRun("1", runId, { include_content: true }));
    expect(withContent.run.app).toHaveProperty("inputs"); expect(withContent.run.app).toHaveProperty("outputs");
    const denied = spawnSync(process.execPath, [cli, "runs", "show", foreignId, "--json"], { env, encoding: "utf8", timeout: 30_000 });
    expect(denied.status).toBe(1); expect(JSON.parse(denied.stdout).error).toMatch(/not found/i);
  });
  it("returns the same bounded list, trace and logs as the shared service", async () => {
    expect(JSON.parse(command(["list", "--kind", "app", "--status", "failed", "--origin", "debug"])))
      .toEqual(await listRuns("1", { kind: "app", status: "failed", origin: "debug" }));
    const trace = JSON.parse(command(["trace", runId, "--focus", failedSpanId, "--include-content"])) as GetRunTraceResult;
    expect(trace).toEqual(await getRunTrace("1", runId, { focus_span_id: failedSpanId, include_content: true }));
    expect(JSON.parse(command(["logs", runId, "--include-content"]))).toEqual(await getRunLogs("1", runId, { include_content: true }));
  });
  it("drains terminal snapshots as NDJSON with stable event IDs and a resumable cursor", () => {
    const frames = command(["tail", runId, "--limit", "500", "--include-content"]).trim().split("\n").map((line) => JSON.parse(line));
    const spans = frames.filter((frame) => frame.type === "span") as Array<RunUpdatesResult["records"][number]>;
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(frames.some((frame) => frame.type === "resnapshot" && frame.resnapshot_required === true)).toBe(true);
    const events = frames.filter((frame) => frame.type === "event");
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((frame) => frame.event.id.startsWith("fixture-")).length).toBe(256);
    expect(new Set(events.map((frame) => `${frame.span_id}:${frame.event.id}`)).size).toBe(events.length);
    const terminal = frames.at(-1); expect(terminal.type).toBe("terminal"); expect(terminal.run.status).toBe("failed");
    const resumed = command(["tail", runId, "--cursor", String(terminal.cursor)]).trim().split("\n").map((line) => JSON.parse(line));
    expect(resumed.map((frame) => frame.type)).toEqual(["resnapshot", "terminal"]);
  });
});
