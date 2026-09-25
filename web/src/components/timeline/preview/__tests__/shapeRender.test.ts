import type { ClipShapeStyle } from "@nodetool-ai/timeline";
import { installGlobal, stub } from "../../../../test-utils/doubles";
import { BitmapFrameScope } from "../BitmapFrameScope";
import {
  ShapeRasterizer,
  SHAPE_BITMAP_CACHE_BUDGET_BYTES
} from "../shapeRender";

describe("ShapeRasterizer", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const close = jest.fn();
  const bitmap = stub<ImageBitmap>({
    close,
    width: 8192,
    height: 4096
  });

  beforeEach(() => {
    close.mockClear();
    class FakeOffscreenCanvas {
      getContext() {
        return {};
      }

      transferToImageBitmap() {
        return bitmap;
      }
    }
    installGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  afterAll(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  it("keeps an oversized shape through frame consumption then returns under budget", () => {
    const rasterizer = new ShapeRasterizer();
    const frame = new BitmapFrameScope();
    const style: ClipShapeStyle = { kind: "rectangle", fill: "#ffffff" };

    expect(rasterizer.rasterize(style, 8192, 4096, frame)).toBe(bitmap);
    expect(rasterizer.residentBytes).toBeGreaterThan(SHAPE_BITMAP_CACHE_BUDGET_BYTES);
    expect(close).not.toHaveBeenCalled();

    frame.release();

    expect(rasterizer.residentBytes).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
