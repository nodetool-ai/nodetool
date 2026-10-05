import { beforeEach, describe, expect, it } from "vitest";
import { getAppRun, initTestDb } from "@nodetool-ai/models";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { collectExecutionSummary } from "../src/debug/collector.js";
import { createAppDebugRunRecording, inlineDocumentTarget, simulateApp } from "../src/app-debug/index.js";
import type { AppServerRunInput, AppServerRunOutcome } from "../src/app-debug/simulate.js";

const owner = "workflow-input-owner";
const graph = { nodes: [
  { id: "in", type: "nodetool.input.StringInput", data: { name: "prompt", value: "Base prompt" } },
  { id: "generator", type: "nodetool.text.Generate", data: { strength: 0.2, model: "pinned-model" } }
], edges: [] };
const document = {
  schemaVersion: 4, resources: [], variables: [], operations: [{ id: "generate", name: "Generate", workflowId: "pinned-workflow", workflowVersion: 3,
    target: { kind: "workflow", workflowId: "pinned-workflow", workflowVersion: 3 }, policy: "parallel", inputs: {}, outputs: {} }],
  ui: { root: { props: {} }, content: [
    { type: "Slider", props: { id: "strength", binding: "op:generate/prop:generator#strength" } },
    { type: "Button", props: { id: "generate-button", events: [{ trigger: "click", kind: "run", operationId: "generate" }] } }
  ] }
};
describe("durable workflow debug input snapshots", () => {
  beforeEach(() => { initTestDb(); });
  it("records widget property overrides, executes the effective graph and pins the requested workflow version", async () => {
    const requestedVersions: Array<number | undefined> = [];
    const loadWorkflow = async (_id: string, version?: number) => { requestedVersions.push(version); return { graph }; };
    const target = await inlineDocumentTarget(document, async () => null);
    const runIds: string[] = []; const inputs: AppServerRunInput[] = [];
    const context = new ProcessingContext({ userId: owner, jobId: "workflow-input-debug" });
    const recording = createAppDebugRunRecording({ userId: owner, target, context, registry: new NodeRegistry(), loadWorkflow,
      onRunCreated: (id) => { runIds.push(id); },
      runScript: async () => { throw new Error("Unexpected script invocation"); },
      runWorkflow: async (_context, input): Promise<AppServerRunOutcome> => {
        inputs.push(input); const summary = collectExecutionSummary([]); summary.status = "completed";
        return { rawMessages: [], report: { surface: "server", ok: true, status: "completed", error: null, durationMs: 1, summary, trace: null } };
      }
    });
    const report = await simulateApp(target, { interact: [{ set: { key: "op:generate/prop:generator#strength", value: 0.9 } }, { click: "generate-button" }] }, {
      loadFromDb: loadWorkflow, runOnServer: async () => { throw new Error("Unexpected unrecorded run"); }, ...recording
    });
    expect(report.interactions.map((entry) => entry.error)).toEqual([null, null]);
    expect(requestedVersions).toEqual([3]); expect(runIds).toHaveLength(1);
    expect(inputs[0]?.graph.nodes.find((node) => node.id === "generator")?.properties).toMatchObject({ strength: 0.9, model: "pinned-model" });
    expect(inputs[0]?.nodePropertyOverrides).toEqual({ generator: { strength: 0.9 } });
    const run = await getAppRun(owner, runIds[0] ?? "missing");
    expect(run?.inputs).toEqual({ parameters: inputs[0]?.params, node_properties: { generator: { strength: 0.9 } } });
    expect(run?.snapshot?.workflow_graphs["pinned-workflow@3"]).toMatchObject({ nodes: expect.arrayContaining([expect.objectContaining({ id: "generator", data: { strength: 0.2, model: "pinned-model" } })]) });
    expect(target.graphs.get("pinned-workflow@3")?.nodes.find((node) => node.id === "generator")?.data).toMatchObject({ strength: 0.2 });
    expect(graph.nodes[1]?.data.strength).toBe(0.2);
  });
});
