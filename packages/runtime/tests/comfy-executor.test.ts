import { describe, it, expect, vi, afterAll } from "vitest";
import { executeComfyLocal, executeComfyRunPod } from "../src/comfy-executor.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = originalFetch;
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

function binaryResponse(data: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => data.buffer,
  } as Response;
}

const samplePrompt = {
  "1": { class_type: "KSampler", inputs: { seed: 42 } },
};

describe("executeComfyLocal", () => {
  it("submits, polls, and fetches images successfully", async () => {
    mockFetch.mockReset();

    // 1. Submit prompt
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ prompt_id: "abc123" })
    );

    // 2. Poll history — result ready
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        abc123: {
          outputs: {
            "9": {
              images: [
                { filename: "out.png", subfolder: "", type: "output" },
              ],
            },
          },
        },
      })
    );

    // 3. Fetch image
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch.mockResolvedValueOnce(binaryResponse(imgBytes));

    const result = await executeComfyLocal(samplePrompt, "127.0.0.1:8188", 1, 0);

    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].filename).toBe("out.png");
    expect(result.images![0].type).toBe("image");
    expect(result.images![0].data).toBe(Buffer.from(imgBytes).toString("base64"));
  });

  it("returns failed on submission error", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 400));

    const result = await executeComfyLocal(samplePrompt, "127.0.0.1:8188", 1, 0);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Submit failed");
  });
});

describe("executeComfyRunPod", () => {
  it("submits, polls, and returns completed with data-URI image", async () => {
    mockFetch.mockReset();

    // 1. Submit
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "job-1" }));

    // 2. Poll — completed with data-URI message
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        status: "COMPLETED",
        output: { message: "data:image/png;base64,iVBORw0KGgo=" },
      })
    );

    const result = await executeComfyRunPod(
      samplePrompt,
      "test-key",
      "ep-123",
      1,
      0
    );

    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].data).toBe("iVBORw0KGgo=");
    expect(result.images![0].filename).toBe("output.png");
  });

  it("returns failed when RunPod job fails", async () => {
    mockFetch.mockReset();

    // 1. Submit
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "job-2" }));

    // 2. Poll — failed
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        status: "FAILED",
        error: "GPU OOM",
      })
    );

    const result = await executeComfyRunPod(
      samplePrompt,
      "test-key",
      "ep-123",
      1,
      0
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("GPU OOM");
  });
});
