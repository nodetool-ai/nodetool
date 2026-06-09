import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getApiKey,
  isSafeHttpUrl,
  resolveAssetBytes,
  resolveVideoDimensions,
  togetherGenerateImage,
  togetherTranscribe
} from "../src/together-base.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------
describe("getApiKey", () => {
  it("returns the trimmed secret", () => {
    expect(getApiKey({ TOGETHER_API_KEY: "  tk-123  " })).toBe("tk-123");
  });

  it("throws when neither secret nor env is set", () => {
    const saved = process.env.TOGETHER_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    try {
      expect(() => getApiKey({})).toThrow("TOGETHER_API_KEY is not configured");
    } finally {
      if (saved !== undefined) process.env.TOGETHER_API_KEY = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveAssetBytes
// ---------------------------------------------------------------------------
describe("resolveAssetBytes", () => {
  it("decodes inline base64 data", async () => {
    const out = await resolveAssetBytes({ data: "aGVsbG8=" }, undefined, "image");
    expect(Buffer.from(out!).toString()).toBe("hello");
  });

  it("decodes an inline data: URI", async () => {
    const out = await resolveAssetBytes(
      { data: "data:image/png;base64,aGVsbG8=" },
      undefined,
      "image"
    );
    expect(Buffer.from(out!).toString()).toBe("hello");
  });

  it("passes through inline Uint8Array data", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const out = await resolveAssetBytes({ data: bytes }, undefined, "audio");
    expect(out).toBe(bytes);
  });

  it("materializes internal URIs via context.storage", async () => {
    const bytes = Uint8Array.from([9, 9]);
    const storage = { retrieve: vi.fn().mockResolvedValue(bytes) };
    const out = await resolveAssetBytes(
      { uri: "/api/storage/x.png" },
      { storage } as never,
      "image"
    );
    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/x.png");
    expect(Array.from(out!)).toEqual([9, 9]);
  });

  it("resolves an asset:// uri via context.resolveAssetBytes", async () => {
    const pngBytes = Uint8Array.from([137, 80, 78, 71]);
    const storage = { retrieve: vi.fn().mockResolvedValue(null) };
    const resolve = vi.fn().mockResolvedValue({ bytes: pngBytes });
    const out = await resolveAssetBytes(
      { type: "image", uri: "asset://asset-123" },
      { storage, resolveAssetBytes: resolve } as never,
      "image"
    );
    expect(resolve).toHaveBeenCalledWith("asset://asset-123");
    expect(Array.from(out!)).toEqual([137, 80, 78, 71]);
  });

  it("fetches a public https url ref", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([0xaa]).buffer
    })) as unknown as typeof fetch;
    const out = await resolveAssetBytes(
      "https://cdn.example.org/a.png",
      undefined,
      "image"
    );
    expect(Array.from(out!)).toEqual([0xaa]);
  });

  it("returns null for empty / null refs", async () => {
    expect(await resolveAssetBytes(null, undefined, "image")).toBeNull();
    expect(await resolveAssetBytes("", undefined, "image")).toBeNull();
  });

  describe("SSRF guard — never fetches private / loopback / metadata hosts", () => {
    const blocked = [
      "http://localhost/a.png",
      "http://foo.localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://127.1/a.png",
      "http://0177.0.0.1/a.png",
      "http://0x7f.0.0.1/a.png",
      "http://0.0.0.0/a.png",
      "http://10.0.0.5/a.png",
      "http://192.168.1.10/a.png",
      "http://172.16.0.1/a.png",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/a.png",
      "http://[::ffff:127.0.0.1]/a.png",
      "http://[fe80::1]/a.png",
      "http://[fc00::1]/a.png"
    ];
    for (const uri of blocked) {
      it(`rejects ${uri}`, async () => {
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;
        await expect(
          resolveAssetBytes({ uri }, undefined, "image")
        ).rejects.toThrow("Cannot resolve");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(isSafeHttpUrl(uri)).toBe(false);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// resolveVideoDimensions
// ---------------------------------------------------------------------------
describe("resolveVideoDimensions", () => {
  it("maps known aspect + resolution presets", () => {
    expect(resolveVideoDimensions("16:9", "720p")).toEqual({ width: 1280, height: 720 });
    expect(resolveVideoDimensions("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
  });
  it("falls back to the MiniMax default for unknown combos", () => {
    expect(resolveVideoDimensions("21:9", "8k")).toEqual({ width: 1366, height: 768 });
  });
});

// ---------------------------------------------------------------------------
// togetherGenerateImage
// ---------------------------------------------------------------------------
describe("togetherGenerateImage", () => {
  it("posts to /v1/images/generations and decodes b64_json", async () => {
    let body: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.together.xyz/v1/images/generations");
      body = JSON.parse(init!.body as string);
      return { ok: true, json: async () => ({ data: [{ b64_json: "aGVsbG8=" }] }) } as Response;
    }) as unknown as typeof fetch;

    const out = await togetherGenerateImage("tk", "black-forest-labs/FLUX.1-schnell", {
      prompt: "a cat",
      width: 1024,
      height: 768,
      seed: 7
    });
    expect(Buffer.from(out).toString()).toBe("hello");
    expect(body).toMatchObject({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt: "a cat",
      width: 1024,
      height: 768,
      seed: 7,
      response_format: "b64_json"
    });
  });

  it("throws on a non-ok response", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => "bad request"
    })) as unknown as typeof fetch;
    await expect(
      togetherGenerateImage("tk", "m", { prompt: "x" })
    ).rejects.toThrow("Together image generation failed");
  });
});

// ---------------------------------------------------------------------------
// togetherTranscribe
// ---------------------------------------------------------------------------
describe("togetherTranscribe", () => {
  it("uploads multipart audio and returns the text", async () => {
    let isForm = false;
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.together.xyz/v1/audio/transcriptions");
      isForm = init!.body instanceof FormData;
      return { ok: true, json: async () => ({ text: "hello world" }) } as Response;
    }) as unknown as typeof fetch;

    const text = await togetherTranscribe("tk", "openai/whisper-large-v3", {
      audio: Uint8Array.from([1, 2, 3])
    });
    expect(text).toBe("hello world");
    expect(isForm).toBe(true);
  });
});
