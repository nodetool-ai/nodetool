import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getReveApiKey,
  postprocessingArray,
  refToBase64,
  refToBytes,
  reveGenerate
} from "../src/reve-base.js";

describe("getReveApiKey", () => {
  const originalEnv = process.env.REVE_API_KEY;
  afterEach(() => {
    if (originalEnv !== undefined) process.env.REVE_API_KEY = originalEnv;
    else delete process.env.REVE_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns key from secrets object", () => {
    expect(getReveApiKey({ REVE_API_KEY: "from-secrets" })).toBe("from-secrets");
  });

  it("falls back to process.env", () => {
    process.env.REVE_API_KEY = "env-key";
    expect(getReveApiKey({})).toBe("env-key");
  });

  it("throws when key is not configured", () => {
    delete process.env.REVE_API_KEY;
    expect(() => getReveApiKey({})).toThrow("REVE_API_KEY is not configured");
  });
});

describe("refToBytes / refToBase64", () => {
  it("decodes base64 string data", async () => {
    const bytes = await refToBytes({ data: Buffer.from("hi").toString("base64") });
    expect(Buffer.from(bytes).toString()).toBe("hi");
  });

  it("strips a data: URI prefix from inline data", async () => {
    const data = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ data });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("decodes a data: URI in the uri field", async () => {
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    expect(await refToBase64({ uri })).toBe(Buffer.from("png").toString("base64"));
  });

  it("retrieves bytes from storage by URI", async () => {
    const storage = {
      retrieve: vi.fn().mockResolvedValue(Uint8Array.from([7, 8, 9]))
    };
    const bytes = await refToBytes({ uri: "asset://x" }, { storage });
    expect([...bytes]).toEqual([7, 8, 9]);
    expect(storage.retrieve).toHaveBeenCalledWith("asset://x");
  });

  it("resolves an asset:// ref via context.resolveAssetBytes when storage returns null", async () => {
    const ctx = {
      storage: { retrieve: vi.fn().mockResolvedValue(null) },
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };
    const bytes = await refToBytes(
      { type: "image", uri: "asset://asset-123" },
      ctx
    );
    expect([...bytes]).toEqual([137, 80, 78, 71]);
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123");
  });

  it("throws without data or uri", async () => {
    await expect(refToBytes({})).rejects.toThrow("Image has no data or URI");
  });
});

describe("postprocessingArray", () => {
  it("maps none to an empty array", () => {
    expect(postprocessingArray("none")).toEqual([]);
    expect(postprocessingArray(undefined)).toEqual([]);
  });
  it("wraps a single operation", () => {
    expect(postprocessingArray("upscale")).toEqual(["upscale"]);
  });
});

describe("reveGenerate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to the endpoint with bearer auth and returns the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ image: "QkFTRTY0", request_id: "req_1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await reveGenerate("secret-key", "create", {
      prompt: "a cat",
      aspect_ratio: "3:2",
      postprocessing: [],
      bogus: ""
    });

    expect(res.image).toBe("QkFTRTY0");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/create");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    // Empty / empty-array fields are stripped from the body.
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ prompt: "a cat", aspect_ratio: "3:2" });
  });

  it("throws on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 402 })
    );
    await expect(reveGenerate("k", "create", { prompt: "x" })).rejects.toThrow(
      "Reve API error (402)"
    );
  });

  it("throws on a flagged content violation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content_violation: true }), { status: 200 })
    );
    await expect(reveGenerate("k", "create", { prompt: "x" })).rejects.toThrow(
      "content policy violation"
    );
  });
});
