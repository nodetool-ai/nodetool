import { beforeEach, describe, expect, it } from "vitest";
import { Application, getAppRun, initTestDb, listAppInstances, listRunTraceRecords } from "@nodetool-ai/models";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { flushTelemetry, ProcessingContext } from "@nodetool-ai/runtime";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { runApplicationDebug } from "../src/service/app-debug-service.js";
import { createAppDebugRunRecording, inlineDocumentTarget, simulateApp } from "../src/app-debug/index.js";

const owner = "owner";
const script = { ...emptyJsScriptDocument(), inputs: [{ name: "text", type: "str" }], outputs: [{ name: "answer", type: "str" }], code: 'await output("answer", inputs.text);' };
const document = {
  schemaVersion: 4, ui: { root: { props: {} }, content: [] }, resources: [], variables: [],
  operations: ["first", "second"].map((id) => ({ id, name: id, workflowId: "", target: { kind: "script", scriptId: id, scriptVersion: 1 }, policy: "parallel", inputs: { text: { from: "constant", value: "pinned input" } }, outputs: {} }))
};
const bundle = { name: "Debug draft", app: document, workflows: [], scripts: [
  { key: "first", name: "First", document: script },
  { key: "second", name: "Second", document: { ...script, code: 'throw new Error("phase 3 deliberate failure");' } }
] };
function deps() {
  return { context: new ProcessingContext({ userId: owner, jobId: "debug-host" }),
    scriptRunner: (context: ProcessingContext, input: Parameters<ReturnType<typeof createJsScriptAppRunner>>[0]) => createJsScriptAppRunner(owner, { context })(input) };
}
function runIds(report: Record<string, unknown>): string[] {
  const ids = report["run_ids"];
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === "string")) { throw new Error("Missing durable debug run ids"); }
  return ids;
}

describe("phase 3 durable app debug", () => {
  beforeEach(() => { initTestDb(); });

  it("records every executed inline bundle operation, including its failed script", async () => {
    const report = await runApplicationDebug(owner, { document: bundle, interact: [{ run: "first" }, { run: "second" }] }, new NodeRegistry(), deps());
    await flushTelemetry();
    const ids = runIds(report);
    expect(ids).toHaveLength(2);
    const runs = await Promise.all(ids.map((id) => getAppRun(owner, id)));
    expect(runs.map((run) => run?.origin)).toEqual(["debug", "debug"]);
    expect(runs.map((run) => run?.status)).toEqual(["completed", "failed"]);
    expect(new Set(runs.map((run) => run?.instance_id)).size).toBe(1);
    expect(runs[0]?.inputs).toEqual({ text: "pinned input" });
    expect(runs[0]?.snapshot?.script_documents["first"].code).toBe(script.code);
    const trace = (await listRunTraceRecords(owner, ids[1]!, { limit: 100 })).records;
    expect(trace.some((update) => update.record.name === "script.run" && update.record.status.code === "ERROR")).toBe(true);
    expect(await getAppRun("foreign", ids[0]!)).toBeNull();
    expect(await Application.listByUser(owner)).toEqual([]);
  });

  it("keeps a static debug free of instance and run records", async () => {
    const report = await runApplicationDebug(owner, { document: bundle, run: false, interact: [{ run: "first" }] }, new NodeRegistry(), deps());
    expect(runIds(report)).toEqual([]);
    expect(await listAppInstances(owner)).toEqual([]);
  });

  it("executes and stores the exact script version checked by the simulator", async () => {
    const target = await inlineDocumentTarget({ ...document, operations: document.operations.slice(0, 1),
      ui: { root: { props: {} }, content: [{ type: "Button", props: { id: "run", events: [{ trigger: "click", kind: "run", operationId: "first" }] } }] }
    }, async () => null);
    let loads = 0;
    const checked = { ...script, code: 'await output("answer", "checked version");' };
    const loadScript = async () => ({ name: "Pinned script", document: ++loads === 1 ? checked : { ...script, code: 'await output("answer", "changed version");' } });
    const context = new ProcessingContext({ userId: owner, jobId: "pinning-test" });
    const registry = new NodeRegistry();
    const ids: string[] = [];
    const runner = createJsScriptAppRunner(owner, { context });
    const recording = createAppDebugRunRecording({ userId: owner, target, context, registry,
      loadWorkflow: async () => null, loadScript, onRunCreated: (id) => { ids.push(id); },
      runScript: (child, input) => createJsScriptAppRunner(owner, { context: child })(input),
      runWorkflow: async () => { throw new Error("Unexpected workflow"); }
    });
    const report = await simulateApp(target, { interact: [{ run: "first" }] }, {
      loadFromDb: async () => null, loadScript, runScript: runner,
      runOnServer: async () => { throw new Error("Unexpected workflow"); }, ...recording
    });
    expect(report.verdict.ok, report.verdict.issues.join("\n")).toBe(true);
    expect(loads).toBe(1);
    const run = await getAppRun(owner, ids[0]!);
    expect(run?.snapshot?.script_documents["first@1"].code).toBe(checked.code);
    expect(JSON.stringify(run?.outputs)).toContain("checked version");
    expect(JSON.stringify(run?.outputs)).not.toContain("changed version");
  });
});
