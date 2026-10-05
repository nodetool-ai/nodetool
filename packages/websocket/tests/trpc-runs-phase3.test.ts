import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, Job, Workflow, Thread, Message, registerRunTrace, writeRunTraceUpdate, settleRunTrace, createAppInstance, reserveAppRun, setAppRunInputs } from "@nodetool-ai/models";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { PythonStdioBridge } from "@nodetool-ai/runtime";
import { listRuns, getRun, getRunTrace, getRunLogs, readRunUpdates } from "@nodetool-ai/execution";
import { appRouter } from "../src/trpc/router.js";
import type { Context } from "../src/trpc/context.js";

const OWNER = "runs-api-owner";
function context(userId: string | null = OWNER): Context {
  return { userId, registry: new NodeRegistry(), pythonBridge: new PythonStdioBridge(), apiOptions: {}, getPythonBridgeReady: () => false };
}
async function register(kind: "app" | "workflow" | "chat") {
  let sourceId: string;
  if (kind === "workflow") {
    const workflow = await Workflow.create({ user_id: OWNER, name: "Fixture", graph: { nodes: [], edges: [] } });
    const job = await Job.create({ user_id: OWNER, workflow_id: workflow.id }); sourceId = job.id;
  } else if (kind === "chat") {
    const thread = await Thread.create({ user_id: OWNER }); const message = await Message.create({ user_id: OWNER, thread_id: thread.id, role: "assistant", content: "Trace source" }); sourceId = message.id;
  } else {
    const instance = await createAppInstance({ userId: OWNER, sourceId: "example:trace-api", snapshot: { document: { ...createEmptyDocument(), operations: [{ id: "op", name: "Run", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }] }, workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {} } });
    const reserved = await reserveAppRun({ userId: OWNER, instanceId: instance.id, operationId: "op", invocationId: "fixture", origin: "ui" });
    if (!reserved.allowed) { throw new Error(reserved.reason); } sourceId = reserved.run.id;
    await setAppRunInputs(OWNER, sourceId, { prompt: "Private API app input" });
  }
  const run = await registerRunTrace(OWNER, { kind, sourceId, origin: "ui", parents: [] });
  await writeRunTraceUpdate(OWNER, run.id, { kind: "span_ended", record: { trace_id: run.trace_id, span_id: "1".repeat(16), parent_span_id: null,
    name: kind === "app" ? "app.run" : kind === "chat" ? "chat.turn" : "workflow.run", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 2, duration_ms: 1, status: { code: "ERROR" },
    attributes: { "llm.request.messages": "Private API prompt" }, events: [{ id: "event", name: "log", time_ms: 1, attributes: { "log.level": "error", "log.message": "Private API log" } }], resource: {} } }, { isRoot: true });
  await settleRunTrace(OWNER, run.id, { status: "failed" }); return run;
}
describe("phase 3 authenticated tRPC run readers", () => {
  beforeEach(() => { initTestDb(); });
  it.each(["app", "workflow", "chat"] as const)("matches the shared service for a %s run", async (kind) => {
    const run = await register(kind); const caller = appRouter.createCaller(context()); const id = run.id.slice(0, 12);
    expect(await caller.runs.get({ id })).toEqual(await getRun(OWNER, id));
    expect(await caller.runs.get({ id, include_content: true })).toEqual(await getRun(OWNER, id, { include_content: true }));
    if (kind === "app") {
      expect((await caller.runs.get({ id })).run.app).not.toHaveProperty("inputs");
      expect((await caller.runs.get({ id, include_content: true })).run.app?.inputs).toEqual({ prompt: "Private API app input" });
    }
    expect(await caller.runs.trace({ id, focus_span_id: "1".repeat(16), include_content: true })).toEqual(await getRunTrace(OWNER, id, { focus_span_id: "1".repeat(16), include_content: true }));
    expect(await caller.runs.logs({ id, include_content: true })).toEqual(await getRunLogs(OWNER, id, { include_content: true }));
    expect(await caller.runs.updates({ id })).toEqual(await readRunUpdates(OWNER, id));
    expect(await caller.runs.await({ id })).toEqual(await getRun(OWNER, id));
    expect(await caller.runs.list({ kind })).toEqual(await listRuns(OWNER, { kind }));
  });
  it("rejects foreign, unknown, unauthenticated and unfocused content requests", async () => {
    const run = await register("workflow");
    await expect(appRouter.createCaller(context("foreign")).runs.get({ id: run.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(appRouter.createCaller(context(null)).runs.get({ id: run.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const caller = appRouter.createCaller(context());
    await expect(caller.runs.get({ id: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.runs.trace({ id: run.id, include_content: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
