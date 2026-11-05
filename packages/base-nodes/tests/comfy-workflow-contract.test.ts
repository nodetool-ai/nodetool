import { describe, expect, it, vi } from "vitest";
import { Graph, WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { createFakeContext } from "@nodetool-ai/runtime";
import { collapseComfyGraph, comfyPromptToGraph } from "@nodetool-ai/protocol";
import { ComfyCloudGraphNode, type ComfyPrompt, type ComfyTransport } from "@nodetool-ai/integration-nodes";
import { registerBaseNodes } from "../src/index.js";

/** A Comfy workflow behaves as a tool: run params go in and named results come out. */
describe("Comfy workflow contract", () => {
  it("runs through the kernel with params and returns the Save node's file", async () => {
    const submitted: ComfyPrompt[] = [];
    const output = {
      nodeId: "5", name: "a.png", id: "asset-1", type: "image", contentType: "image/png",
      sizeBytes: 1, toBytes: async () => new Uint8Array([1])
    };
    const job = {
      id: "job", status: "succeeded", outputs: [output], error: null,
      async *events() { yield { kind: "statusChange", status: "succeeded", queuePosition: null }; },
      refresh: async () => job, cancel: async () => job
    };
    const proto = ComfyCloudGraphNode.prototype as unknown as Record<string, unknown>;
    vi.spyOn(proto as never, "createTransport" as never).mockReturnValue({
      submit: async (graph: ComfyPrompt) => { submitted.push(graph); return job; },
      assetFromBytes: () => ({})
    } as ComfyTransport as never);
    vi.spyOn(proto as never, "loadObjectInfo" as never).mockResolvedValue({
      CLIPTextEncode: { output: ["CONDITIONING"], output_name: ["CONDITIONING"] },
      SaveImage: { output: [], output_node: true }
    } as never);
    vi.spyOn(proto as never, "openLiveFrames" as never).mockReturnValue((() => {}) as never);

    const graph = comfyPromptToGraph({
      "2": { class_type: "CLIPTextEncode", inputs: { text: "default" } },
      "4": { class_type: "KSampler", inputs: { positive: ["2", 0] } },
      "5": { class_type: "SaveImage", inputs: { images: ["2", 0] } }
    }, (cls) => (cls === "CLIPTextEncode" ? ["CONDITIONING"] : []));
    graph.nodes = graph.nodes.filter((n) => n.type !== "comfy.KSampler");
    graph.edges = graph.edges.filter((e) => e.target !== "4");
    const collapsed = collapseComfyGraph({
      nodes: graph.nodes.map(({ data, ...n }) => ({ ...n, properties: data })),
      edges: graph.edges.map((e) => ({ ...e, edge_type: "data" }))
    });

    const registry = new NodeRegistry();
    registerBaseNodes(registry);
    const loaded = await Graph.loadFromDict(collapsed, {
      resolver: createGraphNodeTypeResolver(registry),
      skipErrors: false,
      allowUndefinedProperties: true
    });
    const fake = createFakeContext({ jobId: "j", secretResolver: (key) => (key === "COMFY_API_KEY" ? "ck" : null) });
    const runner = new WorkflowRunner("j", {
      resolveExecutor: (node) => registry.resolve(node),
      executionContext: fake.context
    });
    const result = await runner.run({ job_id: "j", params: { prompt: "a fox" } }, { nodes: [...loaded.nodes], edges: [...loaded.edges] });
    expect(result.status, result.error ?? "").toBe("completed");
    expect(submitted[0]?.["2"]?.inputs.text).toBe("a fox");
    expect(Object.values(result.outputs).flat()).toContainEqual(expect.objectContaining({ type: "image" }));
  });
});
