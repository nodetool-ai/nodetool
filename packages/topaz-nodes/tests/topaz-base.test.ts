import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getApiKey,
  refToBytes,
  topazExecuteImageTask,
  type TopazImageSpec
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
