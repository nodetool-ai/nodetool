import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, createAppInstance, Application, Job, setApplicationBudget, listRunTraceRecords, getRunTrace, getRegisteredRunTrace } from "@nodetool-ai/models";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { ProcessingContext, ScriptedProvider, flushTelemetry } from "@nodetool-ai/runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { registerWorkflowRunTrace } from "../src/service/run-trace-lifecycle.js";
import { executeAppOperation } from "../src/service/app-operation.js";

const SECRET = "resolved-run-secret-value";

async function tracedApp(origin: "ui" | "public" = "ui", fail = false) {
  if (origin === "public") {
    await Application.create<Application>({ id: "public-fixture", user_id: "owner" });
    await setApplicationBudget("public-fixture", { maxInvocations: 10 });
  }
  const instance = await createAppInstance({
    userId: "owner", sourceId: "trace-fixture", ...(origin === "public" ? { applicationId: "public-fixture" } : {}), snapshot: {
      document: {
        schemaVersion: 4, ui: { content: [], root: { props: {} } }, resources: [],
        variables: [{ id: "answer", name: "Answer", scope: "instance", persist: true }],
        operations: [{ id: "answer", name: "Answer", workflowId: "", target: { kind: "script", scriptId: "script", scriptVersion: 1 }, policy: "parallel", inputs: {}, outputs: { answer: { to: "variable", variableId: "answer" } } }]
      }, workflow_graphs: {}, script_documents: {
        script: { ...emptyJsScriptDocument(), outputs: [{ name: "answer", type: "str" }], code: `import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";
console.log("fixture console ${SECRET}");
const answer = await run_agent({ prompt: "fixture prompt ${SECRET}", model: { provider: "fake", id: "fixture" } });
${fail ? 'throw new Error("deliberate fixture failure");' : 'await output("answer", answer.text);'}` }
      }
    }
  });
  const context = new ProcessingContext({ jobId: "host", userId: "owner", secretResolver: () => SECRET });
  await context.getSecret("FIXTURE_SECRET");
  context.setProviderResolver(() => new ScriptedProvider([() => [{ type: "chunk", content: `fixture response ${SECRET}`, done: true }]]));
  const result = await executeAppOperation({ userId: "owner", instanceId: instance.id, operationId: "answer", invocationId: `fixture-${origin}-${fail}`, origin, context, registry: new NodeRegistry(), scriptRunner: (child, input) => createJsScriptAppRunner("owner", { context: child })(input) });
  await flushTelemetry();
  return { result, records: (await listRunTraceRecords("owner", result.run.id, { limit: 2000 })).records.map((update) => update.record) };
}

describe("phase 2 durable server trace", () => {
  beforeEach(() => initTestDb());

  it("records the real script, capability, loop, round and LLM with no external sink", async () => {
    const { result, records } = await tracedApp();
    expect(result.run.status).toBe("completed");
    expect(records.length).toBeGreaterThan(0);
    const names = records.map((record) => record.name);
    for (const name of ["app.run", "script.run", "capability.call", "agent.loop", "agent.round"]) { expect(names).toContain(name); }
    expect(names.some((name) => name.startsWith("llm.stream"))).toBe(true);
    expect(new Set(records.map((record) => record.trace_id))).toEqual(new Set([result.run.trace_id]));
    const parentNames = new Map(records.map((record) => [record.span_id, record.name]));
    expect(records.find((record) => record.name === "script.run")?.parent_span_id).toBe(records.find((record) => record.name === "app.run")?.span_id);
    expect(parentNames.get(records.find((record) => record.name.startsWith("llm.stream"))?.parent_span_id ?? "")).toBe("agent.round");
    expect(records.flatMap((record) => record.events).some((event) => event.name === "console")).toBe(true);
    expect(records.flatMap((record) => record.events).some((event) => event.name === "agent.activity")).toBe(true);
    const text = JSON.stringify(records);
    expect(text).toContain("fixture prompt");
    expect(text).toContain("fixture response");
    expect(text).not.toContain(SECRET);
    expect(await getRunTrace("foreign", result.run.id)).toBeNull();
    expect(await getRegisteredRunTrace("foreign", result.run.trace_id)).toBeNull();
  });

  it("registers an inline job without a nonexistent workflow parent", async () => {
    const job = await Job.create<Job>({ id: "inline-job", user_id: "owner", workflow_id: "inline-correlation", status: "running", graph: { nodes: [], edges: [] } });
    const context = new ProcessingContext({ jobId: job.id, userId: "owner" });
    const scope = await registerWorkflowRunTrace(context, { jobId: job.id, workflowId: job.workflow_id, inlineGraph: true });
    const run = await getRunTrace("owner", scope.runId);
    expect(run?.parents).toContainEqual({ kind: "job", id: job.id });
    expect(run?.parents.some((parent) => parent.kind === "workflow")).toBe(false);
  });

  it("keeps visitor spans metadata-only", async () => {
    const { records } = await tracedApp("public");
    expect(records.some((record) => record.name === "app.run")).toBe(true);
    const text = JSON.stringify(records);
    expect(text).not.toContain("fixture prompt");
    expect(text).not.toContain("fixture response");
    expect(text).not.toContain("fixture console");
  });

  it("stores the deliberately failed script as a failed span and run", async () => {
    const { result, records } = await tracedApp("ui", true);
    expect(result.run.status).toBe("failed");
    expect((await getRunTrace("owner", result.run.id))?.status).toBe("failed");
    expect(records.find((record) => record.name === "script.run")?.status.code).toBe("ERROR");
    expect(records.find((record) => record.name === "app.run")?.status.code).toBe("ERROR");
  });
});
