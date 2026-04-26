import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RodinProvider,
  RODIN_3D_MODELS
} from "../../src/providers/rodin-provider.js";
import type {
  ImageTo3DParams,
  TextTo3DParams
} from "../../src/providers/types.js";

function createProvider(apiKey = "test-key"): RodinProvider {
  return new RodinProvider(
    { RODIN_API_KEY: apiKey },
    { pollIntervalMs: 1, maxPollAttempts: 50 }
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

function binaryResponse(bytes: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer,
    text: async () => "",
    json: async () => ({})
  } as Response;
}

describe("RodinProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Capability surface ---

  it("getAvailable3DModels returns the static catalogue when key is set", async () => {
    const p = createProvider();
    const models = await p.getAvailable3DModels();
    expect(models.length).toBe(RODIN_3D_MODELS.length);
    expect(models.map((m) => m.id)).toContain("rodin-gen-1");
    expect(models.map((m) => m.id)).toContain("rodin-sketch");
    for (const m of models) {
      expect(m.provider).toBe("rodin");
      expect(m.outputFormats).toContain("glb");
    }
  });

  it("getAvailable3DModels returns [] without API key", async () => {
    const p = new RodinProvider();
    const models = await p.getAvailable3DModels();
    expect(models).toEqual([]);
  });

  it("static catalogue has both text-to-3d and image-to-3d models", () => {
    const t = RODIN_3D_MODELS.filter((m) =>
      m.supportedTasks?.includes("text_to_3d")
    );
    const i = RODIN_3D_MODELS.filter((m) =>
      m.supportedTasks?.includes("image_to_3d")
    );
    expect(t.length).toBeGreaterThan(0);
    expect(i.length).toBeGreaterThan(0);
  });

  // --- Chat throws ---

  it("generateMessage throws (not supported)", async () => {
    const p = createProvider();
    await expect(
      p.generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow(/does not support chat/);
  });

  it("generateMessages throws on first iteration", async () => {
    const p = createProvider();
    const gen = p.generateMessages({ messages: [], model: "x" } as never);
    await expect(gen.next()).rejects.toThrow(/does not support chat/);
  });

  // --- Guards ---

  it("textTo3D throws when API key is missing", async () => {
    const p = new RodinProvider();
    const params: TextTo3DParams = {
      model: RODIN_3D_MODELS[2]!,
      prompt: "A cute robot"
    };
    await expect(p.textTo3D(params)).rejects.toThrow(/API key is not configured/);
  });

  it("textTo3D throws when prompt is empty", async () => {
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "" })
    ).rejects.toThrow(/prompt must not be empty/);
  });

  it("imageTo3D throws when API key is missing", async () => {
    const p = new RodinProvider();
    await expect(
      p.imageTo3D(new Uint8Array([1, 2, 3]), {
        model: RODIN_3D_MODELS[0]!
      })
    ).rejects.toThrow(/API key is not configured/);
  });

  it("imageTo3D throws when image is empty", async () => {
    const p = createProvider();
    await expect(
      p.imageTo3D(new Uint8Array(), { model: RODIN_3D_MODELS[0]! })
    ).rejects.toThrow(/image must not be empty/);
  });

  // --- textTo3D happy path ---

  it("textTo3D submits, polls, and returns mesh bytes", async () => {
    const meshBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // "glTF"
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["task-uuid-1"], subscription_key: "sub-1" })
      ) // submit
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "QUEUED" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ jobs: [{ status: "DONE" }] })
      ) // poll done
      .mockResolvedValueOnce(
        jsonResponse({ model_url: "https://rodin.example/x.glb" })
      ) // download URL
      .mockResolvedValueOnce(binaryResponse(meshBytes)); // download bytes

    const p = createProvider();
    const out = await p.textTo3D({
      model: RODIN_3D_MODELS[2]!,
      prompt: "a cute robot",
      seed: 42,
      outputFormat: "glb"
    });
    expect(out).toEqual(meshBytes);

    // Verify submit body
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(submitUrl).toBe("https://hyperhuman.deemos.com/api/v2/rodin");
    const body = JSON.parse(submitInit.body);
    expect(body).toMatchObject({
      prompt: "a cute robot",
      geometry_file_format: "GLB",
      seed: 42
    });

    // Verify status poll body
    const [statusUrl, statusInit] = fetchMock.mock.calls[1]!;
    expect(statusUrl).toBe("https://hyperhuman.deemos.com/api/v2/status");
    expect(JSON.parse(statusInit.body)).toEqual({ subscription_key: "sub-1" });

    // Verify download endpoint
    const [downloadInfoUrl, downloadInit] = fetchMock.mock.calls[3]!;
    expect(downloadInfoUrl).toBe(
      "https://hyperhuman.deemos.com/api/v2/download"
    );
    expect(JSON.parse(downloadInit.body)).toEqual({ task_uuid: "task-uuid-1" });
  });

  it("textTo3D omits seed when -1", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ model_url: "https://rodin.example/x.glb" })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1, 2, 3])));

    const p = createProvider();
    await p.textTo3D({
      model: RODIN_3D_MODELS[2]!,
      prompt: "x",
      seed: -1
    });
    const submittedBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(submittedBody).not.toHaveProperty("seed");
  });

  it("textTo3D throws when submit returns no uuid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ subscription_key: "sub-1" })
    );
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/no task uuid/);
  });

  it("textTo3D throws when submit returns no subscription_key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ uuids: ["t"] }));
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/subscription_key/);
  });

  it("textTo3D propagates upstream FAILED status with error message", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [{ status: "FAILED", error: "Geometry extraction failed" }]
        })
      );
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/Geometry extraction failed/);
  });

  it("textTo3D treats CANCELLED status as failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ jobs: [{ status: "CANCELLED" }] })
      );
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/Rodin task failed/);
  });

  it("textTo3D throws clear error on non-200 submit", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Bad payload" }, 400)
    );
    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/Rodin API error \(400\)/);
  });

  it("textTo3D times out when polling never completes", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2/rodin")) {
        return jsonResponse({ uuids: ["t"], subscription_key: "s" });
      }
      // Never DONE
      return jsonResponse({ jobs: [{ status: "PROCESSING" }] });
    });
    const p = new RodinProvider(
      { RODIN_API_KEY: "k" },
      { pollIntervalMs: 1, maxPollAttempts: 3 }
    );
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/timed out/);
  });

  it("textTo3D handles empty jobs array as 'still pending' (not failure)", async () => {
    let pollCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2/rodin")) {
        return jsonResponse({ uuids: ["t"], subscription_key: "s" });
      }
      if (url.endsWith("/v2/status")) {
        pollCount++;
        if (pollCount < 3) return jsonResponse({ jobs: [] }); // no jobs yet
        return jsonResponse({ jobs: [{ status: "DONE" }] });
      }
      if (url.endsWith("/v2/download")) {
        return jsonResponse({ model_url: "https://rodin.example/x.glb" });
      }
      return binaryResponse(new Uint8Array([9, 9, 9]));
    });
    const p = createProvider();
    const out = await p.textTo3D({
      model: RODIN_3D_MODELS[2]!,
      prompt: "x"
    });
    expect(out).toEqual(new Uint8Array([9, 9, 9]));
    expect(pollCount).toBe(3);
  });

  // --- imageTo3D happy path ---

  it("imageTo3D submits an encoded image, polls, and returns mesh bytes", async () => {
    const meshBytes = new Uint8Array([0xab, 0xcd, 0xef]);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["task-img"], subscription_key: "sub-img" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ model_url: "https://rodin.example/img.glb" })
      )
      .mockResolvedValueOnce(binaryResponse(meshBytes));

    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01
    ]);
    const p = createProvider();
    const out = await p.imageTo3D(png, {
      model: RODIN_3D_MODELS[0]!,
      outputFormat: "glb"
    });
    expect(out).toEqual(meshBytes);

    const submittedBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(submittedBody.images).toHaveLength(1);
    expect(submittedBody.images[0].type).toBe("png");
    expect(submittedBody.images[0].data).toBeTruthy();
    expect(submittedBody.geometry_file_format).toBe("GLB");
  });

  it("imageTo3D detects JPEG vs PNG from magic header", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ model_url: "https://rodin.example/x.glb" })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const p = createProvider();
    await p.imageTo3D(jpeg, { model: RODIN_3D_MODELS[0]! });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.images[0].type).toBe("jpeg");
  });

  it("imageTo3D forwards the optional prompt", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ model_url: "https://rodin.example/x.glb" })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));

    const p = createProvider();
    await p.imageTo3D(new Uint8Array([0xff, 0xd8, 0xff]), {
      model: RODIN_3D_MODELS[0]!,
      prompt: "guide me"
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.prompt).toBe("guide me");
  });

  // --- download fallbacks ---

  it("uses `url` field as fallback when `model_url` is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(
        jsonResponse({ url: "https://rodin.example/fallback.glb" })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([7])));

    const p = createProvider();
    const out = await p.textTo3D({
      model: RODIN_3D_MODELS[2]!,
      prompt: "x"
    });
    expect(out).toEqual(new Uint8Array([7]));
  });

  it("throws when neither model_url nor url is in download response", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ uuids: ["t"], subscription_key: "s" })
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const p = createProvider();
    await expect(
      p.textTo3D({ model: RODIN_3D_MODELS[2]!, prompt: "x" })
    ).rejects.toThrow(/No download URL/);
  });
});
