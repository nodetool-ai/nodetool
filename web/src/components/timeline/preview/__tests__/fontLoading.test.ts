/**
 * `ensureBundledFontsLoaded` (T17).
 *
 * `@font-face` is lazy, and a canvas never waits: `fillText` with an unloaded
 * family draws the fallback right away. `TextRasterizer` caches by style, not
 * by face, so a bitmap drawn in that window keeps the wrong glyphs for as long
 * as the entry lives — which for a held title is the session. These pin the
 * three things that stop it: one load per document, a request per catalog
 * face, and a runtime with no font API resolving instead of hanging.
 */

import { BUNDLED_FONTS } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  bundledFontsReady,
  ensureBundledFontsLoaded,
  ensureGoogleFontLoaded,
  ensureGoogleFontsLoaded,
  googleFontFamilyReady,
  resetBundledFontsForTest,
  resetGoogleFontsForTest
} from "../fontLoading";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

function installFontFaceSet(load: jest.Mock): void {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load }
  });
}

describe("ensureBundledFontsLoaded", () => {
  afterEach(() => {
    resetBundledFontsForTest();
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  // The gate exists to stop a bitmap drawn mid-fetch from being cached. With
  // a font set present nothing is drawable until the fetch resolves; with none
  // there is no fetch, so refusing to cache would cost every non-browser host
  // for nothing.
  it("is not ready before anything asks, when faces can load", () => {
    installFontFaceSet(jest.fn().mockResolvedValue([]));
    expect(bundledFontsReady()).toBe(false);
  });

  it("is ready straight away where no face can ever load", () => {
    Reflect.deleteProperty(document, "fonts");
    expect(bundledFontsReady()).toBe(true);
  });

  it("requests one load per catalog face and then reports ready", async () => {
    const load = jest.fn().mockResolvedValue([]);
    installFontFaceSet(load);

    await ensureBundledFontsLoaded();

    expect(load).toHaveBeenCalledTimes(BUNDLED_FONTS.length);
    expect(bundledFontsReady()).toBe(true);
    // The shorthand carries the slant, since a family's slants are separate
    // files and loading one says nothing about the other.
    const specs = load.mock.calls.map((call) => String(call[0]));
    expect(specs).toContain('normal 400 16px "Bebas Neue"');
    expect(specs.some((spec) => spec.startsWith("italic "))).toBe(true);
  });

  it("loads once per document however many callers ask", async () => {
    const load = jest.fn().mockResolvedValue([]);
    installFontFaceSet(load);

    await Promise.all([
      ensureBundledFontsLoaded(),
      ensureBundledFontsLoaded(),
      ensureBundledFontsLoaded()
    ]);

    expect(load).toHaveBeenCalledTimes(BUNDLED_FONTS.length);
  });

  // One missing file must not hold back the other nine, and the picture it
  // would have produced is the fallback either way.
  it("reports ready even when a face fails to load", async () => {
    const load = jest.fn().mockRejectedValue(new Error("404"));
    installFontFaceSet(load);

    await expect(ensureBundledFontsLoaded()).resolves.toBeUndefined();
    expect(bundledFontsReady()).toBe(true);
  });

  it("resolves immediately where there is no font-loading API", async () => {
    Reflect.deleteProperty(document, "fonts");

    await ensureBundledFontsLoaded();

    expect(bundledFontsReady()).toBe(true);
  });
});

function textClip(
  fontFamily: string | undefined,
  fontWeight?: number,
  fontStyle?: string
): TimelineClip {
  return {
    id: "c",
    trackId: "t",
    name: "C",
    mediaType: "text",
    startMs: 0,
    durationMs: 1000,
    textStyle: { text: "hi", fontFamily, fontWeight, fontStyle, fontSizePx: 24, color: "#fff" }
  } as unknown as TimelineClip;
}

describe("ensureGoogleFontsLoaded / googleFontFamilyReady", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    resetGoogleFontsForTest();
    globalThis.fetch = originalFetch;
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("is ready for a bundled family with no network call", async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(googleFontFamilyReady("Inter")).toBe(true);
    await ensureGoogleFontsLoaded([textClip("Inter")]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the resolve endpoint once per family, at the document's exact weights, injects the CSS and loads it", async () => {
    const load = jest.fn().mockResolvedValue([]);
    installFontFaceSet(load);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '@font-face { font-family: "Poppins"; }'
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(googleFontFamilyReady("Poppins")).toBe(false);
    // Two clips, same family, one weight each — the request names both, once,
    // rather than a fixed guess that could miss the display weight.
    await ensureGoogleFontsLoaded([
      textClip("Poppins", 400),
      textClip("Poppins", 800)
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(
      String(fetchMock.mock.calls[0]?.[0]),
      "http://localhost"
    );
    expect(url.pathname).toBe("/api/assets/packages/timeline/fonts/google/Poppins/css");
    expect(url.searchParams.get("weights")).toBe("400,800");
    expect(googleFontFamilyReady("Poppins")).toBe(true);
    expect(
      document.head.querySelector('style[data-google-font="Poppins"]')?.textContent
    ).toContain("Poppins");
  });

  it("tops up an already-loaded family with a weight nothing has fetched yet", async () => {
    installFontFaceSet(jest.fn().mockResolvedValue([]));
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '@font-face { font-family: "Poppins"; }'
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // First clip settles at 400 before the second, at 800, is even seen —
    // the Halo-wordmark shape: body text loads first, a display title's
    // weight must not be dropped just because the family "is ready" already.
    await ensureGoogleFontsLoaded([textClip("Poppins", 400)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await ensureGoogleFontsLoaded([textClip("Poppins", 800)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(
      String(fetchMock.mock.calls[1]?.[0]),
      "http://localhost"
    );
    expect(secondUrl.searchParams.get("weights")).toBe("800");

    // Asking for 400 again fetches nothing more.
    await ensureGoogleFontsLoaded([textClip("Poppins", 400)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks a family unavailable rather than throwing, and stops retrying it", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await ensureGoogleFontsLoaded([textClip("Not A Real Family")]);
    expect(googleFontFamilyReady("Not A Real Family")).toBe(true);

    ensureGoogleFontLoaded("Not A Real Family");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an undefined or empty family", async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(googleFontFamilyReady(undefined)).toBe(true);
    ensureGoogleFontLoaded(undefined);
    await ensureGoogleFontsLoaded([textClip(undefined)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
