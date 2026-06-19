/**
 * Mutation-hardening for MeshyProvider: exact model catalogue, the pure
 * image-mime / base64 helpers, computeMaxAttempts arithmetic, the submit /
 * poll / download HTTP flow (URLs, headers, status guards, error messages,
 * timeout), and seed/format edge cases. Uses a stubbed global fetch.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MeshyProvider,
  MESHY_3D_MODELS,
  detectImageMime,
  bytesToBase64,
  buildTextTo3DPayload
} from "../../src/providers/meshy-provider.js";
import type { TextTo3DParams } from "../../src/providers/types.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]);

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
    headers: new Headers(),
    arrayBuffer: async () => bytes.buffer,
    text: async () => "",
    json: async () => ({})
  } as Response;
}
const provider = (opts = {}) =>
  new MeshyProvider({ MESHY_API_KEY: "test-key" }, { pollIntervalMs: 1, maxPollAttempts: 50, ...opts });
const txt = (over: Partial<TextTo3DParams> = {}): TextTo3DParams => ({
  model: MESHY_3D_MODELS[0]!,
  prompt: "x",
  ...over
});

describe("Meshy pure helpers", () => {
  it("detectImageMime returns png only for the full 8-byte signature", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    // exactly the 8 magic bytes (boundary: length === PNG_MAGIC.length)
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png"
    );
  });
  it("detectImageMime returns jpeg when too short", () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array([]))).toBe("image/jpeg");
  });
  it("detectImageMime returns jpeg when any signature byte differs", () => {
    // Differ at the very last magic byte to exercise the full loop.
    const almost = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00, 0xff]);
    expect(detectImageMime(almost)).toBe("image/jpeg");
    // Differ at the first byte.
    expect(detectImageMime(new Uint8Array([0x00, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/jpeg"
    );
  });
  it("bytesToBase64 encodes exactly", () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe("AQID");
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });

  it("buildTextTo3DPayload includes only the truthy/valid optional fields", () => {
    // Bare prompt → just mode + prompt.
    expect(buildTextTo3DPayload({ model: MESHY_3D_MODELS[0]!, prompt: "p" })).toEqual({
      mode: "preview",
      prompt: "p"
    });
    // All optionals present and valid.
    expect(
      buildTextTo3DPayload({
        model: MESHY_3D_MODELS[0]!,
        prompt: "p",
        artStyle: "realistic",
        negativePrompt: "blur",
        seed: 0 // boundary: 0 >= 0 is included
      })
    ).toEqual({
      mode: "preview",
      prompt: "p",
      art_style: "realistic",
      negative_prompt: "blur",
      seed: 0
    });
    // Falsy/invalid optionals dropped: empty strings + negative seed.
    expect(
      buildTextTo3DPayload({
        model: MESHY_3D_MODELS[0]!,
        prompt: "p",
        artStyle: "",
        negativePrompt: "",
        seed: -1
      })
    ).toEqual({ mode: "preview", prompt: "p" });
    // null seed dropped (!= null).
    expect(
      buildTextTo3DPayload({ model: MESHY_3D_MODELS[0]!, prompt: "p", seed: null as never })
    ).toEqual({ mode: "preview", prompt: "p" });
    // positive seed included.
    expect(
      buildTextTo3DPayload({ model: MESHY_3D_MODELS[0]!, prompt: "p", seed: 9 }).seed
    ).toBe(9);
  });
});

describe("Meshy metadata", () => {
  it("exposes provider id and required secret", () => {
    expect(provider().provider).toBe("meshy");
    expect(MeshyProvider.requiredSecrets()).toEqual(["MESHY_API_KEY"]);
  });

  it("publishes the exact 3D model catalogue", () => {
    expect(MESHY_3D_MODELS).toEqual([
      {
        id: "meshy-4",
        name: "Meshy-4 Text-to-3D",
        provider: "meshy",
        supportedTasks: ["text_to_3d"],
        outputFormats: ["glb", "fbx", "obj", "usdz"]
      },
      {
        id: "meshy-3-turbo",
        name: "Meshy-3 Turbo Text-to-3D",
        provider: "meshy",
        supportedTasks: ["text_to_3d"],
        outputFormats: ["glb", "fbx", "obj", "usdz"]
      },
      {
        id: "meshy-4-image",
        name: "Meshy-4 Image-to-3D",
        provider: "meshy",
        supportedTasks: ["image_to_3d"],
        outputFormats: ["glb", "fbx", "obj", "usdz"]
      },
      {
        id: "meshy-3-turbo-image",
        name: "Meshy-3 Turbo Image-to-3D",
        provider: "meshy",
        supportedTasks: ["image_to_3d"],
        outputFormats: ["glb", "fbx", "obj", "usdz"]
      }
    ]);
  });
});

describe("Meshy HTTP flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("submit POSTs to the text endpoint with Bearer auth + json content type", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t1" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));
    await provider().textTo3D(txt({ artStyle: "realistic", negativePrompt: "blur", seed: 0 }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.meshy.ai/v2/text-to-3d");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(init.body)).toEqual({
      mode: "preview",
      prompt: "x",
      art_style: "realistic",
      negative_prompt: "blur",
      seed: 0 // seed >= 0 is included (boundary)
    });
    // poll URL is base + endpoint + "/" + taskId, with auth headers
    const [pollUrl, pollInit] = fetchMock.mock.calls[1]!;
    expect(pollUrl).toBe("https://api.meshy.ai/v2/text-to-3d/t1");
    expect(pollInit.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
  });

  it("omits falsy/absent optional fields (empty style, empty prompt, negative seed)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));
    // Empty-string artStyle/negativePrompt are falsy → must not appear; seed -1 < 0 → dropped.
    await provider().textTo3D(txt({ artStyle: "", negativePrompt: "", seed: -1 }));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ mode: "preview", prompt: "x" });
  });

  it("includes seed 0 (boundary) and a positive seed", async () => {
    for (const seed of [0, 5]) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ result: "t" }))
        .mockResolvedValueOnce(
          jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
        )
        .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));
      await provider().textTo3D(txt({ seed }));
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body).seed).toBe(seed);
    }
  });

  it("accepts a 202 submit status", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }, 202))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([4])));
    expect([...(await provider().textTo3D(txt()))]).toEqual([4]);
  });

  it("throws on a non-2xx submit with status and body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ e: 1 }, 400));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      'Meshy API error (400): {"e":1}'
    );
  });

  it("throws when submit returns no/blank/non-string task id", async () => {
    for (const result of [undefined, "", 123]) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ result }));
      await expect(provider().textTo3D(txt())).rejects.toThrow(
        /Meshy submit returned no task id/
      );
    }
  });

  it("throws on a non-200 poll response with status and body", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(jsonResponse({ msg: "no" }, 500));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      'Meshy API poll error (500): {"msg":"no"}'
    );
  });

  it("throws on FAILED with the task error message", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(jsonResponse({ status: "FAILED", task_error: { message: "boom" } }));
    await expect(provider().textTo3D(txt())).rejects.toThrow("Meshy task failed: boom");
  });

  it("throws on EXPIRED, defaulting the message to Unknown error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(jsonResponse({ status: "EXPIRED" }));
    await expect(provider().textTo3D(txt())).rejects.toThrow("Meshy task failed: Unknown error");
  });

  it("times out after exactly maxPollAttempts polls with the elapsed-seconds message", async () => {
    fetchMock.mockImplementation(async (u: string) =>
      u.endsWith("/v2/text-to-3d") ? jsonResponse({ result: "t" }) : jsonResponse({ status: "PENDING" })
    );
    const p = new MeshyProvider({ MESHY_API_KEY: "k" }, { pollIntervalMs: 1000, maxPollAttempts: 3 });
    await expect(p.textTo3D(txt())).rejects.toThrow(
      "Meshy task t timed out after 3s" // 3 attempts * 1000ms / 1000
    );
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 submit + 3 polls
  });

  it("falls back to the default attempt cap when no maxPollAttempts is given", async () => {
    fetchMock.mockImplementation(async (u: string) =>
      u.endsWith("/v2/text-to-3d") ? jsonResponse({ result: "t" }) : jsonResponse({ status: "PENDING" })
    );
    const p = new MeshyProvider({ MESHY_API_KEY: "k" }, { pollIntervalMs: 0 });
    await expect(p.textTo3D(txt())).rejects.toThrow(/timed out/);
    expect(fetchMock).toHaveBeenCalledTimes(121); // 1 submit + 120 default polls
  });

  it("computeMaxAttempts: positive timeout shortens, zero/negative use the default", async () => {
    const run = async (timeoutSeconds: number | undefined, expectedFetches: number) => {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (u: string) =>
        u.endsWith("/v2/text-to-3d") ? jsonResponse({ result: "t" }) : jsonResponse({ status: "PENDING" })
      );
      const p = new MeshyProvider({ MESHY_API_KEY: "k" }, { pollIntervalMs: 10, maxPollAttempts: 4 });
      await expect(p.textTo3D(txt({ timeoutSeconds }))).rejects.toThrow(/timed out/);
      expect(fetchMock).toHaveBeenCalledTimes(expectedFetches);
    };
    await run(0.05, 6); // floor(50/10)=5 polls + 1 submit
    await run(0, 5); // <= 0 → default cap 4 + 1 submit
    await run(-3, 5); // negative → default cap 4 + 1 submit
    await run(undefined, 5); // absent → default cap 4 + 1 submit
  });

  it("download honors the requested format case-insensitively, with glb fallback", async () => {
    // requested "GLB" lowercased finds the "glb" url
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/g.glb", fbx: "https://m/f.fbx" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([7])));
    await provider().textTo3D(txt({ outputFormat: "FBX" }));
    expect(fetchMock.mock.calls[2]![0]).toBe("https://m/f.fbx");
  });

  it("download falls back to glb when the requested format is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/only.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([8])));
    await provider().textTo3D(txt({ outputFormat: "obj" }));
    expect(fetchMock.mock.calls[2]![0]).toBe("https://m/only.glb");
  });

  it("throws when neither requested format nor glb is present", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCEEDED", model_urls: { fbx: "x" } }));
    await expect(provider().textTo3D(txt({ outputFormat: "obj" }))).rejects.toThrow(
      "No model URL found in Meshy response for format: obj"
    );
  });

  it("throws a clean error (not a TypeError) when model_urls is entirely absent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCEEDED" }));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      "No model URL found in Meshy response for format: glb"
    );
  });

  it("uses an empty download error body when text() rejects", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => {
          throw new Error("nope");
        }
      } as Response);
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      /Failed to download Meshy result \(500\): $/
    );
  });

  it("refuses to download from a private-IP model URL (SSRF guard)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://169.254.169.254/model.glb" }
        })
      );
    await expect(provider().textTo3D(txt())).rejects.toThrow(/unsafe URL/);
    // Submit + poll happened, but the download fetch was never attempted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the download itself fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "t" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/x.glb" } })
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => "missing"
      } as Response);
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      "Failed to download Meshy result (404): missing"
    );
  });

  it("image-to-3d posts a data URI to the image endpoint and polls it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "img1" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/i.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([2])));
    await provider().imageTo3D(PNG, { model: MESHY_3D_MODELS[2]! });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.meshy.ai/v1/image-to-3d");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      image_url: `data:image/png;base64,${bytesToBase64(PNG)}`
    });
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.meshy.ai/v1/image-to-3d/img1");
  });

  it("refine submit POSTs mode=refine to the text endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ result: "prev" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/p.glb" } })
      )
      .mockResolvedValueOnce(jsonResponse({ result: "ref" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://m/r.glb" } })
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([3])));
    await provider().textTo3D(txt({ enableTextures: true }));
    expect(fetchMock.mock.calls[2]![0]).toBe("https://api.meshy.ai/v2/text-to-3d");
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toEqual({
      mode: "refine",
      preview_task_id: "prev"
    });
    expect(fetchMock.mock.calls[3]![0]).toBe("https://api.meshy.ai/v2/text-to-3d/ref");
  });
});
