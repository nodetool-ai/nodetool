import { afterEach, describe, expect, it, vi } from "vitest";
import { Graph, WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { createFakeContext } from "@nodetool-ai/runtime";
import { comfyPromptToGraph, type ProcessingMessage } from "@nodetool-ai/protocol";
import { ComfyCloudGraphNode, type ComfyPrompt, type ComfyTransport } from "@nodetool-ai/integration-nodes";
import { registerBaseNodes } from "../src/index.js";

const WORKFLOW_NODE_TYPE = "nodetool.workflows.workflow_node.Workflow";

/** Fake the Comfy Cloud transport and catalog; returns the submitted prompts. */
function fakeComfyCloud(): ComfyPrompt[] {
  const submitted: ComfyPrompt[] = [];
  const output = {
    nodeId: "9", name: "fox.png", id: "asset-1", type: "image", contentType: "image/png",
    sizeBytes: 1, toBytes: async () => new Uint8Array([1])
  };
  const job = {
    id: "job-1", status: "succeeded", outputs: [output], error: null,
    async *events() { yield { kind: "statusChange", status: "succeeded", queuePosition: null }; },
    refresh: async () => job, cancel: async () => job
  };
  const proto = ComfyCloudGraphNode.prototype as unknown as Record<string, unknown>;
  vi.spyOn(proto as never, "createTransport" as never).mockReturnValue({
    submit: async (prompt: ComfyPrompt) => { submitted.push(prompt); return job; },
    assetFromBytes: () => ({})
  } as ComfyTransport as never);
  vi.spyOn(proto as never, "loadObjectInfo" as never).mockResolvedValue({
    CLIPTextEncode: { output: ["CONDITIONING"], output_name: ["CONDITIONING"] },
    KSampler: { output: ["LATENT"], output_name: ["LATENT"] },
    SaveImage: { output: [], output_node: true }
  } as never);
  vi.spyOn(proto as never, "openLiveFrames" as never).mockReturnValue((() => {}) as never);
  return submitted;
}

/**
 * A Comfy workflow stored the way the Comfy importer saves it: ComfyUI nodes
 * only, with no Input or Output nodes.
 */
function storedComfyWorkflow() {
  const graph = comfyPromptToGraph(
    {
      "6": { class_type: "CLIPTextEncode", inputs: { text: "a cat" } },
      "3": { class_type: "KSampler", inputs: { positive: ["6", 0], seed: 1 } },
      "9": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: "nt" } }
    },
    (cls) => (cls === "CLIPTextEncode" ? ["CONDITIONING"] : cls === "KSampler" ? ["LATENT"] : [])
  );
  return { id: "comfy-wf", name: "Comfy txt2img", run_mode: "comfy", graph };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** A Comfy workflow embedded in a normal workflow through the Workflow node. */
describe("Workflow node running a Comfy workflow", () => {
  it("feeds the parent's prompt into the Comfy job and returns its saved image", async () => {
    const submitted = fakeComfyCloud();
    const registry = new NodeRegistry();
    registerBaseNodes(registry);
    const resolver = createGraphNodeTypeResolver(registry);

    // The ports the editor derives for the stored graph (extractDynamicIO).
    const parent = {
      nodes: [
        { id: "in", type: "nodetool.input.StringInput", properties: { name: "subject", value: "a fox" } },
        {
          id: "wf",
          type: WORKFLOW_NODE_TYPE,
          properties: { workflow_id: "comfy-wf", workflow_json: storedComfyWorkflow() },
          dynamic_inputs: { prompt: { type: "str", optional: true, type_args: [] } },
          dynamic_outputs: { output: { type: "any", optional: false, type_args: [] } }
        },
        { id: "out", type: "nodetool.output.Output", properties: { name: "image" } }
      ],
      edges: [
        { id: "e1", source: "in", sourceHandle: "output", target: "wf", targetHandle: "prompt", edge_type: "data" },
        { id: "e2", source: "wf", sourceHandle: "output", target: "out", targetHandle: "value", edge_type: "data" }
      ]
    };
    const loaded = await Graph.loadFromDict(parent, {
      resolver,
      skipErrors: false,
      allowUndefinedProperties: true
    });

    const fake = createFakeContext({
      jobId: "j",
      secretResolver: (key) => (key === "COMFY_API_KEY" ? "ck" : null)
    });
    const context = fake.context;
    context.setResolveExecutor((node) => registry.resolve(node as never));
    context.setResolveNodeType(resolver.resolveNodeType);
    const messages: ProcessingMessage[] = [];
    context.addMessageListener((msg) => messages.push(msg));

    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) => registry.resolve(node),
      executionContext: context
    });
    const result = await runner.run(
      { job_id: "j", params: {} },
      { nodes: [...loaded.nodes], edges: [...loaded.edges] }
    );

    expect(result.status, result.error ?? "").toBe("completed");
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.["6"]?.inputs.text).toBe("a fox");
    expect(result.outputs.image).toEqual([expect.objectContaining({ type: "image" })]);
    // The Comfy job's node states reach the editor through the parent run.
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "node_update", node_id: "9", status: "completed" })
    );
  });
});
