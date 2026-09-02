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
import {
  bundledFontsReady,
  ensureBundledFontsLoaded,
  resetBundledFontsForTest
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
