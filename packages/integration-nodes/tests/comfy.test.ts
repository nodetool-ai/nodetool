import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  ComfyWorkflowNode,
  ComfyWorkerWorkflowNode,
  COMFY_NODES
} from "@nodetool-ai/integration-nodes";
import type {
  PythonBridge,
  ComfyEvent,
  ComfyExecuteResult
} from "@nodetool-ai/runtime";

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

/**
 * A ComfyWorkerWorkflowNode wired to an injected fake bridge, so the happy path
 * can be exercised without a real WebSocket worker.
 */
class TestWorkerNode extends ComfyWorkerWorkflowNode {
  constructor(
    private readonly fakeBridge: PythonBridge,
    public readonly capturedEvents: ComfyEvent[] = []
  ) {
    super();
  }
  protected async connectBridge(): Promise<PythonBridge> {
    return this.fakeBridge;
  }
}

function makeFakeBridge(
  overrides: Partial<PythonBridge> = {}
): PythonBridge & { closed: boolean; lastExecuteArgs: unknown[] } {
  const bridge = {
    closed: false,
    lastExecuteArgs: [] as unknown[],
    supportsComfy: () => true,
    comfyExecute: async (
      prompt: Record<string, unknown>,
      options?: unknown,
      onEvent?: (e: ComfyEvent) => void
    ): Promise<ComfyExecuteResult> => {
      bridge.lastExecuteArgs = [prompt, options];
      onEvent?.({ event: "started", prompt_id: "p1" });
      onEvent?.({ event: "executing", prompt_id: "p1", node: "3" });
      // A 1x1 PNG so sniffMedia classifies the output blob as an image.
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return { prompt_id: "p1", outputs: { "9": { images: [] } }, blobs: { "9_image": png } };
    },
    close: () => {
      bridge.closed = true;
    },
    ...overrides
  } as unknown as PythonBridge & { closed: boolean; lastExecuteArgs: unknown[] };
  return bridge;
}

describe("ComfyWorkerWorkflowNode", () => {
  it("is registered as a server node", () => {
    expect(COMFY_NODES).toContain(ComfyWorkerWorkflowNode);
  });

  it("declares worker + dynamic-schema metadata", () => {
    const metadata = getNodeMetadata(ComfyWorkerWorkflowNode);
    expect(metadata.node_type).toBe("lib.comfy.RunWorkflowOnWorker");
    expect(metadata.supports_dynamic_inputs).toBe(true);
    expect(metadata.supports_dynamic_outputs).toBe(true);
    const propNames = metadata.properties.map((p) => p.name);
    expect(propNames).toEqual(
      expect.arrayContaining(["worker_url", "workflow", "timeout", "previews"])
    );
  });

  it("throws when the worker URL is empty", async () => {
    const node = new TestWorkerNode(makeFakeBridge());
    (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
      worker_url: "  ",
      workflow: JSON.stringify(samplePrompt)
    });
    await expect(node.process()).rejects.toThrow(/worker url is required/i);
  });

  it("errors when the worker does not front ComfyUI, and still closes the bridge", async () => {
    const bridge = makeFakeBridge({ supportsComfy: () => false });
    const node = new TestWorkerNode(bridge);
    (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
      worker_url: "ws://host:7777/ws",
      workflow: JSON.stringify(samplePrompt)
    });
    await expect(node.process()).rejects.toThrow(/does not front a ComfyUI/i);
    expect(bridge.closed).toBe(true);
  });

  it("runs the workflow over the bridge and maps output blobs to media refs", async () => {
    const bridge = makeFakeBridge();
    const node = new TestWorkerNode(bridge);
    (node as unknown as { assign: (p: Record<string, unknown>) => void }).assign({
      worker_url: "ws://host:7777/ws",
      workflow: JSON.stringify(samplePrompt),
      timeout: 120,
      previews: false
    });

    const result = await node.process();

    expect(bridge.closed).toBe(true);
    // The image blob was sniffed as PNG and wrapped as an image media ref.
    expect(result["9_image"]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(typeof (result["9_image"] as { data: string }).data).toBe("string");
    // The raw ComfyUI outputs are on the static `output` slot.
    expect(result.output).toEqual({ "9": { images: [] } });
    // Options were forwarded (timeout in seconds).
    const [, options] = bridge.lastExecuteArgs as [unknown, { timeout: number }];
    expect(options.timeout).toBe(120);
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
