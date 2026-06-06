import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ComfyWorkflowNode, COMFY_NODES } from "@nodetool-ai/integration-nodes";

const samplePrompt = {
  "3": {
    class_type: "KSampler",
    inputs: { seed: 1, steps: 20, model: ["4", 0] }
  },
  "9": {
    class_type: "SaveImage",
    inputs: { images: ["8", 0], filename_prefix: "ComfyUI" }
  }
};

function makeNode(props: Record<string, unknown> = {}): ComfyWorkflowNode {
  const node = new ComfyWorkflowNode();
  (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
    endpoint: "127.0.0.1:8188",
    workflow: JSON.stringify(samplePrompt),
    timeout: 600,
    ...props
  });
  return node;
}

describe("ComfyWorkflowNode", () => {
  it("is registered as a server node", () => {
    expect(COMFY_NODES).toContain(ComfyWorkflowNode);
  });

  it("declares streaming dynamic-schema metadata", () => {
    const metadata = getNodeMetadata(ComfyWorkflowNode);
    expect(metadata.node_type).toBe("lib.comfy.RunWorkflow");
    expect(metadata.supports_dynamic_inputs).toBe(true);
    expect(metadata.supports_dynamic_outputs).toBe(true);
    expect(metadata.is_streaming_output).toBe(true);
    const propNames = metadata.properties.map((p) => p.name);
    expect(propNames).toEqual(
      expect.arrayContaining(["endpoint", "workflow", "timeout"])
    );
  });

  it("throws when the endpoint is empty", async () => {
    const node = makeNode({ endpoint: "  " });
    await expect(drain(node)).rejects.toThrow(/endpoint is required/i);
  });

  it("throws when the workflow is empty", async () => {
    const node = makeNode({ workflow: "" });
    await expect(drain(node)).rejects.toThrow(/workflow is required/i);
  });

  it("throws a helpful error when the workflow JSON is malformed", async () => {
    const node = makeNode({ workflow: "{not json" });
    await expect(drain(node)).rejects.toThrow(/not valid JSON/i);
  });
});

/** Run genProcess to completion, collecting yielded frames. */
async function drain(
  node: ComfyWorkflowNode
): Promise<Array<Record<string, unknown>>> {
  const frames: Array<Record<string, unknown>> = [];
  for await (const frame of node.genProcess()) {
    frames.push(frame);
  }
  return frames;
}
