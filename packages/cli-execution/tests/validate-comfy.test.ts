import { describe, expect, it } from "vitest";
import { COMFY_CLOUD_GRAPH_NODE_TYPE } from "@nodetool-ai/protocol";
import { runValidate } from "../src/validate/index.js";

// Comfy node classes are supplied by the remote catalog. Only their runner
// belongs to the local execution registry.
const registry = {
  has: (type: string) => type === COMFY_CLOUD_GRAPH_NODE_TYPE || type === "nodetool.input.StringInput",
  getMetadata: () => undefined,
  validateNode: () => []
};

describe("native Comfy workflow validation", () => {
  it("validates the same collapsed graph that the execution host runs", async () => {
    const { report } = await runValidate("workflow-id", {
      registry,
      loadFromDb: async () => ({ graph: {
        nodes: [
          { id: "load", type: "comfy.CheckpointLoaderSimple", data: { ckpt_name: "model.safetensors" } },
          { id: "encode", type: "comfy.CLIPTextEncode", data: { text: "A lighthouse" } }
        ],
        edges: [{ id: "clip", source: "load", sourceHandle: "CLIP", target: "encode", targetHandle: "clip" }]
      } })
    });
    expect(report.ok).toBe(true);
    expect(report.nodeCount).toBe(2);
    expect(report.issues).toEqual([]);
  });

  it("still rejects dangling links inside the authored Comfy graph", async () => {
    const { report } = await runValidate("workflow-id", {
      registry,
      loadFromDb: async () => ({ graph: {
        nodes: [{ id: "load", type: "comfy.CheckpointLoaderSimple" }],
        edges: [{ id: "broken", source: "load", sourceHandle: "CLIP", target: "missing", targetHandle: "clip" }]
      } })
    });
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "dangling_edge" }));
    expect(report.issues.some((issue) => issue.code === "unknown_node")).toBe(false);
  });
});
