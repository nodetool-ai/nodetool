import { afterEach, describe, expect, it, vi } from "vitest";
import { getCostReconciler } from "@nodetool-ai/runtime";
import {
  isRefSet,
  kieCapability,
  kieExecute,
  registerKieCostReconciler,
  reportKieProviderCost,
  uploadAudioInput,
  uploadImageInput
} from "../src/kie-base.js";
import { RESULT_BYTES, RESULT_URL, finishedJob, scriptedKie } from "./scripted-kie.js";

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

// ---------------------------------------------------------------------------
// isRefSet
// ---------------------------------------------------------------------------
describe("isRefSet", () => {
  it("returns true when ref has data", () => {
    expect(isRefSet({ data: "base64data" })).toBe(true);
  });

  it("returns true when ref has uri", () => {
    expect(isRefSet({ uri: "https://example.com/image.png" })).toBe(true);
  });

  it("returns true when ref has both data and uri", () => {
    expect(isRefSet({ data: "data", uri: "uri" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRefSet(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRefSet(undefined)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isRefSet("string")).toBe(false);
    expect(isRefSet(42)).toBe(false);
    expect(isRefSet(true)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isRefSet({})).toBe(false);
  });

  it("returns false when data and uri are empty", () => {
    expect(isRefSet({ data: "", uri: "" })).toBe(false);
  });

  it("returns false when data and uri are null", () => {
    expect(isRefSet({ data: null, uri: null })).toBe(false);
  });

  it("returns true for an asset_id-only ref (resolved via the context)", () => {
    expect(isRefSet({ uri: "", data: null, asset_id: "asset-123" })).toBe(true);
  });

  it("returns false when asset_id is null or empty", () => {
    expect(isRefSet({ uri: "", data: null, asset_id: null })).toBe(false);
    expect(isRefSet({ asset_id: "" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input uploads
// ---------------------------------------------------------------------------
describe("uploadImageInput", () => {
  /** A context stand-in: storage for the byte resolver, and the upload call. */
  function uploadContext(extra: Record<string, unknown> = {}) {
    const uploadProviderMedia = vi.fn(async () => "https://kie.example/uploaded.png");
    return {
      context: { uploadProviderMedia, signal: undefined, ...extra } as never,
      uploadProviderMedia
    };
  }

  it("uploads bytes from local storage-backed image URIs", async () => {
    const storage = { retrieve: vi.fn().mockResolvedValue(PNG_HEADER) };
    const { context, uploadProviderMedia } = uploadContext({ storage });

    const result = await uploadImageInput(
      { type: "image", uri: "/api/storage/test-image.png" },
      context
    );

    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/test-image.png");
    expect(result).toBe("https://kie.example/uploaded.png");
    expect(uploadProviderMedia).toHaveBeenCalledWith({
      provider: "kie",
      bytes: PNG_HEADER,
      mimeType: "image/png",
      signal: undefined
    });
  });

  it("uploads bytes for asset:// refs via resolveAssetBytes", async () => {
    const storage = { retrieve: vi.fn().mockResolvedValue(null) };
    const resolveAssetBytes = vi.fn().mockResolvedValue({ bytes: PNG_HEADER });
    const { context } = uploadContext({ storage, resolveAssetBytes });

    const result = await uploadImageInput(
      { type: "image", uri: "asset://asset-123" },
      context
    );

    expect(resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123", {
      requireOwnedAsset: true
    });
    expect(result).toBe("https://kie.example/uploaded.png");
  });

  it("uploads bytes via asset_id storage candidates when the uri misses", async () => {
    const storage = {
      retrieve: vi
        .fn()
        .mockImplementation(async (key: string) =>
          key === "/api/storage/asset-123.png" ? PNG_HEADER : null
        )
    };
    const { context } = uploadContext({ storage });

    const result = await uploadImageInput(
      { type: "image", uri: "/api/storage/stale.png", asset_id: "asset-123" },
      context
    );

    expect(result).toBe("https://kie.example/uploaded.png");
  });

  it("declares the container the bytes carry", async () => {
    const { context, uploadProviderMedia } = uploadContext();
    await uploadImageInput({ type: "image", uri: "", data: JPEG_HEADER }, context);
    expect(uploadProviderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg" })
    );
  });

  it("passes a public URL through without uploading", async () => {
    const { context, uploadProviderMedia } = uploadContext();
    const result = await uploadImageInput(
      { type: "image", uri: "https://example.com/a.png" },
      context
    );
    expect(result).toBe("https://example.com/a.png");
    expect(uploadProviderMedia).not.toHaveBeenCalled();
  });

  it("falls back to the kind's type when the bytes name another", async () => {
    const { context, uploadProviderMedia } = uploadContext();
    await uploadAudioInput({ type: "audio", uri: "", data: PNG_HEADER }, context);
    expect(uploadProviderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/mpeg" })
    );
  });
});

// ---------------------------------------------------------------------------
// kieExecute: the context call and the output mapping
// ---------------------------------------------------------------------------
describe("kieExecute", () => {
  it("runs a job through the provider and downloads its first result", async () => {
    const { provider, context } = scriptedKie({
      endpoints: {
        "test-model": {
          output: finishedJob([RESULT_URL, "https://kie.cdn.test/second.bin"]),
          requestId: "task_ok",
          metadata: { creditsConsumed: 15 }
        }
      }
    });

    const result = await kieExecute(context, {
      model: "test-model",
      input: { prompt: "hello" },
      capability: "text_to_image",
      nodeId: "node-1"
    });

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "test-model",
      input: { prompt: "hello" }
    });
    expect(provider.endpointCalls[0].route).toBeUndefined();
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([RESULT_URL]);
    expect(result).toEqual({
      data: Buffer.from(RESULT_BYTES).toString("base64"),
      items: [Buffer.from(RESULT_BYTES).toString("base64")],
      taskId: "task_ok",
      creditsConsumed: 15
    });
  });

  it("reads a text result out of resultJson.resultObject", async () => {
    const { provider, context } = scriptedKie({
      endpoints: {
        "*": {
          output: {
            code: 200,
            data: {
              state: "success",
              resultJson: JSON.stringify({ resultObject: { lyrics: "la la" } })
            }
          },
          requestId: "task_txt"
        }
      }
    });

    const result = await kieExecute(context, {
      model: "m",
      input: {},
      capability: "text_to_image",
      resultObjectKey: "lyrics"
    });

    expect(result.data).toBe("la la");
    expect(provider.downloadCalls).toEqual([]);
  });

  it("names the task when a finished job has no resultJson", async () => {
    const { context } = scriptedKie({
      endpoints: { "*": { output: { code: 200, data: { state: "success" } }, requestId: "task_x" } }
    });
    await expect(
      kieExecute(context, { model: "m", input: {}, capability: "text_to_image" })
    ).rejects.toThrow("No resultJson in response (taskId: task_x)");
  });

  it("names the result URL and task when the download fails", async () => {
    const { context } = scriptedKie({
      endpoints: {
        "*": { output: finishedJob(["https://kie.cdn.test/missing.bin"]), requestId: "task_dl" }
      }
    });
    await expect(
      kieExecute(context, { model: "m", input: {}, capability: "text_to_image" })
    ).rejects.toThrow(
      "Failed to download from https://kie.cdn.test/missing.bin (taskId: task_dl): ScriptedProvider has no scripted download"
    );
  });

  it("runs a Suno call on the Suno route and downloads its first track", async () => {
    const SONG = "https://kie.cdn.test/song.mp3";
    const { provider, context } = scriptedKie({
      endpoints: {
        "generate-music": {
          output: { code: 200, data: { status: "SUCCESS", response: { sunoData: [{ audioUrl: SONG }] } } },
          requestId: "suno-1",
          metadata: { creditsConsumed: 6 }
        }
      },
      downloads: { [SONG]: new Uint8Array([4, 5]) }
    });

    const result = await kieExecute(context, {
      model: "generate-music",
      input: { prompt: "a shanty" },
      capability: "text_to_music",
      sunoEndpoint: "/api/v1/generate"
    });

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "generate-music",
      route: "suno:/api/v1/generate",
      input: { prompt: "a shanty" }
    });
    expect(result).toEqual({
      data: Buffer.from([4, 5]).toString("base64"),
      items: [Buffer.from([4, 5]).toString("base64")],
      taskId: "suno-1",
      creditsConsumed: 6
    });
  });

  it("reports a Suno answer without tracks", async () => {
    const { context } = scriptedKie({
      endpoints: { "*": { output: { code: 200, data: { status: "SUCCESS", response: {} } } } }
    });
    await expect(
      kieExecute(context, {
        model: "generate-music",
        input: {},
        capability: "text_to_music",
        sunoEndpoint: "/api/v1/generate"
      })
    ).rejects.toThrow("No sunoData in Suno response");
  });

  it("returns the id a direct endpoint answers with", async () => {
    const { provider, context } = scriptedKie({
      endpoints: {
        "gemini-omni-audio": {
          output: { code: 200, data: { audioId: "ff6af857", name: "Test" } }
        }
      }
    });

    const result = await kieExecute(context, {
      model: "gemini-omni-audio",
      input: { audio_id: "achernar", name: "Test" },
      capability: "text_to_image",
      directEndpoint: "/api/v1/omni/audio/create",
      responseIdKey: "audioId"
    });

    expect(provider.endpointCalls[0]).toMatchObject({
      route: "direct:/api/v1/omni/audio/create",
      input: { audio_id: "achernar", name: "Test" }
    });
    expect(result).toEqual({ data: "ff6af857", items: ["ff6af857"], taskId: "" });
  });

  it("reports a direct answer that lacks the id", async () => {
    const { context } = scriptedKie({
      endpoints: { "*": { output: { code: 0, data: {} } } }
    });
    await expect(
      kieExecute(context, {
        model: "gemini-omni-character",
        input: {},
        capability: "text_to_image",
        directEndpoint: "/api/v1/omni/character/create",
        responseIdKey: "characterId"
      })
    ).rejects.toThrow('No characterId in response: {"code":0,"data":{}}');
  });

  it("needs a processing context", async () => {
    await expect(
      kieExecute(undefined, { model: "m", input: {}, capability: "text_to_image" })
    ).rejects.toThrow("KIE nodes need a processing context");
  });
});

describe("kieCapability", () => {
  it("names each output type's capability", () => {
    expect(kieCapability("image")).toBe("text_to_image");
    expect(kieCapability("video")).toBe("text_to_video");
    expect(kieCapability("audio")).toBe("text_to_speech");
    expect(kieCapability("audio", true)).toBe("text_to_music");
    expect(kieCapability("text")).toBe("text_to_image");
  });
});

describe("reportKieProviderCost", () => {
  it("converts kie credits to USD when present", () => {
    const setProviderCost = vi.fn();
    reportKieProviderCost({ setProviderCost }, 7);
    expect(setProviderCost).toHaveBeenCalledWith("kie", 0.035, "USD", {
      billing_unit: "credits",
      quantity: 7,
      unit_price: 0.005,
      currency: "USD",
      provider_request_id: null
    });
  });

  it("carries the task id so the charge can be reconciled", () => {
    const setProviderCost = vi.fn();
    reportKieProviderCost({ setProviderCost }, 2, "task_9");
    expect(setProviderCost).toHaveBeenCalledWith(
      "kie",
      0.01,
      "USD",
      expect.objectContaining({ provider_request_id: "task_9" })
    );
  });

  it("skips when credits are undefined", () => {
    const setProviderCost = vi.fn();
    reportKieProviderCost({ setProviderCost }, undefined);
    expect(setProviderCost).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cost reconciler: the provider reads the credits, the pack prices them
// ---------------------------------------------------------------------------
describe("registerKieCostReconciler", () => {
  const envKey = process.env.KIE_API_KEY;

  afterEach(() => {
    if (envKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = envKey;
    vi.unstubAllGlobals();
  });

  it("prices the credits KieProvider.fetchBillingCost reads with the run's key", async () => {
    delete process.env.KIE_API_KEY;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 200, data: { state: "success", creditsConsumed: 8 } }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    registerKieCostReconciler();

    const reconciled = await getCostReconciler("kie")!({
      requestId: "task_9",
      secrets: { KIE_API_KEY: "user-key" }
    });

    expect(reconciled).toEqual({
      cost: 0.04,
      currency: "USD",
      quantity: 8,
      unit_price: 0.005
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_9");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer user-key");
  });

  it("answers null without a key and sends nothing", async () => {
    delete process.env.KIE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    registerKieCostReconciler();

    const reconciled = await getCostReconciler("kie")!({
      requestId: "task_9",
      secrets: {}
    });

    expect(reconciled).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
