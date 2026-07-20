import type { ClipTextStyle } from "@nodetool-ai/timeline";

import { TextRasterizer } from "../textRender";

describe("TextRasterizer", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const close = jest.fn();
  const bitmap = { close } as unknown as ImageBitmap;
  const context = {
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
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
    globalThis.OffscreenCanvas =
      FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
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
    expect(context.font).toBe("600 72px Inter");
    expect(context.fillStyle).toBe("#123456");
    expect(context.textAlign).toBe("right");
    expect(context.fillText).toHaveBeenCalledWith(
      "Motion title",
      expect.any(Number),
      540
    );

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
