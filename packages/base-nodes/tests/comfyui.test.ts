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
  });

  it("throws when workflow is empty", async () => {
    const node = new RunComfyUIWorkflowNode();
    node.assign({ workflow: {} });
    await expect(node.process()).rejects.toThrow("workflow is required");
  });

  it("submits prompt and collects images", async () => {
    // 1. POST /prompt
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: "p1", number: 1 }),
    });
    // 2. GET /history/p1 (first poll — empty)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // 3. GET /history/p1 (second poll — has result)
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
    // 4. GET /view (image fetch)
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
    expect(result.images).toHaveLength(1);
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
    expect(RunComfyUIWorkflowOnRunPodNode.requiredSettings).toContain(
      "RUNPOD_COMFYUI_ENDPOINT_ID"
    );
  });

  it("throws when workflow is empty", async () => {
    const node = new RunComfyUIWorkflowOnRunPodNode();
    node.assign({ workflow: {} });
    Object.defineProperty(node, "_secrets", {
      get: () => ({
        RUNPOD_API_KEY: "rpa_test",
        RUNPOD_COMFYUI_ENDPOINT_ID: "ep_test",
      }),
    });
    await expect(node.process()).rejects.toThrow("workflow is required");
  });

  it("throws when RunPod creds are missing", async () => {
    const node = new RunComfyUIWorkflowOnRunPodNode();
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
    });
    Object.defineProperty(node, "_secrets", { get: () => ({}) });
    await expect(node.process()).rejects.toThrow("RunPod credentials not configured");
  });

  it("submits workflow to RunPod and returns images", async () => {
    // 1. POST /run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_QUEUE" }),
    });
    // 2. GET /status/job1 (polling - still in progress)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "job1", status: "IN_PROGRESS" }),
    });
    // 3. GET /status/job1 (polling - completed)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "job1",
        status: "COMPLETED",
        output: {
          images: [
            { filename: "out.png", type: "base64", data: "aWltYWdlZGF0YQ==" },
          ],
        },
      }),
    });

    const node = new RunComfyUIWorkflowOnRunPodNode();
    Object.defineProperty(node, "_secrets", {
      get: () => ({
        RUNPOD_API_KEY: "rpa_test",
        RUNPOD_COMFYUI_ENDPOINT_ID: "ep_test",
      }),
    });
    node.assign({
      workflow: { "3": { class_type: "KSampler", inputs: {} } },
    });

    const result = await node.process();
    expect(result.images).toHaveLength(1);
    const img = (result.images as Array<Record<string, unknown>>)[0];
    expect(img.filename).toBe("out.png");
    expect((img.data as string).startsWith("data:image/png;base64,")).toBe(true);
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
