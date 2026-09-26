import type { ClipTextStyle } from "@nodetool-ai/timeline";
import { stub } from "../../../../test-utils/doubles";

import {
  TextRasterizer,
  TEXT_BITMAP_CACHE_BUDGET_BYTES
} from "../textRender";
import { BitmapFrameScope } from "../BitmapFrameScope";
import { installGlobal } from "../../../../test-utils/doubles";

describe("TextRasterizer", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const close = jest.fn();
  const bitmap = stub<ImageBitmap>({ close, width: 1920, height: 1080 });
  // The subset of `RasterContext2D` a plain unstyled title touches. It has no
  // `letterSpacing`, which is the hand-placed advance path — with no spacing
  // set, that is still one `fillText` per line.
  const context = {
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: jest.fn(),
    restore: jest.fn(),
    measureText: jest.fn((text: string) => ({ width: text.length * 10 })),
    fillText: jest.fn()
  };
  const transferToImageBitmap = jest.fn(() => bitmap);

  beforeEach(() => {
    close.mockClear();
    context.measureText.mockClear();
    context.fillText.mockClear();
    transferToImageBitmap.mockClear();
    class FakeOffscreenCanvas {
      getContext() {
        return context;
      }

      transferToImageBitmap() {
        return transferToImageBitmap();
      }
    }
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  afterAll(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  it("draws styled text and reuses the cached bitmap", () => {
    const rasterizer = new TextRasterizer();
    const frame = new BitmapFrameScope();
    const style: ClipTextStyle = {
      text: "Motion title",
      fontFamily: "Inter",
      fontSizePx: 72,
      fontWeight: 600,
      color: "#123456",
      align: "right",
      maxWidthFrac: 0.75
    };

    const first = rasterizer.rasterize(style, 1920, 1080, undefined, frame);
    const second = rasterizer.rasterize(style, 1920, 1080, undefined, frame);

    expect(second).toBe(first);
    expect(transferToImageBitmap).toHaveBeenCalledTimes(1);
    // The family list comes from `resolveFontFamily` (T17), so a bundled name
    // resolves to the shipped face with a generic behind it.
    expect(context.font).toBe("600 72px Inter, sans-serif");
    expect(context.fillStyle).toBe("#123456");
    // Every glyph is placed from its own left edge, so alignment is arithmetic
    // on the line's measured width rather than a context mode: the right edge
    // of a 120px line sits on the right edge of the 1440px wrap column.
    expect(context.textAlign).toBe("left");
    expect(context.fillText).toHaveBeenCalledWith("Motion title", 1560, 540);

    rasterizer.dispose();
    frame.release();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves authored line breaks", () => {
    const rasterizer = new TextRasterizer();
    const frame = new BitmapFrameScope();

    rasterizer.rasterize(
      {
        text: "First line\nSecond line",
        fontSizePx: 72,
        color: "#ffffff"
      },
      1920,
      1080,
      undefined,
      frame
    );

    expect(context.fillText).toHaveBeenNthCalledWith(
      1,
      "First line",
      expect.any(Number),
      expect.any(Number)
    );
    expect(context.fillText).toHaveBeenNthCalledWith(
      2,
      "Second line",
      expect.any(Number),
      expect.any(Number)
    );
    expect(context.fillText.mock.calls[0][2]).not.toBe(
      context.fillText.mock.calls[1][2]
    );
    rasterizer.dispose();
    frame.release();
  });

  it("defers closing a rasterized frame bitmap until the frame releases it", () => {
    const rasterizer = new TextRasterizer();
    const frame = new BitmapFrameScope();
    const rendered = rasterizer.rasterize(
      { text: "Pinned", fontSizePx: 24, color: "#ffffff" },
      1920,
      1080,
      undefined,
      frame
    );

    expect(rendered).toBe(bitmap);
    rasterizer.dispose();
    expect(close).not.toHaveBeenCalled();
    frame.release();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps an oversized live frame until release, then returns below budget", () => {
    Object.defineProperty(bitmap, "width", { configurable: true, value: 8192 });
    Object.defineProperty(bitmap, "height", { configurable: true, value: 4096 });
    const rasterizer = new TextRasterizer();
    const frame = new BitmapFrameScope();

    rasterizer.rasterize(
      { text: "Large frame", fontSizePx: 72, color: "#ffffff" },
      8192,
      4096,
      undefined,
      frame
    );

    expect(rasterizer.residentBytes).toBeGreaterThan(TEXT_BITMAP_CACHE_BUDGET_BYTES);
    expect(close).not.toHaveBeenCalled();
    frame.release();
    expect(rasterizer.residentBytes).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
    Object.defineProperty(bitmap, "width", { configurable: true, value: 1920 });
    Object.defineProperty(bitmap, "height", { configurable: true, value: 1080 });
  });
});
