import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ComfyObjectInfo } from "@nodetool-ai/protocol";
import {
  COMFY_NODES,
  ComfyCloudGraphNode,
  type ComfyJob,
  type ComfyOutput,
  type ComfyPrompt,
  type ComfyRunEvent,
  type ComfyTransport
} from "@nodetool-ai/integration-nodes";

const INFO: ComfyObjectInfo = {
  EmptyImage: { output: ["IMAGE"], output_name: ["IMAGE"] },
  SaveImage: { output: [] }
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const output: ComfyOutput = {
  nodeId: "save",
  name: "out.png",
  id: "asset-1",
  type: "image",
  contentType: "image/png",
  sizeBytes: PNG.length,
  toBytes: async () => PNG
};

function job(status: string, error: ComfyJob["error"] = null): ComfyJob {
  const self: ComfyJob = {
    id: "job-1",
    status,
    outputs: status === "succeeded" ? [output] : [],
    error,
    async *events(): AsyncGenerator<ComfyRunEvent, void, void> {
      yield { kind: "statusChange", status: "running", queuePosition: null };
      yield {
        kind: "progress",
        value: 0.5,
        message: null,
        nodesDone: 1,
        nodesTotal: 2,
        currentNode: "make",
        step: 2,
        steps: 4
      };
      yield { kind: "statusChange", status, queuePosition: null };
    },
    refresh: async () => self,
    cancel: async () => self
  };
  return self;
}

class TestNode extends ComfyCloudGraphNode {
  declare submitted: ComfyPrompt[];
  declare result: ComfyJob;
  protected loadObjectInfo(): Promise<ComfyObjectInfo> {
    return Promise.resolve(INFO);
  }
  protected createTransport(): ComfyTransport {
    return {
      submit: async (graph) => {
        this.submitted.push(graph);
        return this.result;
      },
      assetFromBytes: () => ({})
    };
  }
}

function setup(result: ComfyJob) {
  const node = new TestNode();
  (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
    nodes: [
      { id: "make", type: "comfy.EmptyImage", properties: { width: 64, height: 64 } },
      { id: "save", type: "comfy.SaveImage", properties: { filename_prefix: "t", images: null } }
    ],
    edges: [{ source: "make", sourceHandle: "IMAGE", target: "save", targetHandle: "images" }],
    timeout: 60
  });
  (node as unknown as { setDynamic: (k: string, v: unknown) => void }).setDynamic(
    "_secrets",
    { COMFY_API_KEY: "ck_test" }
  );
  node.submitted = [];
  node.result = result;
  const messages: Array<Record<string, unknown>> = [];
  const context = {
    postMessage: (m: Record<string, unknown>) => messages.push(m),
    normalizeOutputValue: async (v: unknown) => v
  } as unknown as ProcessingContext;
  return { node, messages, context };
}

describe("ComfyCloudGraphNode", () => {
  it("is registered", () => {
    expect(COMFY_NODES).toContain(ComfyCloudGraphNode);
  });

  it("submits one API-format prompt and reports status per Comfy node", async () => {
    const { node, messages, context } = setup(job("succeeded"));
    const result = await node.process(context);
    expect(node.submitted[0]).toEqual({
      make: { class_type: "EmptyImage", inputs: { width: 64, height: 64 } },
      save: { class_type: "SaveImage", inputs: { filename_prefix: "t", images: ["make", 0] } }
    });
    const updates = messages.filter((m) => m.type === "node_update");
    expect(updates.filter((m) => m.node_id === "make").map((m) => m.status)).toEqual([
      "queued",
      "running",
      "completed"
    ]);
    const saved = updates.find((m) => m.node_id === "save" && m.status === "completed");
    expect(saved?.result).toMatchObject({ output: { type: "image" } });
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "node_progress", node_id: "make", progress: 2, total: 4 })
    );
    expect(result.output).toMatchObject({ job_id: "job-1", status: "succeeded" });
  });

  it("marks the failing Comfy node", async () => {
    const { node, messages, context } = setup(
      job("failed", { code: "execution_error", message: "boom", node_id: "save", class_type: "SaveImage" })
    );
    await expect(node.process(context)).rejects.toThrow(/boom/);
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "node_update", node_id: "save", status: "error" })
    );
  });
});
