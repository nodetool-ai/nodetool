import { describe, it, expect, vi, afterEach } from "vitest";
import {
  atlasPoll,
  atlasSubmit,
  getApiKey,
  pickOutputUrl
} from "../src/atlascloud-base.js";

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------
describe("getApiKey", () => {
  const originalEnv = process.env.ATLASCLOUD_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ATLASCLOUD_API_KEY = originalEnv;
    } else {
      delete process.env.ATLASCLOUD_API_KEY;
    }
  });

  it("returns key from secrets object", () => {
    expect(getApiKey({ ATLASCLOUD_API_KEY: "from-secrets" })).toBe(
      "from-secrets"
    );
  });

  it("falls back to process.env", () => {
    delete process.env.ATLASCLOUD_API_KEY;
    process.env.ATLASCLOUD_API_KEY = "env-key";
    expect(getApiKey({})).toBe("env-key");
  });

  it("prefers secrets over process.env", () => {
    process.env.ATLASCLOUD_API_KEY = "env-key";
    expect(getApiKey({ ATLASCLOUD_API_KEY: "secrets-key" })).toBe("secrets-key");
  });

  it("trims whitespace from the resolved key", () => {
    expect(getApiKey({ ATLASCLOUD_API_KEY: "  padded  " })).toBe("padded");
  });

  it("throws when the key is missing", () => {
    delete process.env.ATLASCLOUD_API_KEY;
    expect(() => getApiKey({})).toThrow("ATLASCLOUD_API_KEY is not configured");
  });
});

// ---------------------------------------------------------------------------
// pickOutputUrl
// ---------------------------------------------------------------------------
describe("pickOutputUrl", () => {
  it("returns the first outputs[] entry when it's a string", () => {
    expect(pickOutputUrl({ outputs: ["https://x/y.png"] })).toBe(
      "https://x/y.png"
    );
  });

  it("returns outputs[0].url when entries are objects", () => {
    expect(
      pickOutputUrl({ outputs: [{ url: "https://x/y.mp4" }] })
    ).toBe("https://x/y.mp4");
  });

  it("falls back to the top-level output field", () => {
    expect(pickOutputUrl({ output: "https://x/y.png" })).toBe(
      "https://x/y.png"
    );
  });

  it("falls back to the top-level url field", () => {
    expect(pickOutputUrl({ url: "https://x/y.png" })).toBe("https://x/y.png");
  });

  it("throws when no URL is present", () => {
    expect(() => pickOutputUrl({})).toThrow("No output URL in result");
  });
});

// ---------------------------------------------------------------------------
// atlasSubmit
// ---------------------------------------------------------------------------
describe("atlasSubmit", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs a flat body (NOT nested under input) and returns the prediction id", async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { id: "pred-123" } })
      } as Response;
    }) as unknown as typeof fetch;

    const id = await atlasSubmit("k", "image", "google/nano-banana-2/text-to-image", {
      prompt: "a cat",
      aspect_ratio: "16:9"
    });

    expect(id).toBe("pred-123");
    expect(captured!.url).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateImage"
    );
    expect((captured!.init!.headers as Record<string, string>).Authorization)
      .toBe("Bearer k");
    const body = JSON.parse(captured!.init!.body as string);
    // Per Gap #3 in INTEGRATION.md: fields must be flat, not under `input`.
    expect(body).toEqual({
      model: "google/nano-banana-2/text-to-image",
      prompt: "a cat",
      aspect_ratio: "16:9"
    });
    expect(body.input).toBeUndefined();
  });

  it("uses the video endpoint for the video modality", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn(async (url: string | URL) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { id: "pred-2" } })
      } as Response;
    }) as unknown as typeof fetch;

    await atlasSubmit("k", "video", "bytedance/seedance-2.0/text-to-video", {
      prompt: "x"
    });

    expect(capturedUrl).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateVideo"
    );
  });

  it("throws when the response status is not ok", async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: "bad model" })
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      atlasSubmit("k", "image", "x/y/z", { prompt: "x" })
    ).rejects.toThrow("AtlasCloud submit 400");
  });

  it("throws when the body has no prediction id", async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} })
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      atlasSubmit("k", "image", "x/y/z", { prompt: "x" })
    ).rejects.toThrow("no prediction id");
  });

  it("does not retry — submit POST is non-idempotent", async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: false,
        status: 500,
        text: async () => "{}"
      } as Response;
    });
    global.fetch = fetchFn as unknown as typeof fetch;

    await expect(
      atlasSubmit("k", "image", "x/y/z", { prompt: "x" })
    ).rejects.toThrow("AtlasCloud submit 500");
    // CRITICAL: only one POST. Retrying a 5xx could double-bill if the upstream
    // request actually created the job.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// atlasPoll
// ---------------------------------------------------------------------------
describe("atlasPoll", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the data block when status is 'completed'", async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            data: { status: "completed", outputs: ["https://x/y.png"] }
          })
      } as Response;
    }) as unknown as typeof fetch;

    const out = await atlasPoll("k", "pred-1", {
      pollInterval: 0,
      maxAttempts: 5
    });
    expect(out.status).toBe("completed");
    expect(out.outputs).toEqual(["https://x/y.png"]);
  });

  it("polls until status flips from running to success", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      const status = calls < 3 ? "running" : "succeeded";
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({ data: { status, outputs: ["u"] } })
      } as Response;
    }) as unknown as typeof fetch;

    const out = await atlasPoll("k", "p", { pollInterval: 0, maxAttempts: 10 });
    expect(out.status).toBe("succeeded");
    expect(calls).toBe(3);
  });

  it("throws on a structured failure body with the error message", async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            data: { status: "failed", error: "empty prompt" }
          })
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      atlasPoll("k", "p", { pollInterval: 0, maxAttempts: 2 })
    ).rejects.toThrow("AtlasCloud job failed: empty prompt");
  });

  it("times out after maxAttempts", async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ data: { status: "running" } })
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      atlasPoll("k", "p", { pollInterval: 0, maxAttempts: 3 })
    ).rejects.toThrow("timed out");
  });
});
