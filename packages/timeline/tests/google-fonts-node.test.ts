import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerFromPath = vi.fn();
let cacheDir = "";

vi.mock("@napi-rs/canvas", () => ({
  GlobalFonts: { registerFromPath: (...args: unknown[]) => registerFromPath(...args) }
}));

vi.mock("@nodetool-ai/config", () => ({
  getNodetoolCacheDir: () => cacheDir
}));

const safeFetch = vi.fn();
vi.mock("@nodetool-ai/runtime", () => ({
  safeFetch: (...args: [string, RequestInit?]) => safeFetch(...args)
}));

const SPACE_GROTESK_METADATA = `
name: "Space Grotesk"
license: "OFL"
fonts {
  name: "Space Grotesk"
  style: "normal"
  weight: 400
  filename: "SpaceGrotesk[wght].ttf"
}
`;

function textResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

function bytesResponse(status: number, bytes = new Uint8Array([1, 2, 3])): Response {
  return new Response(bytes, { status });
}

describe("resolveGoogleFontFamily / ensureGoogleFonts", () => {
  beforeEach(async () => {
    registerFromPath.mockReset();
    safeFetch.mockReset();
    cacheDir = await mkdtemp(join(tmpdir(), "nodetool-google-fonts-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("resolves from the ofl directory, downloads the face and the licence, and registers it", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/ofl/spacegrotesk/METADATA.pb")) {
        return textResponse(200, SPACE_GROTESK_METADATA);
      }
      if (url.endsWith("OFL.txt")) return textResponse(200, "OFL license text");
      if (url.endsWith("SpaceGrotesk%5Bwght%5D.ttf")) return bytesResponse(200);
      throw new Error(`unexpected fetch ${url}`);
    });

    const { resolveGoogleFontFamily, registerGoogleFontFaces } = await import(
      "../src/fonts/google-fonts-node.js"
    );
    const resolution = await resolveGoogleFontFamily("Space Grotesk", [
      { weight: 400, style: "normal" }
    ]);

    expect(resolution).not.toBeNull();
    expect(resolution?.license).toBe("OFL-1.1");
    expect(resolution?.faces).toHaveLength(1);

    registerGoogleFontFaces(resolution!);
    expect(registerFromPath).toHaveBeenCalledTimes(1);

    // Every URL fetched went through the one trusted host.
    for (const [url] of safeFetch.mock.calls) {
      expect(new URL(url as string).host).toBe("raw.githubusercontent.com");
    }
  });

  it("falls back to apache when the family is not under ofl", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/ofl/roboto/")) return textResponse(404);
      if (url.endsWith("/apache/roboto/METADATA.pb")) {
        return textResponse(
          200,
          'name: "Roboto"\nfonts { name: "Roboto" style: "normal" weight: 400 filename: "Roboto-Regular.ttf" }'
        );
      }
      if (url.endsWith("LICENSE.txt")) return textResponse(200, "Apache license text");
      if (url.endsWith("Roboto-Regular.ttf")) return bytesResponse(200);
      throw new Error(`unexpected fetch ${url}`);
    });

    const { resolveGoogleFontFamily } = await import("../src/fonts/google-fonts-node.js");
    const resolution = await resolveGoogleFontFamily("Roboto", [
      { weight: 400, style: "normal" }
    ]);
    expect(resolution?.license).toBe("Apache-2.0");
  });

  it("returns null, never throwing, for a family on neither ofl nor apache", async () => {
    safeFetch.mockImplementation(async () => textResponse(404));
    const { resolveGoogleFontFamily } = await import("../src/fonts/google-fonts-node.js");
    const resolution = await resolveGoogleFontFamily("Not A Real Family", [
      { weight: 400, style: "normal" }
    ]);
    expect(resolution).toBeNull();
    // Two hosts checked, no more.
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it("reads a cached family from disk with no network call", async () => {
    safeFetch.mockImplementationOnce(async (url: string) => {
      expect(url).toContain("/ofl/spacegrotesk/METADATA.pb");
      return textResponse(200, SPACE_GROTESK_METADATA);
    });
    safeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("OFL.txt")) return textResponse(200, "OFL license text");
      return bytesResponse(200);
    });

    const { resolveGoogleFontFamily } = await import("../src/fonts/google-fonts-node.js");
    const first = await resolveGoogleFontFamily("Space Grotesk", [
      { weight: 400, style: "normal" }
    ]);
    expect(first).not.toBeNull();

    safeFetch.mockClear();
    const second = await resolveGoogleFontFamily("Space Grotesk", [
      { weight: 400, style: "normal" }
    ]);
    expect(second).toEqual(first);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("downloads a face a later request needs, and fetches nothing once it is cached", async () => {
    const staticMetadata = `
name: "Lora"
fonts { name: "Lora" style: "normal" weight: 400 filename: "Lora-Regular.ttf" }
fonts { name: "Lora" style: "normal" weight: 700 filename: "Lora-Bold.ttf" }
fonts { name: "Lora" style: "italic" weight: 400 filename: "Lora-Italic.ttf" }
`;
    safeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/ofl/lora/METADATA.pb")) return textResponse(200, staticMetadata);
      if (url.endsWith("OFL.txt")) return textResponse(200, "OFL license text");
      if (url.endsWith(".ttf")) return bytesResponse(200);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { resolveGoogleFontFamily } = await import("../src/fonts/google-fonts-node.js");
    const faceNames = (resolution: Awaited<ReturnType<typeof resolveGoogleFontFamily>>) =>
      (resolution?.faces ?? []).map((face) => face.file.split(/[\\/]/).pop()).sort();

    await resolveGoogleFontFamily("Lora", [{ weight: 400, style: "normal" }]);
    const bold = await resolveGoogleFontFamily("Lora", [{ weight: 800, style: "normal" }]);
    expect(faceNames(bold)).toEqual(["Lora-Bold.ttf", "Lora-Regular.ttf"]);
    const italic = await resolveGoogleFontFamily("Lora", [{ weight: 400, style: "italic" }]);
    expect(faceNames(italic)).toEqual(["Lora-Bold.ttf", "Lora-Italic.ttf", "Lora-Regular.ttf"]);

    safeFetch.mockClear();
    await resolveGoogleFontFamily("Lora", [
      { weight: 800, style: "normal" },
      { weight: 400, style: "italic" }
    ]);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("refuses a face file name that leaves the cache directory", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/ofl/evil/METADATA.pb")) {
        return textResponse(
          200,
          'name: "Evil"\nfonts { style: "normal" weight: 400 filename: "../../escape.ttf" }'
        );
      }
      if (url.endsWith("OFL.txt")) return textResponse(200, "OFL license text");
      return bytesResponse(200);
    });
    const { resolveGoogleFontFamily } = await import("../src/fonts/google-fonts-node.js");
    await expect(
      resolveGoogleFontFamily("Evil", [{ weight: 400, style: "normal" }])
    ).rejects.toThrow(/outside/);
  });

  it("ensureGoogleFonts reports an offline/failed family as unavailable, never throwing", async () => {
    safeFetch.mockImplementation(async () => {
      throw new Error("network down");
    });
    const { ensureGoogleFonts } = await import("../src/fonts/google-fonts-node.js");
    const report = await ensureGoogleFonts({
      clips: [
        {
          id: "a",
          trackId: "t",
          name: "A",
          mediaType: "text",
          startMs: 0,
          durationMs: 1000,
          textStyle: { text: "Hi", fontFamily: "Poppins", fontSizePx: 24, color: "#fff" }
        }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(report.resolved).toEqual([]);
    expect(report.unavailable).toEqual(["Poppins"]);
  });

  it("ensureGoogleFonts does nothing, and fetches nothing, for a bundled-only sequence", async () => {
    const { ensureGoogleFonts } = await import("../src/fonts/google-fonts-node.js");
    const report = await ensureGoogleFonts({
      clips: [
        {
          id: "a",
          trackId: "t",
          name: "A",
          mediaType: "text",
          startMs: 0,
          durationMs: 1000,
          textStyle: { text: "Hi", fontFamily: "Inter", fontSizePx: 24, color: "#fff" }
        }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(report).toEqual({ resolved: [], unavailable: [] });
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
