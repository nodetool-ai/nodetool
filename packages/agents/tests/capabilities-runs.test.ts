import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Job, Workflow, initTestDb, registerRunTrace, setRunTraceRoot,
  writeRunTraceUpdate, settleRunTrace, eraseRunTraceParentContent, deleteRunTrace,
  createAppInstance, reserveAppRun, settleAppRun, Application, setApplicationBudget
} from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { getRun, getRunTrace, getRunLogs, listRuns } from "@nodetool-ai/execution";
import type { TraceRecord } from "@nodetool-ai/protocol";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { module as runsModule } from "../src/capabilities/runs.js";
import { capabilityModuleIssues, loadCapabilityModule } from "../src/capabilities/registry.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { compactResourceIds } from "../src/codeact/compact-ids.js";

const OWNER = "runs-capability-owner";
const ROOT_SPAN = "1111222233334444";
const FAILED_SPAN = "5555666677778888";
const context = (owner = OWNER) => new ProcessingContext({ userId: owner, jobId: "runs-test" });
const capabilityRun = (owner = OWNER) => createCapabilityRun({ context: context(owner), gate: UNGATED });

async function fixture(withSpans = true) {
  const workflow = await Workflow.create<Workflow>({ user_id: OWNER, name: "Fixture", graph: { nodes: [], edges: [] } });
  const job = await Job.create<Job>({ user_id: OWNER, workflow_id: workflow.id, status: "failed", logs: [{ message: "legacy content must not return" }] });
  const run = await registerRunTrace(OWNER, { kind: "workflow", sourceId: job.id, origin: "ui", parents: [] });
  if (withSpans) {
    await setRunTraceRoot(OWNER, run.id, ROOT_SPAN);
    const root: TraceRecord = {
      trace_id: run.trace_id, span_id: ROOT_SPAN, parent_span_id: null,
      name: "workflow.run", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 10,
      duration_ms: 9, status: { code: "ERROR" }, attributes: {}, resource: {}, events: []
    };
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: root }, { isRoot: true });
    await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: {
      ...root, span_id: FAILED_SPAN, parent_span_id: ROOT_SPAN, name: "tool.call",
      start_time_ms: 2, end_time_ms: 8, duration_ms: 6,
      status: { code: "ERROR", message: "Missing binding" },
      attributes: { "tool.arguments": "recorded argument", "tool.name": "fixture_tool" },
      events: [1, 2, 3].map((index) => ({ id: `event-${index}`, name: "console", time_ms: index + 2,
        attributes: { "log.level": "error", "log.source": "script", "console.output": `stored ${index}` } }))
    } });
  }
  await settleRunTrace(OWNER, run.id, { status: "failed", error: "Missing binding" });
  return { run, job, workflow };
}

async function appFixture(origin: "ui" | "public" = "ui") {
  const application = origin === "public" ? await Application.create<Application>({ user_id: OWNER }) : undefined;
  if (application) { await setApplicationBudget(application.id, { period: "total", maxUsd: 1, maxInvocations: 1 }); }
  const instance = await createAppInstance({ userId: OWNER, applicationId: application?.id, sourceId: "inputs-fixture", snapshot: {
    document: { schemaVersion: 4, resources: [], variables: [], ui: { root: { props: {} }, content: [] },
      operations: [{ id: "op", name: "Operation", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }] },
    workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {}
  } });
  const reservation = await reserveAppRun({ userId: OWNER, instanceId: instance.id, operationId: "op",
    invocationId: `app-${origin}`, origin, inputs: { prompt: "saved owner input" } });
  if (!reservation.allowed) { throw new Error(reservation.reason); }
  const run = await registerRunTrace(OWNER, { kind: "app", sourceId: reservation.run.id, origin, parents: [] });
  await settleAppRun(OWNER, run.id, { status: "completed", outputs: { answer: "saved owner output" } });
  await settleRunTrace(OWNER, run.id, { status: "completed" });
  return run;
}

function session(owner = OWNER) {
  const ctx = context(owner);
  const tools = getAllMcpTools().filter((tool) => ["list_runs", "get_run", "get_run_trace", "get_run_logs", "await_run"].includes(tool.name));
  const run = createCapabilityRun({ context: ctx, gate: UNGATED });
  return createChatCodeActSession({
    context: ctx, tools: tools.map((tool) => tool.toProviderTool()), capabilityRun: run,
    executeTool: async (call) => {
      const tool = tools.find((entry) => entry.name === call.name);
      if (!tool) { throw new Error(`Unknown tool ${call.name}`); }
      return tool.process(ctx, call.args);
    }
  });
}

describe("runs capabilities and CodeAct adapters", () => {
  beforeEach(() => { initTestDb(); });

  it("registers one drift-clean read module on the MCP catalog", async () => {
    expect(await loadCapabilityModule("runs")).toBe(runsModule);
    expect(capabilityModuleIssues("runs", runsModule)).toEqual([]);
    expect(runsModule.exports.every((entry) => entry.spec.category === "read")).toBe(true);
    expect(getAllMcpTools().map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_runs", "get_run", "get_run_trace", "get_run_logs", "await_run"
    ]));
  });

  it("lists only owned runs with the same filters as the shared service", async () => {
    const { run } = await fixture();
    const listed = await capabilityRun().invoke("list_runs", { kind: "workflow", status: "failed" });
    expect(listed).toEqual(compactResourceIds(await listRuns(OWNER, { kind: "workflow", status: "failed" })));
    expect(listed).toMatchObject({ runs: [{ id: run.id.slice(0, 12), trace_id: run.trace_id }] });
    expect(await capabilityRun("foreign").invoke("list_runs", { kind: "workflow" })).toMatchObject({ runs: [] });
  });

  it("awaits an owned failed run as readable terminal data at the capability boundary", async () => {
    const { run } = await fixture();
    const settled = await capabilityRun().invoke("await_run", { run_id: run.id.slice(0, 12), timeout_ms: 1 });
    expect(settled).toEqual(compactResourceIds(await getRun(OWNER, run.id)));
    expect(settled).toMatchObject({ run: { id: run.id.slice(0, 12), status: "failed", trace_id: run.trace_id } });
    await expect(capabilityRun("foreign").invoke("await_run", { run_id: run.id.slice(0, 12), timeout_ms: 1 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("reads a failed run through real execute_code with upstream compact ids and full OTel ids", async () => {
    const { run } = await fixture();
    const codeact = session();
    expect(codeact.providerTool.name).toBe("execute_code");
    const observation = JSON.parse(await codeact.executeAction({ code: `
      const page = await nodetool.runs.list({kind: "workflow", status: "failed"});
      const id = page.runs[0].id;
      const summary = await nodetool.runs.get(id);
      const span = summary.summary.first_failed_span_id;
      const trace = await nodetool.runs.trace(id, {focus_span_id: span, include_content: true});
      const logs = await nodetool.runs.logs(id, {span_id: span, include_content: true});
      const settled = await nodetool.runs.wait(id, {timeout_ms: 1});
      return {id, summary, trace, logs, settled};
    ` }));
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(observation.result.id).toBe(run.id.slice(0, 12));
    const summary = await getRun(OWNER, run.id);
    expect(observation.result.summary).toEqual(compactResourceIds(summary));
    expect(observation.result.settled).toEqual(compactResourceIds(summary));
    expect(observation.result.summary.run.status).toBe("failed");
    expect(observation.result.summary.run.trace_id).toBe(run.trace_id);
    expect(observation.result.summary.summary.first_failed_span_id).toBe(FAILED_SPAN);
    expect(observation.result.trace).toEqual(compactResourceIds(await getRunTrace(OWNER, run.id, { focus_span_id: FAILED_SPAN, include_content: true })));
    expect(observation.result.logs).toEqual(compactResourceIds(await getRunLogs(OWNER, run.id, { span_id: FAILED_SPAN, include_content: true })));
  });

  it("mounts the runs capability import and refuses foreign owner reads", async () => {
    const { run } = await fixture();
    const own = JSON.parse(await session().executeAction({ code: `
      import { get_run } from "@nodetool-ai/sandbox-nodetool/runs";
      return await get_run({run_id: "${run.id.slice(0, 12)}"});
    ` }));
    expect(own.ok).toBe(true);
    expect(own.result.run.trace_id).toBe(run.trace_id);
    const foreign = JSON.parse(await session("foreign").executeAction({ code: `return await nodetool.runs.get("${run.id.slice(0, 12)}");` }));
    expect(foreign.ok).toBe(false);
    expect(foreign.error).toMatch(/not found/i);
  });

  it("reads saved app inputs and outputs only on an explicit execute_code content request", async () => {
    const run = await appFixture();
    const observation = JSON.parse(await session().executeAction({ code: `
      const page = await nodetool.runs.list({kind: "app"});
      const id = page.runs[0].id;
      return {summary: await nodetool.runs.get(id), content: await nodetool.runs.get(id, {include_content: true})};
    ` }));
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(observation.result.summary.run.app).not.toHaveProperty("inputs");
    expect(observation.result.summary.run.app).not.toHaveProperty("outputs");
    expect(observation.result.content.run).toMatchObject({ id: run.id.slice(0, 12), app: {
      inputs: { prompt: "saved owner input" }, outputs: { answer: "saved owner output" } } });
    expect(observation.result.content).toEqual(compactResourceIds(await getRun(OWNER, run.id, { include_content: true })));
    const foreign = JSON.parse(await session("foreign").executeAction({ code: `return await nodetool.runs.get("${run.id.slice(0, 12)}", {include_content: true});` }));
    expect(foreign.ok).toBe(false);
    expect(foreign.error).toMatch(/not found/i);
  });

  it("keeps public and expired app snapshots excluded at the execute_code boundary", async () => {
    const expired = await appFixture();
    await eraseRunTraceParentContent(OWNER, { kind: "app_run", id: expired.id });
    const visitor = await appFixture("public");
    const observation = JSON.parse(await session().executeAction({ code: `
      return {expired: await nodetool.runs.get("${expired.id.slice(0, 12)}", {include_content: true}),
        visitor: await nodetool.runs.get("${visitor.id.slice(0, 12)}", {include_content: true})};
    ` }));
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(observation.result.expired).toMatchObject({ run: { app: { inputs: null, outputs: null } }, summary: { content_expired: true } });
    expect(observation.result.visitor).toMatchObject({ run: { app: { inputs: null, outputs: null } }, summary: { content_state: "public" } });
    expect(JSON.stringify(observation)).not.toContain("saved owner");
  });

  it("rejects shortened span ids and out-of-bounds limits at the capability boundary", async () => {
    const { run } = await fixture();
    expect(await capabilityRun().invoke("get_run_trace", { run_id: run.id, focus_span_id: FAILED_SPAN.slice(0, 12) })).toHaveProperty("error", "invalid_tool_arguments");
    expect(await capabilityRun().invoke("get_run_logs", { run_id: run.id, limit: 501 })).toHaveProperty("error", "invalid_tool_arguments");
  });

  it("reads stored job-log tails rather than legacy copies", async () => {
    const { run, job } = await fixture();
    const tail = await capabilityRun().invoke("get_job_logs", { job_id: job.id.slice(0, 12), limit: 2 });
    expect(tail).toMatchObject({ job_id: job.id, run_id: run.id, total_logs: 3, content_expired: false });
    expect(tail).toHaveProperty("logs", [
      expect.objectContaining({ attributes: expect.objectContaining({ "console.output": "stored 2" }) }),
      expect.objectContaining({ attributes: expect.objectContaining({ "console.output": "stored 3" }) })
    ]);
    expect(JSON.stringify(tail)).not.toContain("legacy content");
  });

  it("does not restore legacy content for empty or expired registered traces", async () => {
    const empty = await fixture(false);
    expect(await capabilityRun().invoke("get_job_logs", { job_id: empty.job.id })).toMatchObject({ run_id: empty.run.id, logs: [] });
    const populated = await fixture();
    await eraseRunTraceParentContent(OWNER, { kind: "job", id: populated.job.id });
    const expired = await capabilityRun().invoke("get_job_logs", { job_id: populated.job.id });
    expect(expired).toMatchObject({ content_expired: true, content_state: "expired" });
    expect(JSON.stringify(expired)).not.toContain("legacy content");
    expect(JSON.stringify(expired)).not.toContain("stored 1");
  });

  it("keeps legacy logs only for jobs that predate trace registration", async () => {
    const job = await Job.create<Job>({ user_id: OWNER, workflow_id: "old-workflow", logs: [{ message: "legacy" }] });
    expect(await capabilityRun().invoke("get_job_logs", { job_id: job.id.slice(0, 12) })).toMatchObject({ logs: [{ message: "legacy" }], total_logs: 1 });
    expect(await capabilityRun("foreign").invoke("get_job_logs", { job_id: job.id })).toHaveProperty("error");
  });

  it("does not restore legacy job copies after a recorded trace is deleted", async () => {
    const { run, job } = await fixture();
    await deleteRunTrace(OWNER, run.id);
    const erased = await capabilityRun().invoke("get_job_logs", { job_id: job.id });
    expect(erased).toMatchObject({ logs: [], total_logs: 0, job_error: null, content_state: "expired", content_expired: true });
    expect(JSON.stringify(erased)).not.toContain("legacy content");
  });

  it("rechecks trace history when deletion retires the directory after the first job read", async () => {
    const { run, job } = await fixture();
    const find = Job.find.bind(Job);
    const firstRead = vi.spyOn(Job, "find").mockImplementationOnce(async (userId, jobId) => {
      const stale = await find(userId, jobId);
      if (!stale) { throw new Error("Missing fixture job"); }
      stale.has_run_trace = 0;
      await deleteRunTrace(OWNER, run.id);
      return stale;
    });
    try {
      expect(await capabilityRun().invoke("get_job_logs", { job_id: job.id })).toMatchObject({ logs: [], content_expired: true });
    } finally { firstRead.mockRestore(); }
  });
});
