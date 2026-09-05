import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  COMFY_NODES,
  ComfyCloudWorkflowNode,
  type ComfyJob,
  type ComfyOutput,
  type ComfyPrompt,
  type ComfyRunEvent,
  type ComfyTransport
} from "@nodetool-ai/integration-nodes";

const samplePrompt = {
  "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20 } },
  "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } }
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const output: ComfyOutput = {
  nodeId: "9",
  name: "ComfyUI_00001_.png",
  id: "asset-1",
  type: "image",
  contentType: "image/png",
  sizeBytes: PNG.length,
  toBytes: async () => PNG
};

const scriptedJob: ComfyJob = {
  id: "job-7",
  status: "succeeded",
  outputs: [output],
  error: null,
  async *events(): AsyncGenerator<ComfyRunEvent, void, void> {
    yield { kind: "outputReady", output };
    yield { kind: "statusChange", status: "succeeded", queuePosition: null };
  },
  async refresh() {
    return scriptedJob;
  },
  async cancel() {
    return scriptedJob;
  }
};

/** Records what the node handed the transport. */
class TestCloudNode extends ComfyCloudWorkflowNode {
  readonly apiKeys: string[] = [];
  readonly submitted: ComfyPrompt[] = [];

  protected createTransport(apiKey: string): ComfyTransport {
    this.apiKeys.push(apiKey);
    return {
      submit: async (graph) => {
        this.submitted.push(graph);
        return scriptedJob;
      },
      assetFromBytes: (_bytes, filename) => ({ __asset: filename })
    };
  }
}

function makeNode(props: Record<string, unknown> = {}): TestCloudNode {
  const node = new TestCloudNode();
  (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
    workflow: JSON.stringify(samplePrompt),
    timeout: 600,
    previews: false,
    _secrets: { COMFY_API_KEY: "ck_test" },
    ...props
  });
  return node;
}

describe("ComfyCloudWorkflowNode", () => {
  it("is registered as a server node", () => {
    expect(COMFY_NODES).toContain(ComfyCloudWorkflowNode);
  });

  it("declares Comfy Cloud metadata", () => {
    const metadata = getNodeMetadata(ComfyCloudWorkflowNode);
    expect(metadata.node_type).toBe("lib.comfy.RunWorkflowOnCloud");
    expect(metadata.supports_dynamic_inputs).toBe(true);
    expect(metadata.supports_dynamic_outputs).toBe(true);
    expect(metadata.is_streaming_output).toBe(true);
    expect(ComfyCloudWorkflowNode.requiredSettings).toEqual(["COMFY_API_KEY"]);
    expect(ComfyCloudWorkflowNode.autoSaveAsset).toBe(true);
    const propNames = metadata.properties.map((p) => p.name);
    expect(propNames).toEqual(
      expect.arrayContaining(["workflow", "timeout", "previews"])
    );
  });

  it("names COMFY_API_KEY when the secret is missing", async () => {
    const node = makeNode({ _secrets: {} });
    await expect(node.process()).rejects.toThrow(/COMFY_API_KEY is required/);
  });

  it("throws when the workflow is empty", async () => {
    const node = makeNode({ workflow: "" });
    await expect(node.process()).rejects.toThrow(/workflow is required/i);
  });

  it("throws a helpful error when the workflow JSON is malformed", async () => {
    const node = makeNode({ workflow: "{not json" });
    await expect(node.process()).rejects.toThrow(/not valid JSON/i);
  });

  it("runs the workflow through the transport and emits per-node media refs", async () => {
    const node = makeNode({ "3:seed": 99 });

    const result = await node.process();

    expect(node.apiKeys).toEqual(["ck_test"]);
    expect(node.submitted[0]["3"].inputs.seed).toBe(99);
    expect(result["9:image"]).toMatchObject({
      type: "image",
      uri: "",
      mimeType: "image/png",
      data: Buffer.from(PNG).toString("base64")
    });
    expect(result.output).toMatchObject({
      job_id: "job-7",
      status: "succeeded"
    });
  });
});
