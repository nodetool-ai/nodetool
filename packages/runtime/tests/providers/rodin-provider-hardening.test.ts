/**
 * Mutation-hardening for RodinProvider: pure helpers (image-type detection,
 * encoding, output-format normalization, payload builders), the exact model
 * catalogue, and the submit (/v2/rodin) → poll (/v2/status) → download
 * (/v2/download) HTTP flow — URLs, methods, headers, bodies, status guards,
 * error messages, no-jobs retries, terminal statuses, and timeout. Uses a
 * stubbed global fetch. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RodinProvider,
  RODIN_3D_MODELS,
  detectImageType,
  encodeImageForRodin,
  rodinOutputFormat,
  applyRodinSeed,
  buildRodinTextPayload,
  buildRodinImagePayload
} from "../../src/providers/rodin-provider.js";
import type { TextTo3DParams } from "../../src/providers/types.js";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    text: async () => ""
  } as Response;
}
const provider = (opts = {}) =>
  new RodinProvider({ RODIN_API_KEY: "test-key" }, { pollIntervalMs: 1, maxPollAttempts: 50, ...opts });
const txt = (over: Partial<TextTo3DParams> = {}): TextTo3DParams => ({
  model: RODIN_3D_MODELS[0]!,
  prompt: "x",
  ...over
});
/** submit → poll(DONE) → download-info → download-file */
function happyChain(fetchMock: ReturnType<typeof vi.fn>, bytes = new Uint8Array([1])) {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ uuids: ["u1"], subscription_key: "sk1" }))
    .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "Done" }] }))
    .mockResolvedValueOnce(jsonResponse({ model_url: "https://r/out.glb" }))
    .mockResolvedValueOnce(binaryResponse(bytes));
}

describe("Rodin pure helpers", () => {
  it("detectImageType returns jpeg only for the FF D8 FF signature", () => {
    expect(detectImageType(JPEG)).toBe("jpeg");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpeg");
  });
  it("detectImageType defaults to png for non-jpeg and short inputs", () => {
    expect(detectImageType(PNG)).toBe("png");
    expect(detectImageType(new Uint8Array([0x00, 0x01, 0x02]))).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBe("png"); // too short
  });
  it("detectImageType requires every jpeg signature byte", () => {
    expect(detectImageType(new Uint8Array([0x00, 0xd8, 0xff]))).toBe("png"); // byte 0 wrong
    expect(detectImageType(new Uint8Array([0xff, 0x00, 0xff]))).toBe("png"); // byte 1 wrong
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0x00]))).toBe("png"); // byte 2 wrong
  });
  it("encodeImageForRodin pairs the detected type with base64 bytes", () => {
    expect(encodeImageForRodin(new Uint8Array([1, 2, 3]))).toEqual({
      type: "png",
      data: "AQID"
    });
    expect(encodeImageForRodin(JPEG)).toEqual({
      type: "jpeg",
      data: Buffer.from(JPEG).toString("base64")
    });
  });
  it("rodinOutputFormat upper-cases the format, defaulting to GLB", () => {
    expect(rodinOutputFormat(undefined)).toBe("GLB");
    expect(rodinOutputFormat("fbx")).toBe("FBX");
  });
  it("applyRodinSeed attaches only a non-negative seed", () => {
    const p1: Record<string, unknown> = {};
    applyRodinSeed(p1, 0); // boundary: 0 >= 0
    expect(p1).toStrictEqual({ seed: 0 });
    const p2: Record<string, unknown> = {};
    applyRodinSeed(p2, 7);
    expect(p2).toStrictEqual({ seed: 7 });
    const p3: Record<string, unknown> = {};
    applyRodinSeed(p3, -1); // negative → dropped
    expect(p3).toStrictEqual({});
    const p4: Record<string, unknown> = {};
    applyRodinSeed(p4, null); // null → dropped
    applyRodinSeed(p4, undefined); // undefined → dropped
    expect(p4).toStrictEqual({});
  });
  it("buildRodinTextPayload includes seed only when >= 0", () => {
    expect(buildRodinTextPayload("p", "GLB", undefined)).toEqual({
      prompt: "p",
      geometry_file_format: "GLB"
    });
    expect(buildRodinTextPayload("p", "GLB", 0)).toEqual({
      prompt: "p",
      geometry_file_format: "GLB",
      seed: 0
    });
    expect(buildRodinTextPayload("p", "GLB", -1)).toEqual({
      prompt: "p",
      geometry_file_format: "GLB"
    });
    expect(buildRodinTextPayload("p", "GLB", null).seed).toBeUndefined();
  });
  const enc = { type: "png" as const, data: "AQID" };
  it("buildRodinImagePayload omits prompt/seed when absent or invalid", () => {
    expect(buildRodinImagePayload(enc, "GLB", undefined, undefined)).toEqual({
      images: [enc],
      geometry_file_format: "GLB"
    });
  });
  it("buildRodinImagePayload omits empty prompt and negative seed", () => {
    expect(buildRodinImagePayload(enc, "GLB", "", -1)).toStrictEqual({
      images: [enc],
      geometry_file_format: "GLB"
    });
  });
  it("buildRodinImagePayload includes seed 0 (boundary)", () => {
    expect(buildRodinImagePayload(enc, "GLB", undefined, 0)).toStrictEqual({
      images: [enc],
      geometry_file_format: "GLB",
      seed: 0
    });
  });
  it("buildRodinImagePayload includes a truthy prompt and positive seed", () => {
    expect(buildRodinImagePayload(enc, "GLB", "hat", 5)).toStrictEqual({
      images: [enc],
      geometry_file_format: "GLB",
      prompt: "hat",
      seed: 5
    });
  });
});

describe("Rodin metadata", () => {
  it("exposes provider id and required secret", () => {
    expect(provider().provider).toBe("rodin");
    expect(RodinProvider.requiredSecrets()).toEqual(["RODIN_API_KEY"]);
  });
  it("publishes the exact 3D model catalogue", () => {
    const fmts = ["glb", "fbx", "obj", "usdz"];
    expect(RODIN_3D_MODELS).toEqual([
      {
        id: "rodin-gen-1",
        name: "Rodin Gen-1 Image-to-3D",
        provider: "rodin",
        supportedTasks: ["image_to_3d"],
        outputFormats: fmts
      },
      {
        id: "rodin-gen-1-turbo",
        name: "Rodin Gen-1 Turbo Image-to-3D",
        provider: "rodin",
        supportedTasks: ["image_to_3d"],
        outputFormats: fmts
      },
      {
        id: "rodin-sketch",
        name: "Rodin Sketch Text-to-3D",
        provider: "rodin",
        supportedTasks: ["text_to_3d"],
        outputFormats: fmts
      }
    ]);
  });
});

describe("Rodin capability gating + chat", () => {
  it("lists models only when a key is set", async () => {
    expect(await provider().getAvailable3DModels()).toEqual(RODIN_3D_MODELS);
    expect(await new RodinProvider().getAvailable3DModels()).toEqual([]);
  });
  it("rejects chat generation", async () => {
    await expect(provider().generateMessage({ messages: [], model: "x" } as never)).rejects.toThrow(
      "does not support chat generation"
    );
    await expect(
      provider().generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat generation");
  });
});

describe("Rodin HTTP flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("textTo3D guards: empty prompt and missing key", async () => {
    await expect(provider().textTo3D(txt({ prompt: "" }))).rejects.toThrow(
      "prompt must not be empty"
    );
    await expect(new RodinProvider().textTo3D(txt())).rejects.toThrow(
      "Rodin API key is not configured"
    );
  });

  it("imageTo3D guards: empty image and missing key", async () => {
    await expect(
      provider().imageTo3D(new Uint8Array(), { model: RODIN_3D_MODELS[0]! })
    ).rejects.toThrow("image must not be empty");
    await expect(
      new RodinProvider().imageTo3D(JPEG, { model: RODIN_3D_MODELS[0]! })
    ).rejects.toThrow("Rodin API key is not configured");
  });

  it("textTo3D submits, polls, downloads with documented requests", async () => {
    happyChain(fetchMock, new Uint8Array([7, 8]));
    const out = await provider().textTo3D(txt({ seed: 3 }));
    expect([...out]).toEqual([7, 8]);

    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(submitUrl).toBe("https://hyperhuman.deemos.com/api/v2/rodin");
    expect(submitInit.method).toBe("POST");
    expect(submitInit.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(submitInit.body)).toEqual({
      prompt: "x",
      geometry_file_format: "GLB",
      seed: 3
    });

    const [pollUrl, pollInit] = fetchMock.mock.calls[1]!;
    expect(pollUrl).toBe("https://hyperhuman.deemos.com/api/v2/status");
    expect(pollInit.method).toBe("POST");
    expect(JSON.parse(pollInit.body)).toEqual({ subscription_key: "sk1" });

    const [dlInfoUrl, dlInfoInit] = fetchMock.mock.calls[2]!;
    expect(dlInfoUrl).toBe("https://hyperhuman.deemos.com/api/v2/download");
    expect(dlInfoInit.method).toBe("POST");
    expect(JSON.parse(dlInfoInit.body)).toEqual({ task_uuid: "u1" });

    expect(fetchMock.mock.calls[3]![0]).toBe("https://r/out.glb");
  });

  it("textTo3D defaults the geometry format to GLB and honors a custom format", async () => {
    happyChain(fetchMock);
    await provider().textTo3D(txt());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).geometry_file_format).toBe("GLB");

    fetchMock.mockReset();
    happyChain(fetchMock);
    await provider().textTo3D(txt({ outputFormat: "obj" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).geometry_file_format).toBe("OBJ");
  });

  it("imageTo3D submits an encoded image with prompt", async () => {
    happyChain(fetchMock);
    await provider().imageTo3D(JPEG, { model: RODIN_3D_MODELS[0]!, prompt: "blue" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.images).toEqual([
      { type: "jpeg", data: Buffer.from(JPEG).toString("base64") }
    ]);
    expect(body.prompt).toBe("blue");
  });

  it("submit accepts 202 and rejects other non-2xx with status + body", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }, 202))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ url: "https://r/x" }))
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1])));
    expect([...(await provider().textTo3D(txt()))]).toEqual([1]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ e: 1 }, 500));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      'Rodin API error (500): {"e":1}'
    );
  });

  it("submit throws when uuids or subscription_key are missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscription_key: "s" }));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      /Rodin submit returned no task uuid/
    );
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ uuids: ["u"] }));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      /Rodin submit returned no subscription_key/
    );
  });

  it("poll throws on a non-200 response with status + body", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ m: "x" }, 503));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      'Rodin API poll error (503): {"m":"x"}'
    );
  });

  it("poll waits through empty/absent jobs then resolves on DONE", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({})) // no jobs key → [] → retry
      .mockResolvedValueOnce(jsonResponse({ jobs: [] })) // empty jobs → retry
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ url: "https://r/y" }))
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([2])));
    expect([...(await provider().textTo3D(txt()))]).toEqual([2]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("poll throws on each terminal failure status with the job error", async () => {
    for (const status of ["FAILED", "ERROR", "CANCELLED"]) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
        .mockResolvedValueOnce(jsonResponse({ jobs: [{ status, error: "nope" }] }));
      await expect(provider().textTo3D(txt())).rejects.toThrow("Rodin task failed: nope");
    }
  });

  it("poll defaults the failure message to Unknown error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "FAILED" }] }));
    await expect(provider().textTo3D(txt())).rejects.toThrow("Rodin task failed: Unknown error");
  });

  it("times out after exactly maxPollAttempts with the elapsed-seconds message", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (u.endsWith("/v2/rodin"))
        return jsonResponse({ uuids: ["u"], subscription_key: "s" });
      return jsonResponse({ jobs: [{ status: "PENDING" }] });
    });
    const p = new RodinProvider({ RODIN_API_KEY: "k" }, { pollIntervalMs: 1000, maxPollAttempts: 2 });
    await expect(p.textTo3D(txt())).rejects.toThrow("Rodin task timed out after 2s");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 submit + 2 polls
  });

  it("falls back to the default attempt cap when no maxPollAttempts is given", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (u.endsWith("/v2/rodin"))
        return jsonResponse({ uuids: ["u"], subscription_key: "s" });
      return jsonResponse({ jobs: [{ status: "PENDING" }] });
    });
    const p = new RodinProvider({ RODIN_API_KEY: "k" }, { pollIntervalMs: 0 });
    await expect(p.textTo3D(txt())).rejects.toThrow(/timed out/);
    expect(fetchMock).toHaveBeenCalledTimes(121); // 1 submit + 120 default polls
  });

  it("computeMaxAttempts: positive timeout shortens; zero/negative/absent use the cap", async () => {
    const run = async (timeoutSeconds: number | undefined, expectedFetches: number) => {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (u: string) => {
        if (u.endsWith("/v2/rodin"))
          return jsonResponse({ uuids: ["u"], subscription_key: "s" });
        return jsonResponse({ jobs: [{ status: "PENDING" }] });
      });
      const p = new RodinProvider({ RODIN_API_KEY: "k" }, { pollIntervalMs: 10, maxPollAttempts: 4 });
      await expect(p.textTo3D(txt({ timeoutSeconds }))).rejects.toThrow(/timed out/);
      expect(fetchMock).toHaveBeenCalledTimes(expectedFetches);
    };
    await run(0.05, 6); // floor(50/10)=5 polls + submit
    await run(0, 5); // <= 0 → cap 4 + submit
    await run(-2, 5); // negative → cap 4 + submit
    await run(undefined, 5); // absent → cap 4 + submit
  });

  it("download: info non-200 throws with status + body", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ e: "x" }, 404));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      'Failed to get Rodin download URL (404): {"e":"x"}'
    );
  });

  it("download: falls back from model_url to url, and throws when neither present", async () => {
    // url fallback path
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ url: "https://r/fallback" }))
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([4])));
    await provider().textTo3D(txt());
    expect(fetchMock.mock.calls[3]![0]).toBe("https://r/fallback");

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ other: 1 }));
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      /No download URL in Rodin response/
    );
  });

  it("download: failed file fetch throws (empty body when text rejects)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ uuids: ["u"], subscription_key: "s" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ status: "DONE" }] }))
      .mockResolvedValueOnce(jsonResponse({ model_url: "https://r/z" }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error("x");
        }
      } as Response);
    await expect(provider().textTo3D(txt())).rejects.toThrow(
      /Failed to download Rodin result \(500\): $/
    );
  });
});
