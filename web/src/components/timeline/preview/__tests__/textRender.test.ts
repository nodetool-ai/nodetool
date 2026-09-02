import type { ClipTextStyle } from "@nodetool-ai/timeline";
import { stub } from "../../../../test-utils/doubles";

import { TextRasterizer } from "../textRender";
import { installGlobal } from "../../../../test-utils/doubles";

describe("TextRasterizer", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const close = jest.fn();
  const bitmap = stub<ImageBitmap>({ close });
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
    const style: ClipTextStyle = {
      text: "Motion title",
      fontFamily: "Inter",
      fontSizePx: 72,
      fontWeight: 600,
      color: "#123456",
      align: "right",
      maxWidthFrac: 0.75
    };

    const first = rasterizer.rasterize(style, 1920, 1080);
    const second = rasterizer.rasterize(style, 1920, 1080);

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
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves authored line breaks", () => {
    const rasterizer = new TextRasterizer();

    rasterizer.rasterize(
      {
        text: "First line\nSecond line",
        fontSizePx: 72,
        color: "#ffffff"
      },
      1920,
      1080
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
  });
});
