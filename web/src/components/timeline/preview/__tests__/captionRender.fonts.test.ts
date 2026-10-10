/**
 * Captions wait on their face the way text clips do: the load is started on
 * the first raster, at the weight a caption is drawn with, and nothing drawn
 * in the fallback face is cached.
 */
const mockFonts = {
  bundledReady: true,
  familyReady: true
};
const mockEnsureBundled = jest.fn(async () => undefined);
const mockEnsureGoogle = jest.fn();

jest.mock("../fontLoading", () => ({
  bundledFontsReady: () => mockFonts.bundledReady,
  ensureBundledFontsLoaded: () => mockEnsureBundled(),
  googleFontFamilyReady: () => mockFonts.familyReady,
  ensureGoogleFontLoaded: (...args: unknown[]) => mockEnsureGoogle(...args)
}));

import type { ResolvedCaption } from "@nodetool-ai/timeline/render";

import { CaptionRasterizer } from "../captionRender";
import { BitmapFrameScope } from "../BitmapFrameScope";
import { installGlobal, stub } from "../../../../test-utils/doubles";

const bitmaps: ImageBitmap[] = [];

class FakeOffscreenCanvas {
  constructor(
    private readonly w: number,
    private readonly h: number
  ) {}
  getContext() {
    return {
      measureText: (text: string) => ({ width: text.length * 8 }),
      strokeText: () => undefined,
      fillText: () => undefined
    };
  }
  transferToImageBitmap() {
    const bitmap = stub<ImageBitmap>({ width: this.w, height: this.h, close: jest.fn() });
    bitmaps.push(bitmap);
    return bitmap;
  }
}

const caption: ResolvedCaption = {
  words: [{ text: "Hello", active: true }],
  style: { fontFamily: "Poppins" }
};

describe("CaptionRasterizer font loading", () => {
  const original = globalThis.OffscreenCanvas;

  beforeEach(() => {
    bitmaps.length = 0;
    mockEnsureBundled.mockClear();
    mockEnsureGoogle.mockClear();
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  afterEach(() => {
    globalThis.OffscreenCanvas = original;
  });

  it("starts the loads and does not cache a fallback raster", () => {
    mockFonts.bundledReady = false;
    mockFonts.familyReady = false;
    const rasterizer = new CaptionRasterizer();
    const frame = new BitmapFrameScope();
    const first = rasterizer.rasterize(caption, 640, 360, frame);
    const second = rasterizer.rasterize(caption, 640, 360, frame);
    expect(mockEnsureBundled).toHaveBeenCalled();
    expect(mockEnsureGoogle).toHaveBeenCalledWith("Poppins", 700);
    expect(second).not.toBe(first);
    frame.release();
    // The superseded fallback raster is released, not held.
    expect(first!.close).toHaveBeenCalledTimes(1);

    mockFonts.bundledReady = true;
    mockFonts.familyReady = true;
    const ready = new BitmapFrameScope();
    const third = rasterizer.rasterize(caption, 640, 360, ready);
    const fourth = rasterizer.rasterize(caption, 640, 360, ready);
    expect(fourth).toBe(third);
    ready.release();
    expect(second!.close).toHaveBeenCalledTimes(1);
    rasterizer.dispose();
    expect(third!.close).toHaveBeenCalledTimes(1);
  });
});
