import { afterEach, describe, expect, it, vi } from "vitest";
import { comfyCloudFetch } from "../../src/providers/comfy-fetch.js";

describe("comfyCloudFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("upgrades http Comfy Cloud job links to https and attaches the key the SDK left off", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
      const r = req instanceof Request ? req : new Request(String(req), init);
      seen.push({ url: r.url, auth: r.headers.get("authorization") });
      return new Response("{}", { status: 200 });
    }));
    const doFetch = comfyCloudFetch("comfyui-k");
    await doFetch("http://cloud.comfy.org/api/v2/jobs/abc", { method: "GET", headers: { "User-Agent": "sdk" } });
    await doFetch(new Request("http://cloud.comfy.org/api/v2/jobs/abc/events"));
    await doFetch("http://example.com/x");
    expect(seen).toEqual([
      { url: "https://cloud.comfy.org/api/v2/jobs/abc", auth: "Bearer comfyui-k" },
      { url: "https://cloud.comfy.org/api/v2/jobs/abc/events", auth: "Bearer comfyui-k" },
      { url: "http://example.com/x", auth: null },
    ]);
  });
});
