import { beforeEach, describe, expect, it } from "vitest";
import { getAppRun, initTestDb } from "@nodetool-ai/models";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { createAppDebugRunRecording, inlineDocumentTarget, simulateApp } from "../src/app-debug/index.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type { AppServerRunInput, AppServerRunOutcome } from "../src/app-debug/simulate.js";

function document(kind: "script" | "workflow") {
  return {
    schemaVersion: 4, resources: [], variables: [],
    ui: { root: { props: {} }, content: [1, 2].map((version) => ({ type: "Button", props: {
      id: `run-${version}`, events: [{ trigger: "click", kind: "run", operationId: `v${version}` }]
    } })) },
    operations: [1, 2].map((version) => ({
      id: `v${version}`, name: `Version ${version}`, workflowId: kind === "workflow" ? "saved" : "",
      ...(kind === "workflow" ? { workflowVersion: version } : {}),
      target: kind === "script"
        ? { kind, scriptId: "saved", scriptVersion: version }
        : { kind, workflowId: "saved", workflowVersion: version },
      policy: "parallel", inputs: {}, outputs: {}
    }))
  };
}

describe("versioned app debug targets", () => {
  beforeEach(() => { initTestDb(); });

  it("checks, executes and snapshots two versions of the same saved script independently", async () => {
    const scripts = [1, 2].map((version) => ({ ...emptyJsScriptDocument(),
      outputs: [{ name: "answer", type: "str" }], code: `await output("answer", "version ${version}");`
    }));
    const loads: Array<number | undefined> = [];
    const loadScript = async (_id: string, version: number) => {
      loads.push(version);
      return { name: "Saved script", document: scripts[version - 1]! };
    };
    const target = await inlineDocumentTarget(document("script"), async () => null);
    const context = new ProcessingContext({ userId: "owner", jobId: "versions" });
    const ids: string[] = [];
    const runScript = (child: ProcessingContext, input: Parameters<ReturnType<typeof createJsScriptAppRunner>>[0]) => createJsScriptAppRunner("owner", { context: child })(input);
    const recording = createAppDebugRunRecording({ userId: "owner", target, context, registry: new NodeRegistry(),
      loadWorkflow: async () => null, loadScript, onRunCreated: (id) => { ids.push(id); }, runScript,
      runWorkflow: async () => { throw new Error("Unexpected workflow"); }
    });
    const report = await simulateApp(target, { interact: [{ run: "v1" }, { run: "v2" }] }, {
      loadFromDb: async () => null, loadScript, runScript: (input) => runScript(context, input),
      runOnServer: async () => { throw new Error("Unexpected workflow"); }, ...recording
    });
    expect(report.verdict.ok, report.verdict.issues.join("\n")).toBe(true);
    expect(loads).toEqual([1, 2]);
    expect(ids).toHaveLength(2);
    const runs = await Promise.all(ids.map((id) => getAppRun("owner", id)));
    for (const run of runs) {
      expect(run?.snapshot?.script_documents["saved@1"]).toEqual(scripts[0]);
      expect(run?.snapshot?.script_documents["saved@2"]).toEqual(scripts[1]);
    }
    expect(JSON.stringify(runs[0]?.outputs)).toContain("version 1");
    expect(JSON.stringify(runs[1]?.outputs)).toContain("version 2");
  });

  it("keeps the first host workflow separate from another pinned version of its ID", async () => {
    const graphs = [1, 2].map((version) => ({ nodes: [
      { id: "out", type: "nodetool.output.StringOutput", properties: { name: "answer", value: `version ${version}` } }
    ], edges: [] }));
    const loads: Array<number | undefined> = [];
    const loadWorkflow = async (_id: string, version?: number) => {
      loads.push(version);
      return { graph: graphs[(version ?? 1) - 1]! };
    };
    const target = await inlineDocumentTarget(document("workflow"), loadWorkflow);
    const context = new ProcessingContext({ userId: "owner", jobId: "versions" });
    const ids: string[] = [];
    const seen: string[] = [];
    const runWorkflow = async (_child: ProcessingContext, input: AppServerRunInput): Promise<AppServerRunOutcome> => {
      const value = String(input.graph.nodes[0]?.properties?.["value"]);
      seen.push(value);
      const rawMessages = [{ type: "output_update" as const, node_id: "out", output_name: "output", value },
        { type: "job_update" as const, status: "completed" as const }];
      const summary = collectExecutionSummary(rawMessages);
      summary.status = "completed";
      return { rawMessages, report: { surface: "server", ok: true, status: "completed", error: null,
        durationMs: 1, summary, trace: null } };
    };
    const recording = createAppDebugRunRecording({ userId: "owner", target, context, registry: new NodeRegistry(),
      loadWorkflow, onRunCreated: (id) => { ids.push(id); }, runWorkflow,
      runScript: async () => { throw new Error("Unexpected script"); }
    });
    const report = await simulateApp(target, { interact: [{ run: "v1" }, { run: "v2" }] }, {
      loadFromDb: loadWorkflow, runOnServer: (input) => runWorkflow(context, input), ...recording
    });
    expect(report.verdict.ok, report.verdict.issues.join("\n")).toBe(true);
    expect(loads).toEqual([1, 2]);
    expect(seen).toEqual(["version 1", "version 2"]);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      const run = await getAppRun("owner", id);
      expect(run?.snapshot?.workflow_graphs["saved@1"]).toEqual(graphs[0]);
      expect(run?.snapshot?.workflow_graphs["saved@2"]).toEqual(graphs[1]);
    }
  });
});
