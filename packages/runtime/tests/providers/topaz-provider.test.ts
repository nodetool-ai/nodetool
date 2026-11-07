import { describe, it, expect, vi, afterEach } from "vitest";
import {
  TopazProvider,
  topazContainerContentType
} from "../../src/providers/topaz-provider.js";
import { runWithGenerationReceipt } from "../../src/generation-receipt.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("TopazProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    expect(p.provider).toBe("topaz");
    expect(TopazProvider.requiredSecrets()).toEqual(["TOPAZ_API_KEY"]);
  });

  it("getContainerEnv exposes the API key", () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    expect(p.getContainerEnv()).toEqual({ TOPAZ_API_KEY: "k" });
  });

  it("chat generation throws (not supported)", async () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow("does not support chat generation");
    await expect(
      p.generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat generation");
  });
});

describe("TopazProvider — getAvailableImageModels", () => {
  it("returns an empty list when no API key is set", async () => {
    const p = new TopazProvider({});
    expect(await p.getAvailableImageModels()).toEqual([]);
  });

  it("expands each manifest entry into one model per variant", async () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    const models = await p.getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe("topaz");
      expect(m.supportedTasks).toEqual(["upscale"]);
    }
    // Precision and generative variants are both present and distinct.
    const ids = models.map((m) => m.id);
    expect(ids).toContain("topaz/image/enhance/Standard V2");
    expect(ids).toContain("topaz/image/enhance/High Fidelity V2");
    expect(ids).toContain("topaz/image/enhance-gen/Redefine");
  });
});

describe("TopazProvider — upscaleImage", () => {
  function imageBytes(): Uint8Array {
    return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  }

  it("requires a non-empty image", async () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await expect(
      p.upscaleImage(new Uint8Array(), {
        model: { id: "topaz/image/enhance/Standard V2", name: "x", provider: "topaz" }
      })
    ).rejects.toThrow("image must not be empty");
  });

  it("requires a configured API key", async () => {
    const p = new TopazProvider({});
    await expect(
      p.upscaleImage(imageBytes(), {
        model: { id: "topaz/image/enhance/Standard V2", name: "x", provider: "topaz" }
      })
    ).rejects.toThrow("TOPAZ_API_KEY is not configured");
  });

  it("submit → poll → download pipeline (precision)", async () => {
    const captured: Array<{ url: string; body?: FormData | string }> = [];
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body;
      captured.push({ url: u, body: body as FormData | string | undefined });
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        return { ok: true, json: async () => ({ process_id: "pid-1" }) } as Response;
      }
      if (u.includes("/status/pid-1")) {
        return {
          ok: true,
          json: async () => ({ status: "Completed" })
        } as Response;
      }
      if (u.includes("/download/pid-1")) {
        return {
          ok: true,
          json: async () => ({ url: "https://cdn.topaz/out.png" })
        } as Response;
      }
      if (u === "https://cdn.topaz/out.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([9, 9]).buffer
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    const out = await p.upscaleImage(imageBytes(), {
      model: {
        id: "topaz/image/enhance/High Fidelity V2",
        name: "x",
        provider: "topaz"
      },
      scale: 2
    });
    expect([...out]).toEqual([9, 9]);

    const submitCall = captured.find(
      (c) => c.url === "https://api.topazlabs.com/image/v1/enhance/async"
    );
    expect(submitCall).toBeDefined();
    const form = submitCall!.body as FormData;
    expect(form.get("model")).toBe("High Fidelity V2");
    expect(form.get("scale")).toBe("2");
  });

  it("routes generative model ids to the enhance-gen endpoint", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u === "https://api.topazlabs.com/image/v1/enhance-gen/async") {
        return { ok: true, json: async () => ({ id: "pid-2" }) } as Response;
      }
      if (u.includes("/status/pid-2")) {
        return {
          ok: true,
          json: async () => ({ status: "Success" })
        } as Response;
      }
      if (u.includes("/download/pid-2")) {
        return {
          ok: true,
          json: async () => ({ download_url: "https://cdn.topaz/g.png" })
        } as Response;
      }
      if (u === "https://cdn.topaz/g.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([1]).buffer
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await p.upscaleImage(imageBytes(), {
      model: {
        id: "topaz/image/enhance-gen/Redefine",
        name: "g",
        provider: "topaz"
      },
      prompt: "more detail",
      creativity: 0.5
    });

    expect(calls[0]).toBe(
      "https://api.topazlabs.com/image/v1/enhance-gen/async"
    );
  });

  it("attempts the job-creating POST exactly once on 503 (no double billing)", async () => {
    let submitAttempts = 0;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        submitAttempts++;
        return {
          ok: false,
          status: 503,
          headers: new Headers({ "Retry-After": "0" }),
          text: async () => "transient",
          arrayBuffer: async () => new ArrayBuffer(0)
        } as unknown as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await expect(
      p.upscaleImage(imageBytes(), {
        model: {
          id: "topaz/image/enhance/Standard V2",
          name: "x",
          provider: "topaz"
        }
      })
    ).rejects.toThrow("Topaz submit failed: 503");
    // A 503 may mean the job was created and billed before the error. Retrying
    // submits a second billable job.
    expect(submitAttempts).toBe(1);
  });

  it("retries the idempotent status poll on a retryable status", async () => {
    let statusAttempts = 0;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        return {
          ok: true,
          json: async () => ({ process_id: "pid-r" })
        } as Response;
      }
      if (u.includes("/status/pid-r")) {
        statusAttempts++;
        if (statusAttempts < 2) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ "Retry-After": "0" }),
            text: async () => "transient",
            arrayBuffer: async () => new ArrayBuffer(0)
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({ status: "Completed" })
        } as Response;
      }
      if (u.includes("/download/pid-r")) {
        return {
          ok: true,
          json: async () => ({ url: "https://cdn.topaz/r.png" })
        } as Response;
      }
      if (u === "https://cdn.topaz/r.png") {
        return {
          ok: true,
          arrayBuffer: async () => Uint8Array.from([5]).buffer
        } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    const out = await p.upscaleImage(imageBytes(), {
      model: {
        id: "topaz/image/enhance/Standard V2",
        name: "x",
        provider: "topaz"
      }
    });
    expect([...out]).toEqual([5]);
    expect(statusAttempts).toBe(2);
  });

  it("treats \"complete\" and \"canceled\" as terminal states", async () => {
    let statusCalls = 0;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        return { ok: true, json: async () => ({ process_id: "pid-c" }) } as Response;
      }
      if (u.includes("/status/pid-c")) {
        statusCalls++;
        return { ok: true, json: async () => ({ status: "Canceled" }) } as Response;
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await expect(
      p.upscaleImage(imageBytes(), {
        model: {
          id: "topaz/image/enhance/Standard V2",
          name: "x",
          provider: "topaz"
        }
      })
    ).rejects.toThrow("Topaz job failed");
    expect(statusCalls).toBe(1);
  });

  it("refuses a provider-supplied download URL pointing at an internal host (#18)", async () => {
    let downloadFetched = false;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        return { ok: true, json: async () => ({ process_id: "pid-s" }) } as Response;
      }
      if (u.includes("/status/pid-s")) {
        return { ok: true, json: async () => ({ status: "Completed" }) } as Response;
      }
      if (u.includes("/download/pid-s")) {
        // Malicious/compromised result URL pointing at cloud metadata.
        return {
          ok: true,
          json: async () => ({
            url: "http://169.254.169.254/latest/meta-data/"
          })
        } as Response;
      }
      downloadFetched = true;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }) as unknown as typeof fetch;

    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    await expect(
      p.upscaleImage(imageBytes(), {
        model: {
          id: "topaz/image/enhance/Standard V2",
          name: "x",
          provider: "topaz"
        }
      })
    ).rejects.toThrow();
    // safeFetch must reject before the internal URL is ever fetched.
    expect(downloadFetched).toBe(false);
  });
});

describe("TopazProvider — endpoint calls", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const SOURCE = {
    resolution: { width: 160, height: 90 },
    container: "mov",
    size: 3,
    duration: 1,
    frameRate: 24,
    frameCount: 24
  };

  type Route = (init: RequestInit | undefined) => Response;

  /** Answer by `METHOD url`, record each request, and fail on anything else. */
  function mockRoutes(routes: Record<string, Route>) {
    const calls: Array<{ key: string; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(url)}`;
      calls.push({ key, init });
      const route = routes[key];
      if (!route) throw new Error(`unexpected fetch: ${key}`);
      return route(init);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return calls;
  }

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });

  function videoRoutes(urls: string[], extra: Record<string, Route> = {}) {
    const routes: Record<string, Route> = {
      "POST https://api.topazlabs.com/video/": () => json({ requestId: "req-1" }),
      "PATCH https://api.topazlabs.com/video/req-1/accept": () =>
        json({ uploadId: "up-1", urls }),
      "PATCH https://api.topazlabs.com/video/req-1/complete-upload/": () => json({}),
      "GET https://api.topazlabs.com/video/req-1/status": () =>
        json({ status: "complete", download: { url: "https://cdn.topaz/out.mp4" } }),
      ...extra
    };
    for (const url of urls) {
      routes[`PUT ${url}`] ??= () =>
        new Response(null, { status: 200, headers: { ETag: `"${url.slice(-2)}"` } });
    }
    return routes;
  }

  it("claims endpoint support and refuses standalone uploads", async () => {
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });
    expect(p.supportsEndpointCalls()).toBe(true);
    await expect(
      p.uploadMedia({ bytes: PNG, mimeType: "image/png" })
    ).rejects.toThrow("pass the bytes in the callEndpoint input");
  });

  it("runs an image endpoint: multipart submit, poll, download lookup", async () => {
    const calls = mockRoutes({
      "POST https://api.topazlabs.com/image/v1/sharpen/async": () =>
        new Response(JSON.stringify({ eta: 1 }), {
          status: 200,
          headers: { "X-Process-ID": "pid-h" }
        }),
      "GET https://api.topazlabs.com/image/v1/status/pid-h": () =>
        json({ status: "Completed" }),
      "GET https://api.topazlabs.com/image/v1/download/pid-h": () =>
        json({ download_url: "https://cdn.topaz/s.png", expiry: 1 })
    });
    const progress: unknown[] = [];

    const { value: result, receipt } = await runWithGenerationReceipt(() =>
      new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
        model: "topaz/image/sharpen",
        input: { image: PNG, model: "Standard", strength: 0.5, output_format: null },
        onProgress: (event) => progress.push(event)
      })
    );

    expect(result).toEqual({
      output: { download_url: "https://cdn.topaz/s.png", expiry: 1 },
      requestId: "pid-h"
    });
    expect(receipt?.provider_request_id).toBe("pid-h");
    expect(progress).toEqual([{ message: "Completed" }]);
    const form = calls[0]?.init?.body as FormData;
    expect([...form.keys()]).toEqual(["image", "model", "strength"]);
    expect(form.get("strength")).toBe("0.5");
    expect((form.get("image") as File).type).toBe("image/png");
    expect(new Headers(calls[0]?.init?.headers).get("X-API-Key")).toBe("k");
  });

  it("rejects an unknown model, an unknown route and a route of the other family", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });

    await expect(p.callEndpoint({ model: "topaz/x", input: {} })).rejects.toThrow(
      "Unknown Topaz model: topaz/x"
    );
    await expect(
      p.callEndpoint({ model: "topaz/image/enhance", input: { image: PNG }, route: "audio" })
    ).rejects.toThrow('must be "image" or "video"');
    await expect(
      p.callEndpoint({ model: "topaz/image/enhance", input: { image: PNG }, route: "video" })
    ).rejects.toThrow("on the image route, not video");
    await expect(
      p.callEndpoint({ model: "topaz/image/enhance", input: {} })
    ).rejects.toThrow("input.image");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs a video endpoint: create, accept, multipart upload, complete, poll", async () => {
    const urls = ["https://upload.topaz/p1", "https://upload.topaz/p2"];
    const calls = mockRoutes(videoRoutes(urls));
    const video = Uint8Array.from([1, 2, 3]);
    const createBody = { source: SOURCE, output: { container: "mp4" }, filters: [{ model: "prob-4" }] };

    const result = await new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
      model: "topaz/video/enhance",
      route: "video",
      input: { ...createBody, video }
    });

    expect(result).toEqual({
      output: { status: "complete", download: { url: "https://cdn.topaz/out.mp4" } },
      requestId: "req-1"
    });
    expect(calls.map((c) => c.key)).toEqual([
      "POST https://api.topazlabs.com/video/",
      "PATCH https://api.topazlabs.com/video/req-1/accept",
      "PUT https://upload.topaz/p1",
      "PUT https://upload.topaz/p2",
      "PATCH https://api.topazlabs.com/video/req-1/complete-upload/",
      "GET https://api.topazlabs.com/video/req-1/status"
    ]);
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(createBody);
    expect(calls[2]?.init?.body).toEqual(Uint8Array.from([1, 2]));
    expect(calls[3]?.init?.body).toEqual(Uint8Array.from([3]));
    expect(new Headers(calls[2]?.init?.headers).get("Content-Type")).toBe("video/quicktime");
    expect(new Headers(calls[2]?.init?.headers).get("X-API-Key")).toBeNull();
    expect(JSON.parse(calls[4]?.init?.body as string)).toEqual({
      uploadId: "up-1",
      uploadResults: [
        { partNum: 1, eTag: "p1" },
        { partNum: 2, eTag: "p2" }
      ]
    });
  });

  it("skips empty trailing parts when accept returns more URLs than bytes", async () => {
    const urls = ["https://upload.topaz/p1", "https://upload.topaz/p2", "https://upload.topaz/p3", "https://upload.topaz/p4"];
    const calls = mockRoutes(videoRoutes(urls));

    await new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
      model: "topaz/video/enhance",
      input: { source: SOURCE, video: Uint8Array.from([1, 2, 3]) }
    });

    const puts = calls.filter((c) => c.key.startsWith("PUT "));
    expect(puts.map((c) => c.key)).toEqual(urls.slice(0, 3).map((u) => `PUT ${u}`));
    const complete = calls.find((c) => c.key.includes("complete-upload"));
    expect(JSON.parse(complete?.init?.body as string).uploadResults.map((r: { partNum: number }) => r.partNum)).toEqual([1, 2, 3]);
  });

  it("types parts of an unknown source container as octet-stream", async () => {
    const calls = mockRoutes(videoRoutes(["https://upload.topaz/only"]));

    await new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
      model: "topaz/video/interpolate",
      input: { source: { ...SOURCE, container: "weirdformat" }, video: Uint8Array.from([1]) }
    });

    const put = calls.find((c) => c.key.startsWith("PUT "));
    expect(new Headers(put?.init?.headers).get("Content-Type")).toBe("application/octet-stream");
  });

  it("throws when accept returns no upload URLs", async () => {
    mockRoutes(videoRoutes([]));

    await expect(
      new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
        model: "topaz/video/enhance",
        input: { source: SOURCE, video: Uint8Array.from([1]) }
      })
    ).rejects.toThrow("No upload URL");
  });

  it("does not retry the job-creating POST on a 5xx", async () => {
    const calls = mockRoutes({
      "POST https://api.topazlabs.com/video/": () => new Response("overloaded", { status: 503 })
    });

    await expect(
      new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
        model: "topaz/video/enhance",
        input: { source: SOURCE, video: Uint8Array.from([1]) }
      })
    ).rejects.toThrow("Topaz create failed: 503");
    expect(calls).toHaveLength(1);
  });

  it("refuses a presigned upload URL on an internal host", async () => {
    const calls = mockRoutes(videoRoutes(["https://127.0.0.1/part"]));

    await expect(
      new TopazProvider({ TOPAZ_API_KEY: "k" }).callEndpoint({
        model: "topaz/video/enhance",
        input: { source: SOURCE, video: Uint8Array.from([1]) }
      })
    ).rejects.toThrow();
    expect(calls.some((c) => c.key.startsWith("PUT "))).toBe(false);
  });

  it("downloads a result URL through safeFetch and reports a failed status", async () => {
    mockRoutes({
      "GET https://cdn.topaz/ok.png": () => new Response(Uint8Array.from([4, 2]), { status: 200 }),
      "GET https://cdn.topaz/gone.png": () => new Response("", { status: 404 })
    });
    const p = new TopazProvider({ TOPAZ_API_KEY: "k" });

    await expect(p.downloadMedia("https://cdn.topaz/ok.png")).resolves.toEqual(Uint8Array.from([4, 2]));
    await expect(p.downloadMedia("https://cdn.topaz/gone.png")).rejects.toThrow(
      "Failed to fetch Topaz result: 404"
    );
    await expect(p.downloadMedia("http://169.254.169.254/latest")).rejects.toThrow();
  });

  it("maps source containers to upload content types", () => {
    expect(topazContainerContentType("mp4")).toBe("video/mp4");
    expect(topazContainerContentType(".MOV")).toBe("video/quicktime");
    expect(topazContainerContentType("mkv")).toBe("video/x-matroska");
    expect(topazContainerContentType("webm")).toBe("video/webm");
    expect(topazContainerContentType("flv")).toBe("application/octet-stream");
    expect(topazContainerContentType(null)).toBe("application/octet-stream");
    expect(topazContainerContentType(undefined)).toBe("application/octet-stream");
  });
});
