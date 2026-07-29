import { describe, it, expect, vi, afterEach } from "vitest";
import { TopazProvider } from "../../src/providers/topaz-provider.js";

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

  it("retries retryable HTTP statuses", async () => {
    let submitAttempts = 0;
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === "https://api.topazlabs.com/image/v1/enhance/async") {
        submitAttempts++;
        if (submitAttempts < 2) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ "Retry-After": "0" }),
            text: async () => "transient"
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({ process_id: "pid-r" })
        } as Response;
      }
      if (u.includes("/status/pid-r")) {
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
    expect(submitAttempts).toBe(2);
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
