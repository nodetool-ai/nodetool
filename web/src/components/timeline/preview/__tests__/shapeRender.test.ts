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

describe("ShapeRasterizer windows", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const created: Array<{ width: number; height: number; translate: jest.Mock }> = [];

  beforeEach(() => {
    created.length = 0;
    class RecordingOffscreenCanvas {
      private readonly record: { width: number; height: number; translate: jest.Mock };
      constructor(width: number, height: number) {
        this.record = { width, height, translate: jest.fn() };
        created.push(this.record);
      }

      getContext() {
        const translate = this.record.translate;
        // Every other drawing call is a no-op: only the placement is checked.
        return new Proxy({ translate } as Record<string | symbol, unknown>, {
          get: (target, name) => (name in target ? target[name] : () => undefined)
        });
      }

      transferToImageBitmap() {
        return stub<ImageBitmap>({ close: jest.fn(), width: this.record.width, height: this.record.height });
      }
    }
    installGlobal("OffscreenCanvas", RecordingOffscreenCanvas);
  });

  afterAll(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  const style: ClipShapeStyle = { kind: "rect", x: 0.4, y: 0.4, width: 0.1, height: 0.1, fill: "#ffffff" };

  it("rasterizes only the window the shape reaches and says where it sits", () => {
    const rasterizer = new ShapeRasterizer();
    const bitmap = rasterizer.rasterize(style, 1920, 1080, new BitmapFrameScope(), 0);
    expect(bitmap).not.toBeNull();
    const window = rasterizer.windowOf(bitmap!);
    expect(window).toBeDefined();
    expect(created[0]).toMatchObject({ width: window!.width, height: window!.height });
    expect(window!.width * window!.height).toBeLessThan(1920 * 1080 / 10);
    expect(created[0]!.translate).toHaveBeenCalledWith(-window!.x, -window!.y);
  });

  it("keeps a frame-sized raster apart from a windowed one of the same style", () => {
    const rasterizer = new ShapeRasterizer();
    const scope = new BitmapFrameScope();
    const windowed = rasterizer.rasterize(style, 1920, 1080, scope, 0);
    const full = rasterizer.rasterize(style, 1920, 1080, scope);
    expect(full).not.toBe(windowed);
    expect(rasterizer.windowOf(full!)).toBeUndefined();
    expect(created[1]).toMatchObject({ width: 1920, height: 1080 });
  });
});
