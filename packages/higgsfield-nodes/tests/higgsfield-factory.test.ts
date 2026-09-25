import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../src/higgsfield-manifest.json";
import { createHiggsfieldNodeClass, type HiggsfieldManifestEntry } from "../src/higgsfield-factory.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("Higgsfield node factory", () => {
  it("omits unset optional presets from the submitted payload", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "secret");
    const fetchMock = vi.fn(async () => new Response("stop after submit", { status: 503 }));
    globalThis.fetch = fetchMock;
    const spec = (manifest as HiggsfieldManifestEntry[]).find((entry) => entry.modelId === "higgsfield/cinema-studio/4.0");
    if (!spec) throw new Error("Cinema Studio 4.0 is missing from the manifest");
    const Node = createHiggsfieldNodeClass(spec);
    const node = new Node({ prompt: "A detective walks through rain", genre: "noir" });

    await expect(node.process()).rejects.toThrow("HTTP 503");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      prompt: "A detective walks through rain",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      genre: "noir"
    });
  });
});
