import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";

// Track the last created mock WebSocket instance so tests can emit events
let lastWsInstance: any = null;

vi.mock("ws", () => {
  const { EventEmitter } = require("events");
  class MockWebSocket extends EventEmitter {
    constructor() {
      super();
      lastWsInstance = this;
      // Auto-open on next tick
      setImmediate(() => this.emit("open"));
    }
    close() {
      this.emit("close");
    }
  }
  return { default: MockWebSocket };
});

// Must import AFTER vi.mock so the mock is in effect
const { executeComfy } = await import("../src/comfy-executor.js");

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
  beforeEach(() => {
    mockFetch.mockReset();
    lastWsInstance = null;
  });

  it("submits, polls, and fetches images successfully", async () => {
    // Submit prompt
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "abc123" }));

    // History fetch (after WS signals completion)
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        abc123: {
          outputs: {
            "9": {
              images: [
                { filename: "out.png", subfolder: "", type: "output" }
              ]
            }
          }
        }
      })
    );
    mockFetch.mockResolvedValueOnce(binaryResponse(imgBytes));

    const handle = executeComfy(samplePrompt, "127.0.0.1:8188");

    // Wait for WS connection + submit, then send execution_success
    await new Promise((r) => setTimeout(r, 50));
    if (lastWsInstance) {
      lastWsInstance.emit(
        "message",
        JSON.stringify({
          type: "execution_success",
          data: { prompt_id: "abc123" }
        })
      );
    }

    const result = await handle.result;
    expect(result.status).toBe("completed");
    expect(result.images).toHaveLength(1);
    expect(result.images![0].filename).toBe("out.png");
  });

  it("returns failed on submission error", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 400));

    const handle = executeComfy(samplePrompt, "127.0.0.1:8188");
    const result = await handle.result;

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Submit failed");
  });

  it("works with full URL (e.g. RunPod Pod)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "p1" }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        p1: { outputs: {} }
      })
    );

    const handle = executeComfy(
      samplePrompt,
      "https://pod123-8188.proxy.runpod.net"
    );

    await new Promise((r) => setTimeout(r, 50));
    if (lastWsInstance) {
      lastWsInstance.emit(
        "message",
        JSON.stringify({
          type: "execution_success",
          data: { prompt_id: "p1" }
        })
      );
    }

    const result = await handle.result;
    expect(result.status).toBe("completed");
    // Verify it used the full URL, not prepended http://
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://pod123-8188.proxy.runpod.net/prompt"
    );
  });

  it("returns failed on timeout", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "p2" }));

    const handle = executeComfy(
      samplePrompt,
      "127.0.0.1:8188",
      undefined,
      100 // 100ms timeout
    );

    // Don't send any WS message — should timeout
    const result = await handle.result;

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Timeout");
  });
});
