import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  RunComfyUIWorkflowNode,
  RunComfyUIWorkflowOnRunPodNode,
  COMFYUI_NODES,
} from "../src/nodes/comfyui.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// RunComfyUIWorkflowNode
// ---------------------------------------------------------------------------
describe("RunComfyUIWorkflowNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(RunComfyUIWorkflowNode.nodeType).toBe("comfyui.RunComfyUIWorkflow");
    expect(RunComfyUIWorkflowNode.title).toBe("Run ComfyUI Workflow");
    expect(RunComfyUIWorkflowNode.requiredSettings).toContain("COMFYUI_ADDR");
    expect(RunComfyUIWorkflowNode.metadataOutputTypes).toEqual({
      images: "list[image]",
      raw_output: "dict[str, any]",
    });
  });

  it("does not support streaming", () => {
    expect(RunComfyUIWorkflowNode.isStreamingInput).toBe(false);
    expect(RunComfyUIWorkflowNode.isStreamingOutput).toBe(false);
  });

  it("throws when workflow is empty", async () => {
    const node = new RunComfyUIWorkflowNode();
    node.assign({ workflow: {} });
    await expect(node.process()).rejects.toThrow("workflow is required");
  });

  it("throws when workflow is null", async () => {
    const node = new RunComfyUIWorkflowNode();
    node.assign({ workflow: null });
    await expect(node.process()).rejects.toThrow("workflow is required");
  });

  it("submits prompt, polls history, and collects images", async () => {
    // POST /prompt
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: "p1", number: 1 }),
    });
    // GET /history/p1 — first poll empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // GET /history/p1 — second poll has result
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        p1: {
          outputs: {
            "9": {
              images: [
                { filename: "out.png", subfolder: "", type: "output" },
              ],
            },
          },
        },
      }),
    });
    // GET /view (image fetch)
    const fakeImage = Buffer.from("PNG_DATA");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeImage.buffer,
    });

    const node = new RunComfyUIWorkflowNode();
    Object.defineProperty(node, "_secrets", {
      get: () => ({ COMFYUI_ADDR: "127.0.0.1:8188" }),
    });
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
    });

    const result = await node.process();
    const images = result.images as Array<Record<string, unknown>>;
    expect(images).toHaveLength(1);
    expect(images[0].type).toBe("image");
    expect(images[0].filename).toBe("out.png");
    expect(typeof images[0].data).toBe("string");
    expect(result.raw_output).toHaveProperty("9");
  });
});

// ---------------------------------------------------------------------------
// RunComfyUIWorkflowOnRunPodNode
// ---------------------------------------------------------------------------
describe("RunComfyUIWorkflowOnRunPodNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(RunComfyUIWorkflowOnRunPodNode.nodeType).toBe(
      "comfyui.RunComfyUIWorkflowOnRunPod"
    );
    expect(RunComfyUIWorkflowOnRunPodNode.title).toBe(
      "Run ComfyUI Workflow (RunPod)"
    );
    expect(RunComfyUIWorkflowOnRunPodNode.requiredSettings).toContain(
      "RUNPOD_API_KEY"
    );
    expect(RunComfyUIWorkflowOnRunPodNode.requiredSettings).not.toContain(
      "RUNPOD_COMFYUI_ENDPOINT_ID"
    );
    // Same output types as the local node
    expect(RunComfyUIWorkflowOnRunPodNode.metadataOutputTypes).toEqual(
      RunComfyUIWorkflowNode.metadataOutputTypes
    );
  });

  it("does not support streaming", () => {
    expect(RunComfyUIWorkflowOnRunPodNode.isStreamingInput).toBe(false);
    expect(RunComfyUIWorkflowOnRunPodNode.isStreamingOutput).toBe(false);
  });

  it("throws when workflow is empty", async () => {
    const node = new RunComfyUIWorkflowOnRunPodNode();
    node.assign({ workflow: {}, endpoint_id: "ep_test" });
    Object.defineProperty(node, "_secrets", {
      get: () => ({ RUNPOD_API_KEY: "rpa_test" }),
    });
    await expect(node.process()).rejects.toThrow("workflow is required");
  });

  it("throws when endpoint_id is missing", async () => {
    const node = new RunComfyUIWorkflowOnRunPodNode();
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
      endpoint_id: "",
    });
    Object.defineProperty(node, "_secrets", {
      get: () => ({ RUNPOD_API_KEY: "rpa_test" }),
    });
    await expect(node.process()).rejects.toThrow("endpoint_id is required");
  });

  it("throws when RunPod API key is missing", async () => {
    const node = new RunComfyUIWorkflowOnRunPodNode();
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
      endpoint_id: "ep_test",
    });
    Object.defineProperty(node, "_secrets", { get: () => ({}) });
    await expect(node.process()).rejects.toThrow(
      "RUNPOD_API_KEY not configured"
    );
  });

  it("submits workflow and returns images in same format as local node", async () => {
    // POST /run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_QUEUE" }),
    });
    // GET /status/job1 — still running
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_PROGRESS" }),
    });
    // GET /status/job1 — completed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "job1",
        status: "COMPLETED",
        output: {
          images: [
            {
              filename: "out.png",
              type: "base64",
              data: "aWltYWdlZGF0YQ==",
            },
          ],
        },
      }),
    });

    const node = new RunComfyUIWorkflowOnRunPodNode();
    Object.defineProperty(node, "_secrets", {
      get: () => ({ RUNPOD_API_KEY: "rpa_test" }),
    });
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
      endpoint_id: "ep_test",
    });

    const result = await node.process();
    const images = result.images as Array<Record<string, unknown>>;
    expect(images).toHaveLength(1);
    // Same shape as local node output
    expect(images[0].type).toBe("image");
    expect(images[0].filename).toBe("out.png");
    expect(typeof images[0].data).toBe("string");
    expect(result.raw_output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// COMFYUI_NODES array
// ---------------------------------------------------------------------------
describe("COMFYUI_NODES", () => {
  it("contains both node classes", () => {
    expect(COMFYUI_NODES).toContain(RunComfyUIWorkflowNode);
    expect(COMFYUI_NODES).toContain(RunComfyUIWorkflowOnRunPodNode);
    expect(COMFYUI_NODES).toHaveLength(2);
  });
});
