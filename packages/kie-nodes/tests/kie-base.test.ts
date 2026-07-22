import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getApiKey,
  isRefSet,
  parseCreditsConsumed,
  reportKieProviderCost,
  uploadImageInput,
  kieExecuteOmniDirect,
  kieExecuteTask
} from "../src/kie-base.js";

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------
describe("getApiKey", () => {
  const originalEnv = process.env.KIE_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.KIE_API_KEY = originalEnv;
    } else {
      delete process.env.KIE_API_KEY;
    }
  });

  it("returns key from secrets object", () => {
    expect(getApiKey({ KIE_API_KEY: "secret-from-secrets" })).toBe(
      "secret-from-secrets"
    );
  });

  it("falls back to process.env", () => {
    process.env.KIE_API_KEY = "env-key";
    expect(getApiKey({})).toBe("env-key");
  });

  it("prefers secrets over process.env", () => {
    process.env.KIE_API_KEY = "env-key";
    expect(getApiKey({ KIE_API_KEY: "secrets-key" })).toBe("secrets-key");
  });

  it("throws when key is not configured", () => {
    delete process.env.KIE_API_KEY;
    expect(() => getApiKey({})).toThrow("KIE_API_KEY is not configured");
  });

  it("throws when secrets is empty and env is not set", () => {
    delete process.env.KIE_API_KEY;
    expect(() => getApiKey({})).toThrow("KIE_API_KEY is not configured");
  });
});

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
// uploadImageInput
// ---------------------------------------------------------------------------
describe("uploadImageInput", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { downloadUrl: "https://kie.example/uploaded.png" }
      })
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uploads bytes from local storage-backed image URIs", async () => {
    const storage = {
      retrieve: vi
        .fn()
        .mockResolvedValue(Uint8Array.from([137, 80, 78, 71]))
    };

    const result = await uploadImageInput(
      "test-api-key",
      { type: "image", uri: "/api/storage/test-image.png" },
      { storage } as any
    );

    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/test-image.png");
    expect(result).toBe("https://kie.example/uploaded.png");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uploads bytes for asset:// refs via resolveAssetBytes", async () => {
    const storage = { retrieve: vi.fn().mockResolvedValue(null) };
    const resolveAssetBytes = vi
      .fn()
      .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) });

    const result = await uploadImageInput(
      "test-api-key",
      { type: "image", uri: "asset://asset-123" },
      { storage, resolveAssetBytes } as any
    );

    expect(resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123");
    expect(result).toBe("https://kie.example/uploaded.png");
  });

  it("uploads bytes via asset_id storage candidates when the uri misses", async () => {
    const storage = {
      retrieve: vi
        .fn()
        .mockImplementation(async (key: string) =>
          key === "/api/storage/asset-123.png"
            ? Uint8Array.from([137, 80, 78, 71])
            : null
        )
    };

    const result = await uploadImageInput(
      "test-api-key",
      { type: "image", uri: "/api/storage/stale.png", asset_id: "asset-123" },
      { storage } as any
    );

    expect(result).toBe("https://kie.example/uploaded.png");
  });
});

describe("kieExecuteOmniDirect", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns audioId from sync omni response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        data: { audioId: "ff6af85771af49b08bef5b0aa1cba56b", name: "Test" }
      })
    }) as unknown as typeof fetch;

    const result = await kieExecuteOmniDirect(
      "key",
      "/api/v1/omni/audio/create",
      { audio_id: "achernar", name: "Test" },
      "audioId"
    );

    expect(result).toEqual({
      data: "ff6af85771af49b08bef5b0aa1cba56b",
      items: ["ff6af85771af49b08bef5b0aa1cba56b"],
      taskId: ""
    });
  });

  it("accepts code 0 responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: { characterId: "char_123" }
      })
    }) as unknown as typeof fetch;

    const result = await kieExecuteOmniDirect(
      "key",
      "/api/v1/omni/character/create",
      { descriptions: "test", image_urls: ["https://example.com/a.png"] },
      "characterId"
    );

    expect(result.data).toBe("char_123");
  });
});

describe("parseCreditsConsumed", () => {
  it("reads numeric creditsConsumed from recordInfo payload", () => {
    expect(
      parseCreditsConsumed({ data: { creditsConsumed: 12, state: "success" } })
    ).toBe(12);
  });

  it("parses string creditsConsumed", () => {
    expect(parseCreditsConsumed({ data: { creditsConsumed: "5.5" } })).toBe(5.5);
  });

  it("returns undefined when creditsConsumed is missing", () => {
    expect(parseCreditsConsumed({ data: { state: "success" } })).toBeUndefined();
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
      currency: "USD"
    });
  });

  it("skips when credits are undefined", () => {
    const setProviderCost = vi.fn();
    reportKieProviderCost({ setProviderCost }, undefined);
    expect(setProviderCost).not.toHaveBeenCalled();
  });
});

describe("kieExecuteTask poll failure", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws when poll state is fail", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 200, data: { taskId: "task_fail" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: { state: "fail", failMsg: "Internal Error" }
        })
      }) as unknown as typeof fetch;

    await expect(
      kieExecuteTask("key", "gemini-omni-video", { prompt: "test", duration: "8" }, 1, 2)
    ).rejects.toThrow("Task failed: Internal Error");
  });

  it("returns creditsConsumed from successful poll", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 200, data: { taskId: "task_ok" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: { state: "success", creditsConsumed: 15 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            resultJson: JSON.stringify({ resultUrls: ["https://example.com/out.png"] })
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      }) as unknown as typeof fetch;

    const result = await kieExecuteTask(
      "key",
      "test-model",
      { prompt: "hello" },
      1,
      2
    );

    expect(result.creditsConsumed).toBe(15);
    expect(result.taskId).toBe("task_ok");
  });
});
