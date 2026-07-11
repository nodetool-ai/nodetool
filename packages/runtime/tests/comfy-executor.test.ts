import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";

// Track the last created mock WebSocket instance so tests can emit events
let lastWsInstance: any = null;

vi.mock("ws", () => {
  const { EventEmitter } = require("events");
  class MockWebSocket extends EventEmitter {
    // Mirror the real `ws` readyState constants so code that checks
    // ws.readyState === WebSocket.CLOSING/CLOSED behaves as in production.
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = MockWebSocket.OPEN;
    constructor() {
      super();
      lastWsInstance = this;
      // Auto-open on next tick
      setImmediate(() => this.emit("open"));
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.emit("close");
    }
  }
  return { default: MockWebSocket };
});

// Must import AFTER vi.mock so the mock is in effect
const { executeComfy, uploadComfyFile } = await import(
  "../src/comfy-executor.js"
);

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

  it("fails fast when the socket closes during the submit window", async () => {
    // Regression: the socket accepts the handshake, then closes while POST
    // /prompt is in flight — before listenForCompletion attaches its own close
    // handler. The already-closed socket must fail fast instead of hanging for
    // the full timeout.
    mockFetch.mockImplementationOnce(async () => {
      // Simulate the WS being torn down mid-submit.
      if (lastWsInstance) lastWsInstance.readyState = 3; // CLOSED
      return jsonResponse({ prompt_id: "abc123" });
    });

    const handle = executeComfy(
      samplePrompt,
      "127.0.0.1:8188",
      undefined,
      60_000
    );
    const started = Date.now();
    const result = await handle.result;

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/closed before result streaming began/i);
    // Must not have waited anywhere near the 60s timeout.
    expect(Date.now() - started).toBeLessThan(5000);
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

  it("groups per-node outputs by media kind", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "px" }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        px: {
          outputs: {
            "9": {
              images: [{ filename: "img.png", subfolder: "", type: "output" }]
            },
            "12": {
              audio: [{ filename: "snd.wav", subfolder: "", type: "output" }]
            }
          }
        }
      })
    );
    // image bytes, then audio bytes
    mockFetch.mockResolvedValue(binaryResponse(new Uint8Array([1, 2, 3])));

    const handle = executeComfy(samplePrompt, "127.0.0.1:8188");
    await new Promise((r) => setTimeout(r, 50));
    lastWsInstance?.emit(
      "message",
      JSON.stringify({ type: "execution_success", data: { prompt_id: "px" } })
    );

    const result = await handle.result;
    expect(result.status).toBe("completed");
    expect(result.nodeOutputs?.["9"].images).toHaveLength(1);
    expect(result.nodeOutputs?.["9"].images?.[0].mimeType).toBe("image/png");
    expect(result.nodeOutputs?.["12"].audio).toHaveLength(1);
    expect(result.nodeOutputs?.["12"].audio?.[0].mimeType).toBe("audio/wav");
    // Flat images convenience list still populated
    expect(result.images).toHaveLength(1);
  });

  it("streams per-node outputs live on `executed` events", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ prompt_id: "ps" }));
    // /view downloads for the streamed file, then empty /history reconcile
    mockFetch.mockImplementation((url: string) =>
      url.includes("/history/")
        ? Promise.resolve(jsonResponse({ ps: { outputs: {} } }))
        : Promise.resolve(binaryResponse(new Uint8Array([1, 2, 3])))
    );

    const streamed: Array<{ nodeId: string; kinds: string[] }> = [];
    const handle = executeComfy(
      samplePrompt,
      "127.0.0.1:8188",
      undefined,
      600000,
      (nodeId, outputs) => {
        streamed.push({ nodeId, kinds: Object.keys(outputs) });
      }
    );
    await new Promise((r) => setTimeout(r, 50));
    // A save node finishes and reports its file
    lastWsInstance?.emit(
      "message",
      JSON.stringify({
        type: "executed",
        data: {
          prompt_id: "ps",
          node: "9",
          output: {
            images: [{ filename: "img.png", subfolder: "", type: "output" }]
          }
        }
      })
    );
    await new Promise((r) => setTimeout(r, 20));
    lastWsInstance?.emit(
      "message",
      JSON.stringify({ type: "execution_success", data: { prompt_id: "ps" } })
    );

    const result = await handle.result;
    expect(result.status).toBe("completed");
    // The output was streamed live (before completion), not only batched.
    expect(streamed).toEqual([{ nodeId: "9", kinds: ["images"] }]);
    // And it is reflected in the final result without a duplicate history fetch.
    expect(result.nodeOutputs?.["9"].images).toHaveLength(1);
  });

  it("uploadComfyFile POSTs to /upload/image and returns the stored name", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: "stored.png", subfolder: "" })
    );
    const name = await uploadComfyFile(
      "127.0.0.1:8188",
      new Uint8Array([0x89, 0x50]),
      "in.png",
      "image/png"
    );
    expect(name).toBe("stored.png");
    expect(mockFetch.mock.calls[0][0]).toBe("http://127.0.0.1:8188/upload/image");
    expect(mockFetch.mock.calls[0][1]?.method).toBe("POST");
  });

  it("uploadComfyFile prefixes the subfolder when present", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: "stored.wav", subfolder: "audio" })
    );
    const name = await uploadComfyFile(
      "127.0.0.1:8188",
      new Uint8Array([1]),
      "in.wav"
    );
    expect(name).toBe("audio/stored.wav");
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
