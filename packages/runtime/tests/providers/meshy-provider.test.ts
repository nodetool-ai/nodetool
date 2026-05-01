import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MeshyProvider,
  MESHY_3D_MODELS
} from "../../src/providers/meshy-provider.js";
import type {
  ImageTo3DParams,
  TextTo3DParams
} from "../../src/providers/types.js";

function createProvider(apiKey = "test-key"): MeshyProvider {
  // Tighten polling so timeouts in tests are sub-second
  return new MeshyProvider(
    { MESHY_API_KEY: apiKey },
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

describe("MeshyProvider", () => {
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
    expect(models.length).toBe(MESHY_3D_MODELS.length);
    expect(models.map((m) => m.id)).toContain("meshy-4");
    expect(models.map((m) => m.id)).toContain("meshy-4-image");
    for (const m of models) {
      expect(m.provider).toBe("meshy");
      expect(m.outputFormats).toContain("glb");
    }
  });

  it("getAvailable3DModels returns [] without API key", async () => {
    const p = new MeshyProvider();
    const models = await p.getAvailable3DModels();
    expect(models).toEqual([]);
  });

  it("static catalogue has both text-to-3d and image-to-3d models", () => {
    const t = MESHY_3D_MODELS.filter((m) =>
      m.supportedTasks?.includes("text_to_3d")
    );
    const i = MESHY_3D_MODELS.filter((m) =>
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

  // --- textTo3D guards ---

  it("textTo3D throws when API key is missing", async () => {
    const p = new MeshyProvider();
    const params: TextTo3DParams = {
      model: MESHY_3D_MODELS[0]!,
      prompt: "A cute robot"
    };
    await expect(p.textTo3D(params)).rejects.toThrow(/API key is not configured/);
  });

  it("textTo3D throws when prompt is empty", async () => {
    const p = createProvider();
    const params: TextTo3DParams = {
      model: MESHY_3D_MODELS[0]!,
      prompt: ""
    };
    await expect(p.textTo3D(params)).rejects.toThrow(/prompt must not be empty/);
  });

  // --- textTo3D happy path ---

  it("textTo3D submits, polls, and returns mesh bytes", async () => {
    const meshBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // "glTF"
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "task-123" })) // submit
      .mockResolvedValueOnce(jsonResponse({ status: "PENDING" })) // poll 1
      .mockResolvedValueOnce(jsonResponse({ status: "IN_PROGRESS" })) // poll 2
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://meshy.example/abc.glb" }
        })
      ) // poll 3 (done)
      .mockResolvedValueOnce(binaryResponse(meshBytes)); // download

    const p = createProvider();
    const params: TextTo3DParams = {
      model: MESHY_3D_MODELS[0]!,
      prompt: "A futuristic spaceship",
      negativePrompt: "blurry",
      artStyle: "realistic",
      seed: 7,
      outputFormat: "glb"
    };
    const out = await p.textTo3D(params);
    expect(out).toEqual(meshBytes);

    // Submit was the first call; verify body shape
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(submitUrl).toBe("https://api.meshy.ai/v2/text-to-3d");
    expect(submitInit.method).toBe("POST");
    expect(submitInit.headers.Authorization).toBe("Bearer test-key");
    const submittedBody = JSON.parse(submitInit.body);
    expect(submittedBody).toMatchObject({
      mode: "preview",
      prompt: "A futuristic spaceship",
      negative_prompt: "blurry",
      art_style: "realistic",
      seed: 7
    });
  });

  it("textTo3D omits seed when -1 (random)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "task-x" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://meshy.example/x.glb" }
        })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1, 2, 3])));

    const p = createProvider();
    await p.textTo3D({
      model: MESHY_3D_MODELS[0]!,
      prompt: "x",
      seed: -1
    });
    const submittedBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(submittedBody).not.toHaveProperty("seed");
  });

  it("textTo3D propagates upstream FAILED status with error message", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "task-fail" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "FAILED",
          task_error: { message: "Mesh extraction failed" }
        })
      );

    const p = createProvider();
    await expect(
      p.textTo3D({ model: MESHY_3D_MODELS[0]!, prompt: "x" })
    ).rejects.toThrow(/Mesh extraction failed/);
  });

  it("textTo3D throws clear error on non-200 submit", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Bad model id" }, 400)
    );
    const p = createProvider();
    await expect(
      p.textTo3D({ model: MESHY_3D_MODELS[0]!, prompt: "x" })
    ).rejects.toThrow(/Meshy API error \(400\)/);
  });

  it("textTo3D times out when polling never completes", async () => {
    // Submit succeeds, but every poll returns IN_PROGRESS
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2/text-to-3d")) {
        return jsonResponse({ result: "task-stuck" });
      }
      return jsonResponse({ status: "IN_PROGRESS" });
    });
    const p = new MeshyProvider(
      { MESHY_API_KEY: "k" },
      { pollIntervalMs: 1, maxPollAttempts: 3 }
    );
    await expect(
      p.textTo3D({ model: MESHY_3D_MODELS[0]!, prompt: "x" })
    ).rejects.toThrow(/timed out/);
  });

  it("textTo3D respects timeoutSeconds when shorter than default", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2/text-to-3d")) {
        return jsonResponse({ result: "task-tt" });
      }
      return jsonResponse({ status: "IN_PROGRESS" });
    });
    // pollInterval=10ms, default max=50, but timeoutSeconds=0.05 → 5 attempts
    const p = new MeshyProvider(
      { MESHY_API_KEY: "k" },
      { pollIntervalMs: 10, maxPollAttempts: 50 }
    );
    await expect(
      p.textTo3D({
        model: MESHY_3D_MODELS[0]!,
        prompt: "x",
        timeoutSeconds: 0.05
      })
    ).rejects.toThrow(/timed out/);
    // 1 submit + 5 polls = 6 fetches
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  // --- imageTo3D guards ---

  it("imageTo3D throws when API key is missing", async () => {
    const p = new MeshyProvider();
    await expect(
      p.imageTo3D(new Uint8Array([1, 2, 3]), {
        model: MESHY_3D_MODELS[2]!
      })
    ).rejects.toThrow(/API key is not configured/);
  });

  it("imageTo3D throws when image is empty", async () => {
    const p = createProvider();
    await expect(
      p.imageTo3D(new Uint8Array(), { model: MESHY_3D_MODELS[2]! })
    ).rejects.toThrow(/image must not be empty/);
  });

  // --- imageTo3D happy path ---

  it("imageTo3D submits a data URI, polls, and returns mesh bytes", async () => {
    const meshBytes = new Uint8Array([0xab, 0xcd, 0xef]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "task-img" })) // submit
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://meshy.example/img.glb" }
        })
      )
      .mockResolvedValueOnce(binaryResponse(meshBytes));

    // PNG magic header → data URI mime should be image/png
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01
    ]);
    const p = createProvider();
    const out = await p.imageTo3D(png, {
      model: MESHY_3D_MODELS[2]!,
      outputFormat: "glb"
    });
    expect(out).toEqual(meshBytes);

    const submittedBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(submittedBody.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("imageTo3D detects JPEG fallback when not PNG", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://meshy.example/x.glb" }
        })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const p = createProvider();
    await p.imageTo3D(jpeg, { model: MESHY_3D_MODELS[2]! });
    const submittedBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(submittedBody.image_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  // --- texture refine step ---

  it("textTo3D runs preview then refine when enableTextures is true", async () => {
    const refinedBytes = new Uint8Array([0x01, 0x02, 0x03]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "preview-task" }))        // preview submit
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://meshy.example/preview.glb" } })) // preview poll
      .mockResolvedValueOnce(jsonResponse({ result: "refine-task" }))         // refine submit
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://meshy.example/refined.glb" } })) // refine poll
      .mockResolvedValueOnce(binaryResponse(refinedBytes));                   // download refined

    const p = createProvider();
    const out = await p.textTo3D({
      model: MESHY_3D_MODELS[0]!,
      prompt: "A dragon",
      enableTextures: true
    });
    expect(out).toEqual(refinedBytes);

    // Verify refine submit payload
    const refineSubmitBody = JSON.parse(fetchMock.mock.calls[2]![1].body);
    expect(refineSubmitBody).toMatchObject({
      mode: "refine",
      preview_task_id: "preview-task"
    });
    // 5 total fetches: preview submit, preview poll, refine submit, refine poll, download
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("textTo3D skips refine when enableTextures is false", async () => {
    const previewBytes = new Uint8Array([0xaa, 0xbb]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "preview-task" }))
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://meshy.example/p.glb" } }))
      .mockResolvedValueOnce(binaryResponse(previewBytes));

    const p = createProvider();
    const out = await p.textTo3D({
      model: MESHY_3D_MODELS[0]!,
      prompt: "x",
      enableTextures: false
    });
    expect(out).toEqual(previewBytes);
    // Only 3 fetches: submit, poll, download — no refine
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // --- format negotiation ---

  it("falls back to glb URL when requested format is missing in response", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://meshy.example/only.glb" } // no fbx
        })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([7, 8, 9])));

    const p = createProvider();
    const out = await p.textTo3D({
      model: MESHY_3D_MODELS[0]!,
      prompt: "x",
      outputFormat: "fbx"
    });
    expect(out).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("throws when neither requested format nor glb URL is present", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: {} })
      );

    const p = createProvider();
    await expect(
      p.textTo3D({
        model: MESHY_3D_MODELS[0]!,
        prompt: "x",
        outputFormat: "obj"
      })
    ).rejects.toThrow(/No model URL/);
  });
});
