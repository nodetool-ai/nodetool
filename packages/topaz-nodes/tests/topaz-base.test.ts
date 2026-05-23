import { describe, it, expect, vi, afterEach } from "vitest";
import {
  containerContentType,
  getApiKey,
  refToBytes,
  sourceContainerFromRef,
  topazExecuteImageTask,
  topazExecuteVideoTask,
  type TopazImageSpec,
  type TopazVideoMetadata,
  type TopazVideoSpec
} from "../src/topaz-base.js";

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------
describe("getApiKey", () => {
  const originalEnv = process.env.TOPAZ_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TOPAZ_API_KEY = originalEnv;
    } else {
      delete process.env.TOPAZ_API_KEY;
    }
  });

  it("returns key from secrets object", () => {
    expect(getApiKey({ TOPAZ_API_KEY: "from-secrets" })).toBe("from-secrets");
  });

  it("falls back to process.env", () => {
    process.env.TOPAZ_API_KEY = "env-key";
    expect(getApiKey({})).toBe("env-key");
  });

  it("prefers secrets over process.env", () => {
    process.env.TOPAZ_API_KEY = "env-key";
    expect(getApiKey({ TOPAZ_API_KEY: "secrets-key" })).toBe("secrets-key");
  });

  it("throws when key is not configured", () => {
    delete process.env.TOPAZ_API_KEY;
    expect(() => getApiKey({})).toThrow("TOPAZ_API_KEY is not configured");
  });
});

// ---------------------------------------------------------------------------
// refToBytes
// ---------------------------------------------------------------------------
describe("refToBytes", () => {
  it("decodes base64 string data", async () => {
    const bytes = await refToBytes({ data: Buffer.from("hi").toString("base64") });
    expect(Buffer.from(bytes).toString()).toBe("hi");
  });

  it("returns Uint8Array data as-is", async () => {
    const src = Uint8Array.from([1, 2, 3]);
    const bytes = await refToBytes({ data: src });
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("decodes a data: URI", async () => {
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ uri });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("retrieves bytes from storage by URI", async () => {
    const storage = {
      retrieve: vi.fn().mockResolvedValue(Uint8Array.from([9, 8, 7]))
    };
    const bytes = await refToBytes(
      { uri: "/api/storage/x.png" },
      { storage } as never
    );
    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/x.png");
    expect([...bytes]).toEqual([9, 8, 7]);
  });

  it("throws when neither data nor uri is set", async () => {
    await expect(refToBytes({})).rejects.toThrow("Asset has no data or URI");
  });
});

// ---------------------------------------------------------------------------
// topazExecuteImageTask
// ---------------------------------------------------------------------------
describe("topazExecuteImageTask", () => {
  const originalFetch = global.fetch;
  const spec: TopazImageSpec = {
    submitEndpoint: "https://api.topazlabs.com/image/v1/enhance/async",
    statusEndpoint: "https://api.topazlabs.com/image/v1/status/{process_id}",
    downloadEndpoint: "https://api.topazlabs.com/image/v1/download/{process_id}",
    pollInterval: 0,
    maxAttempts: 5
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("submits, polls, and downloads the result bytes", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.endsWith("/enhance/async")) {
        return { ok: true, json: async () => ({ process_id: "pid-1" }) } as Response;
      }
      if (u.includes("/status/")) {
        return { ok: true, json: async () => ({ status: "Completed" }) } as Response;
      }
      if (u.includes("/download/")) {
        return {
          ok: true,
          json: async () => ({ url: "https://cdn.topaz/result.png" })
        } as Response;
      }
      if (u === "https://cdn.topaz/result.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([42, 43]).buffer
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const out = await topazExecuteImageTask(
      "key",
      spec,
      { model: "Standard V2", scale: 2, output_width: 0 },
      Uint8Array.from([1, 2, 3])
    );

    expect([...out]).toEqual([42, 43]);
    expect(calls[0]).toBe(
      "POST https://api.topazlabs.com/image/v1/enhance/async"
    );
    expect(calls.some((c) => c.includes("/status/pid-1"))).toBe(true);
    expect(calls.some((c) => c.includes("/download/pid-1"))).toBe(true);
  });

  it("throws when submit returns no process id", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({})
    })) as unknown as typeof fetch;

    await expect(
      topazExecuteImageTask("key", spec, {}, Uint8Array.from([1]))
    ).rejects.toThrow("did not return a process_id");
  });
});

// ---------------------------------------------------------------------------
// sourceContainerFromRef
// ---------------------------------------------------------------------------
describe("sourceContainerFromRef", () => {
  it("prefers explicit format field", () => {
    expect(sourceContainerFromRef({ format: "mov", uri: "/tmp/x.mp4" })).toBe(
      "mov"
    );
  });

  it("strips a leading dot from format", () => {
    expect(sourceContainerFromRef({ format: ".MKV" })).toBe("mkv");
  });

  it("derives from URI extension when format is missing", () => {
    expect(sourceContainerFromRef({ uri: "/tmp/clip.MOV" })).toBe("mov");
    expect(sourceContainerFromRef({ uri: "https://x/y.webm?token=z" })).toBe(
      "webm"
    );
  });

  it("falls back to mp4 when nothing matches", () => {
    expect(sourceContainerFromRef({})).toBe("mp4");
    expect(sourceContainerFromRef({ uri: "/no/ext" })).toBe("mp4");
    expect(sourceContainerFromRef(null)).toBe("mp4");
  });
});

// ---------------------------------------------------------------------------
// containerContentType
// ---------------------------------------------------------------------------
describe("containerContentType", () => {
  it("maps known containers to MIME types", () => {
    expect(containerContentType("mp4")).toBe("video/mp4");
    expect(containerContentType("mov")).toBe("video/quicktime");
    expect(containerContentType("mkv")).toBe("video/x-matroska");
    expect(containerContentType("webm")).toBe("video/webm");
  });

  it("returns octet-stream for unknown / missing containers", () => {
    expect(containerContentType("flv")).toBe("application/octet-stream");
    expect(containerContentType(null)).toBe("application/octet-stream");
    expect(containerContentType(undefined)).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// topazExecuteVideoTask
// ---------------------------------------------------------------------------
describe("topazExecuteVideoTask", () => {
  const originalFetch = global.fetch;
  const spec: TopazVideoSpec = {
    submitEndpoint: "https://api.topazlabs.com/video/",
    acceptEndpoint: "https://api.topazlabs.com/video/{request_id}/accept",
    completeEndpoint:
      "https://api.topazlabs.com/video/{request_id}/complete-upload",
    statusEndpoint: "https://api.topazlabs.com/video/{request_id}/status",
    pollInterval: 0,
    maxAttempts: 5
  };

  const sourceMeta: TopazVideoMetadata = {
    resolution: { width: 1920, height: 1080 },
    container: "mov",
    size: 1024,
    duration: 1,
    frameRate: 30,
    frameCount: 30
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("runs create → accept → multipart upload → complete → poll → download", async () => {
    const requests: Array<{ url: string; method: string; headers?: HeadersInit }> = [];
    const uploadCalls: Array<{ url: string; contentType: string | undefined }> = [];

    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      requests.push({ url: u, method, headers: init?.headers });

      if (u === spec.submitEndpoint && method === "POST") {
        return { ok: true, json: async () => ({ id: "req-1" }) } as Response;
      }
      if (u.endsWith("/accept")) {
        return {
          ok: true,
          json: async () => ({
            uploadUrls: [
              "https://upload.topaz/part1",
              "https://upload.topaz/part2"
            ]
          })
        } as Response;
      }
      if (u.startsWith("https://upload.topaz/")) {
        const ct = (init?.headers as Record<string, string>)?.["Content-Type"];
        uploadCalls.push({ url: u, contentType: ct });
        const headers = new Headers({ ETag: '"etag-' + u.slice(-5) + '"' });
        return { ok: true, headers } as unknown as Response;
      }
      if (u.endsWith("/complete-upload")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (u.endsWith("/status")) {
        return {
          ok: true,
          json: async () => ({
            status: "Completed",
            downloadUrl: "https://cdn.topaz/result.mov"
          })
        } as Response;
      }
      if (u === "https://cdn.topaz/result.mov") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([7, 7, 7]).buffer
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const out = await topazExecuteVideoTask(
      "key",
      spec,
      {
        model: "prob-4",
        output_container: "mp4",
        audio_codec: "copy",
        slowmo: 1
      },
      Uint8Array.from(new Array(1024).fill(1)),
      sourceMeta
    );

    expect([...out]).toEqual([7, 7, 7]);
    // Two upload PUTs, each with Content-Type derived from sourceMeta.container.
    expect(uploadCalls.length).toBe(2);
    for (const c of uploadCalls) {
      expect(c.contentType).toBe("video/quicktime");
    }
    // complete-upload body should reference the parts' ETags.
    const completeReq = requests.find((r) => r.url.endsWith("/complete-upload"));
    expect(completeReq?.method).toBe("PATCH");

    // Create body should send the *source* container, not the output container.
    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]) === spec.submitEndpoint
    );
    const createBody = JSON.parse(
      (createCall?.[1] as RequestInit).body as string
    );
    expect(createBody.source.container).toBe("mov");
    expect(createBody.output.container).toBe("mp4");
  });

  it("throws when accept returns no upload URLs", async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === spec.submitEndpoint) {
        return { ok: true, json: async () => ({ id: "r" }) } as Response;
      }
      if (u.endsWith("/accept")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    await expect(
      topazExecuteVideoTask(
        "key",
        spec,
        { model: "prob-4" },
        Uint8Array.from([1, 2]),
        sourceMeta
      )
    ).rejects.toThrow("No upload URL");
  });

  it("uses octet-stream Content-Type for unknown source containers", async () => {
    const captured: Array<string | undefined> = [];
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === spec.submitEndpoint) {
        return { ok: true, json: async () => ({ id: "r2" }) } as Response;
      }
      if (u.endsWith("/accept")) {
        return {
          ok: true,
          json: async () => ({ uploadUrls: ["https://upload.topaz/only"] })
        } as Response;
      }
      if (u === "https://upload.topaz/only") {
        captured.push(
          (init?.headers as Record<string, string>)?.["Content-Type"]
        );
        return { ok: true, headers: new Headers() } as unknown as Response;
      }
      if (u.endsWith("/complete-upload")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (u.endsWith("/status")) {
        return {
          ok: true,
          json: async () => ({ status: "Completed", url: "https://cdn/x" })
        } as Response;
      }
      if (u === "https://cdn/x") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([0]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    await topazExecuteVideoTask(
      "key",
      spec,
      { model: "prob-4" },
      Uint8Array.from([1]),
      { ...sourceMeta, container: "weirdformat" }
    );
    expect(captured[0]).toBe("application/octet-stream");
  });
});

