import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getApiKey,
  isRefSet,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput,
  uploadFile,
  kieExecuteTask,
  kieExecuteSunoTask
} from "../src/nodes/kie-base.js";
import { KieAINode } from "../src/nodes/kie-dynamic.js";

/* ------------------------------------------------------------------ */
/*  Fetch mock helpers                                                 */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.KIE_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.KIE_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([116, 101, 115, 116]).buffer // "test"
  } as unknown as Response;
}

/* ================================================================== */
/*  getApiKey                                                          */
/* ================================================================== */

describe("getApiKey", () => {
  it("returns key from _secrets.KIE_API_KEY", () => {
    const key = getApiKey({ KIE_API_KEY: "secret-from-secrets" });
    expect(key).toBe("secret-from-secrets");
  });

  it("returns key from process.env.KIE_API_KEY", () => {
    process.env.KIE_API_KEY = "secret-from-env";
    const key = getApiKey({});
    expect(key).toBe("secret-from-env");
  });

  it("prefers _secrets over process.env", () => {
    process.env.KIE_API_KEY = "env-key";
    const key = getApiKey({ KIE_API_KEY: "secrets-key" });
    expect(key).toBe("secrets-key");
  });

  it("throws when no key available", () => {
    expect(() => getApiKey({})).toThrow("KIE_API_KEY is not configured");
  });

  it("throws when _secrets exists but KIE_API_KEY is empty string", () => {
    expect(() => getApiKey({ KIE_API_KEY: "" })).toThrow(
      "KIE_API_KEY is not configured"
    );
  });
});

/* ================================================================== */
/*  isRefSet                                                           */
/* ================================================================== */

describe("isRefSet", () => {
  it("returns true for { data: 'abc' }", () => {
    expect(isRefSet({ data: "abc" })).toBe(true);
  });

  it("returns true for { uri: 'http://example.com' }", () => {
    expect(isRefSet({ uri: "http://example.com" })).toBe(true);
  });

  it("returns true for object with both data and uri", () => {
    expect(isRefSet({ data: "abc", uri: "http://x.com" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRefSet(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRefSet(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isRefSet({})).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRefSet("")).toBe(false);
  });

  it("returns false for non-objects (number)", () => {
    expect(isRefSet(42)).toBe(false);
  });

  it("returns false for non-objects (boolean)", () => {
    expect(isRefSet(true)).toBe(false);
  });
});

/* ================================================================== */
/*  uploadImageInput                                                   */
/* ================================================================== */

describe("uploadImageInput", () => {
  const apiKey = "test-key";

  it("returns URL directly for external HTTP URIs", async () => {
    const url = await uploadImageInput(apiKey, {
      uri: "http://example.com/image.png"
    });
    expect(url).toBe("http://example.com/image.png");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns URL directly for HTTPS URIs", async () => {
    const url = await uploadImageInput(apiKey, {
      uri: "https://cdn.example.com/image.jpg"
    });
    expect(url).toBe("https://cdn.example.com/image.jpg");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does NOT skip localhost URIs (should try to upload)", async () => {
    // localhost URI has no data, so it should throw "Image has no data or URI"
    await expect(
      uploadImageInput(apiKey, { uri: "http://localhost:8000/img.png" })
    ).rejects.toThrow("Image has no data or URI");
  });

  it("does NOT skip 127.0.0.1 URIs", async () => {
    await expect(
      uploadImageInput(apiKey, { uri: "http://127.0.0.1:3000/img.png" })
    ).rejects.toThrow("Image has no data or URI");
  });

  it("throws for null", async () => {
    await expect(uploadImageInput(apiKey, null)).rejects.toThrow(
      "Image is required"
    );
  });

  it("throws for undefined", async () => {
    await expect(uploadImageInput(apiKey, undefined)).rejects.toThrow(
      "Image is required"
    );
  });

  it("throws for non-object (string)", async () => {
    await expect(uploadImageInput(apiKey, "not-an-object")).rejects.toThrow(
      "Image is required"
    );
  });

  it("throws for object without data or uri", async () => {
    await expect(uploadImageInput(apiKey, {})).rejects.toThrow(
      "Image has no data or URI"
    );
  });

  it("calls uploadFile for base64 data", async () => {
    const base64Data = Buffer.from("fake-image").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { downloadUrl: "https://cdn.kie.ai/uploaded.png" }
      })
    );
    const url = await uploadImageInput(apiKey, { data: base64Data });
    expect(url).toBe("https://cdn.kie.ai/uploaded.png");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/*  uploadAudioInput                                                   */
/* ================================================================== */

describe("uploadAudioInput", () => {
  const apiKey = "test-key";

  it("returns URL directly for external HTTP URIs", async () => {
    const url = await uploadAudioInput(apiKey, {
      uri: "http://example.com/audio.mp3"
    });
    expect(url).toBe("http://example.com/audio.mp3");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns URL directly for HTTPS URIs", async () => {
    const url = await uploadAudioInput(apiKey, {
      uri: "https://cdn.example.com/audio.wav"
    });
    expect(url).toBe("https://cdn.example.com/audio.wav");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does NOT skip localhost URIs", async () => {
    await expect(
      uploadAudioInput(apiKey, { uri: "http://localhost:9000/a.mp3" })
    ).rejects.toThrow("Audio has no data or URI");
  });

  it("throws for null", async () => {
    await expect(uploadAudioInput(apiKey, null)).rejects.toThrow(
      "Audio is required"
    );
  });

  it("throws for undefined", async () => {
    await expect(uploadAudioInput(apiKey, undefined)).rejects.toThrow(
      "Audio is required"
    );
  });

  it("throws for object without data or uri", async () => {
    await expect(uploadAudioInput(apiKey, {})).rejects.toThrow(
      "Audio has no data or URI"
    );
  });

  it("calls uploadFile for base64 data", async () => {
    const base64Data = Buffer.from("fake-audio").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { downloadUrl: "https://cdn.kie.ai/uploaded.mp3" }
      })
    );
    const url = await uploadAudioInput(apiKey, { data: base64Data });
    expect(url).toBe("https://cdn.kie.ai/uploaded.mp3");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/*  uploadVideoInput                                                   */
/* ================================================================== */

describe("uploadVideoInput", () => {
  const apiKey = "test-key";

  it("returns URL directly for external HTTP URIs", async () => {
    const url = await uploadVideoInput(apiKey, {
      uri: "http://example.com/video.mp4"
    });
    expect(url).toBe("http://example.com/video.mp4");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns URL directly for HTTPS URIs", async () => {
    const url = await uploadVideoInput(apiKey, {
      uri: "https://cdn.example.com/video.webm"
    });
    expect(url).toBe("https://cdn.example.com/video.webm");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does NOT skip localhost URIs", async () => {
    await expect(
      uploadVideoInput(apiKey, { uri: "http://localhost:5000/v.mp4" })
    ).rejects.toThrow("Video has no data or URI");
  });

  it("throws for null", async () => {
    await expect(uploadVideoInput(apiKey, null)).rejects.toThrow(
      "Video is required"
    );
  });

  it("throws for undefined", async () => {
    await expect(uploadVideoInput(apiKey, undefined)).rejects.toThrow(
      "Video is required"
    );
  });

  it("throws for object without data or uri", async () => {
    await expect(uploadVideoInput(apiKey, {})).rejects.toThrow(
      "Video has no data or URI"
    );
  });

  it("calls uploadFile for base64 data", async () => {
    const base64Data = Buffer.from("fake-video").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { downloadUrl: "https://cdn.kie.ai/uploaded.mp4" }
      })
    );
    const url = await uploadVideoInput(apiKey, { data: base64Data });
    expect(url).toBe("https://cdn.kie.ai/uploaded.mp4");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/*  uploadFile                                                         */
/* ================================================================== */

describe("uploadFile", () => {
  const apiKey = "test-key";
  const data = Buffer.from("test-file-content");

  it("successful upload returns downloadUrl", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { downloadUrl: "https://cdn.kie.ai/result.png" }
      })
    );
    const url = await uploadFile(apiKey, data, "images/uploads", "test.png");
    expect(url).toBe("https://cdn.kie.ai/result.png");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify it was a POST to the upload URL
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe(
      "https://kieai.redpandaai.co/api/file-stream-upload"
    );
    expect(callArgs[1].method).toBe("POST");
  });

  it("failed upload (non-ok status, success false) throws", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: false, message: "Upload error" }, 500)
    );
    await expect(
      uploadFile(apiKey, data, "images/uploads", "test.png")
    ).rejects.toThrow("Upload failed");
  });

  it("error code in response throws", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 401, message: "Invalid token" })
    );
    await expect(
      uploadFile(apiKey, data, "images/uploads", "test.png")
    ).rejects.toThrow("Unauthorized");
  });

  it("missing downloadUrl in response throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));
    await expect(
      uploadFile(apiKey, data, "images/uploads", "test.png")
    ).rejects.toThrow("No downloadUrl");
  });
});

/* ================================================================== */
/*  kieExecuteTask                                                     */
/* ================================================================== */

describe("kieExecuteTask", () => {
  const apiKey = "test-key";
  const model = "test-model";
  const input = { prompt: "hello" };

  it("successful flow: submit -> poll (success) -> download", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({
          code: 200,
          data: { taskId: "task_123" }
        });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({
              resultUrls: ["https://cdn.example.com/result.png"]
            })
          }
        });
      }
      if (urlStr.includes("cdn.example.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => null,
          text: async () => "",
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
        } as unknown as Response;
      }
      return jsonResponse({ error: "unknown" }, 404);
    });

    const result = await kieExecuteTask(apiKey, model, input, 0, 5);
    expect(result.taskId).toBe("task_123");
    expect(typeof result.data).toBe("string");
    // data should be base64 of [1,2,3,4]
    expect(Buffer.from(result.data, "base64")).toEqual(
      Buffer.from([1, 2, 3, 4])
    );
  });

  it("submit returns error code -> throws", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 401, message: "Unauthorized" })
    );
    await expect(kieExecuteTask(apiKey, model, input, 0, 1)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("poll returns failed state -> throws", async () => {
    const callCount = 0;
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_fail" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: { state: "failed", failMsg: "Model crashed" }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 5)).rejects.toThrow(
      "Task failed: Model crashed"
    );
  });

  it("no resultJson -> throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_nr" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: { state: "success" }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 5)).rejects.toThrow(
      "No resultJson"
    );
  });

  it("no taskId in submit response -> throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 200, data: {} }));
    await expect(kieExecuteTask(apiKey, model, input, 0, 1)).rejects.toThrow(
      "No taskId"
    );
  });

  it("submit returns non-ok HTTP status -> throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }, 500));
    await expect(kieExecuteTask(apiKey, model, input, 0, 1)).rejects.toThrow(
      "Submit failed"
    );
  });

  it("poll times out when state never reaches success/failed", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_timeout" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: { state: "processing" }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 2)).rejects.toThrow(
      "Task timed out"
    );
  });

  it("download fails when result URL fetch returns non-ok", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_dlf" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({
              resultUrls: ["https://cdn.example.com/fail.png"]
            })
          }
        });
      }
      if (urlStr.includes("cdn.example.com")) {
        return {
          ok: false,
          status: 404,
          json: async () => null,
          text: async () => "Not found",
          arrayBuffer: async () => new ArrayBuffer(0)
        } as unknown as Response;
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 5)).rejects.toThrow(
      "Failed to download"
    );
  });

  it("download fails when no resultUrls in resultJson", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_nru" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({})
          }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 5)).rejects.toThrow(
      "No resultUrls"
    );
  });

  it("download fails when recordInfo returns non-ok", async () => {
    let callIdx = 0;
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_dr" } });
      }
      if (urlStr.includes("recordInfo")) {
        callIdx++;
        if (callIdx === 1) {
          // pollStatus call - success
          return jsonResponse({
            code: 200,
            data: { state: "success" }
          });
        }
        // downloadResult call - fails
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => "err"
        } as unknown as Response;
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteTask(apiKey, model, input, 0, 5)).rejects.toThrow(
      "Failed to get result"
    );
  });
});

/* ================================================================== */
/*  kieExecuteSunoTask                                                 */
/* ================================================================== */

describe("kieExecuteSunoTask", () => {
  const apiKey = "test-key";
  const input = { prompt: "a song about coding" };

  it("successful Suno flow: submit -> poll (SUCCESS) -> download clip", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (
        urlStr.includes("/api/v1/generate") &&
        !urlStr.includes("record-info")
      ) {
        return jsonResponse({
          code: 200,
          data: { taskId: "suno_123" }
        });
      }
      if (urlStr.includes("record-info")) {
        return jsonResponse({
          code: 200,
          data: {
            status: "SUCCESS",
            response: {
              clips: [{ audioUrl: "https://cdn.example.com/song.mp3" }]
            }
          }
        });
      }
      if (urlStr.includes("cdn.example.com")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new Uint8Array([10, 20, 30]).buffer
        } as unknown as Response;
      }
      return jsonResponse({ error: "unknown" }, 404);
    });

    const result = await kieExecuteSunoTask(apiKey, input, 0, 5);
    expect(result.taskId).toBe("suno_123");
    expect(typeof result.data).toBe("string");
    expect(Buffer.from(result.data, "base64")).toEqual(
      Buffer.from([10, 20, 30])
    );
  });

  it("failed Suno status throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (
        urlStr.includes("/api/v1/generate") &&
        !urlStr.includes("record-info")
      ) {
        return jsonResponse({ code: 200, data: { taskId: "suno_fail" } });
      }
      if (urlStr.includes("record-info")) {
        return jsonResponse({
          code: 200,
          data: { status: "GENERATE_AUDIO_FAILED" }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteSunoTask(apiKey, input, 0, 5)).rejects.toThrow(
      "Suno task failed: GENERATE_AUDIO_FAILED"
    );
  });

  it("no clips in response throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (
        urlStr.includes("/api/v1/generate") &&
        !urlStr.includes("record-info")
      ) {
        return jsonResponse({ code: 200, data: { taskId: "suno_nc" } });
      }
      if (urlStr.includes("record-info")) {
        return jsonResponse({
          code: 200,
          data: {
            status: "SUCCESS",
            response: { clips: [] }
          }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteSunoTask(apiKey, input, 0, 5)).rejects.toThrow(
      "No clips"
    );
  });

  it("Suno submit error code throws", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 429, message: "Rate limited" })
    );
    await expect(kieExecuteSunoTask(apiKey, input, 0, 1)).rejects.toThrow(
      "Rate Limited"
    );
  });

  it("Suno poll timeout throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (
        urlStr.includes("/api/v1/generate") &&
        !urlStr.includes("record-info")
      ) {
        return jsonResponse({ code: 200, data: { taskId: "suno_to" } });
      }
      if (urlStr.includes("record-info")) {
        return jsonResponse({
          code: 200,
          data: { status: "GENERATING" }
        });
      }
      return jsonResponse({}, 404);
    });
    await expect(kieExecuteSunoTask(apiKey, input, 0, 2)).rejects.toThrow(
      "Suno task timed out"
    );
  });
});

/* ================================================================== */
/*  KieAINode (kie-dynamic.ts)                                         */
/* ================================================================== */

describe("KieAINode", () => {
  it("has correct static nodeType", () => {
    expect(KieAINode.nodeType).toBe("kie.dynamic_schema.KieAI");
  });

  it("has correct static title", () => {
    expect(KieAINode.title).toBe("Kie AI");
  });

  it("has correct static description", () => {
    expect(KieAINode.description).toContain("Dynamic Kie.ai node");
  });

  it("defaults() returns the current serialized metadata fields", () => {
    const node = new KieAINode();
    expect(node.serialize()).toEqual({ model_info: 0 });
  });

  it("throws on empty model_info", async () => {
    const node = new KieAINode();

    node.assign({
      model_info: ""
    });

    node.setDynamic("_secrets", { KIE_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow("model_info is empty");
  });

  it("throws on whitespace-only model_info", async () => {
    const node = new KieAINode();

    node.assign({
      model_info: "   "
    });

    node.setDynamic("_secrets", { KIE_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow("model_info is empty");
  });

  it("throws on missing API key", async () => {
    const node = new KieAINode();

    node.assign({
      model_info: "some docs"
    });

    await expect(node.process()).rejects.toThrow(
      "KIE_API_KEY is not configured"
    );
  });
});
