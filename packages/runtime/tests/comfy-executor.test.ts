import { describe, it, expect, vi, afterAll } from "vitest";
import { executeComfy } from "../src/comfy-executor.js";

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
    arrayBuffer: async () => new ArrayBuffer(0)
  } as Response;
}

function binaryResponse(data: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => data.buffer
  } as Response;
}

const samplePrompt = {
  "1": { class_type: "KSampler", inputs: { seed: 42 } }
};

describe("executeComfy", () => {
  it("submits, polls, and fetches images successfully", async () => {
    mockFetch.mockReset();

    // 1. Submit prompt
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "abc123" }));

    // 2. Poll history — result ready
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        abc123: {
          outputs: {
            "9": {
              images: [{ filename: "out.png", subfolder: "", type: "output" }]
            }
          }
        }
      })
    );

    // 3. Fetch image
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch.mockResolvedValueOnce(binaryResponse(imgBytes));

    const result = await executeComfy(samplePrompt, "127.0.0.1:8188", 1, 0);

    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].filename).toBe("out.png");
    expect(result.images![0].type).toBe("image");
    expect(result.images![0].data).toBe(
      Buffer.from(imgBytes).toString("base64")
    );
  });

  it("returns failed on submission error", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 400));

    const result = await executeComfy(samplePrompt, "127.0.0.1:8188", 1, 0);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Submit failed");
  });

  it("works with full URL (e.g. RunPod Pod)", async () => {
    mockFetch.mockReset();

    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "p1" }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        p1: { outputs: {} }
      })
    );

    const result = await executeComfy(
      samplePrompt,
      "https://pod123-8188.proxy.runpod.net",
      1,
      0
    );

    expect(result.status).toBe("completed");
    // Verify it used the full URL, not prepended http://
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://pod123-8188.proxy.runpod.net/prompt"
    );
  });

  it("returns failed on timeout", async () => {
    mockFetch.mockReset();

    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "p2" }));
    // Poll returns empty
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    const result = await executeComfy(samplePrompt, "127.0.0.1:8188", 1, 0);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Timeout");
  });
});
