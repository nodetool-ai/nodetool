import {
  computeOpaquePixelBounds,
  computeLayerOpaquePixelBounds
} from "../opaquePixelBounds";

function createMockCanvas(
  width: number,
  height: number,
  pixels?: Uint8ClampedArray
): HTMLCanvasElement {
  const data = pixels ?? new Uint8ClampedArray(width * height * 4);
  const imageData = { data, width, height };
  const ctx = {
    getImageData: jest.fn(() => imageData)
  };
  return {
    width,
    height,
    getContext: jest.fn(() => ctx)
  } as unknown as HTMLCanvasElement;
}

function setPixelAlpha(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  alpha: number
): void {
  data[(y * width + x) * 4 + 3] = alpha;
}

describe("computeOpaquePixelBounds", () => {
  it("returns null for fully transparent canvas", () => {
    const canvas = createMockCanvas(10, 10);
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("returns null for zero-width canvas", () => {
    const canvas = createMockCanvas(0, 10);
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("returns null for zero-height canvas", () => {
    const canvas = createMockCanvas(10, 0);
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("returns null when getContext returns null", () => {
    const canvas = {
      width: 10,
      height: 10,
      getContext: jest.fn(() => null)
    } as unknown as HTMLCanvasElement;
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("detects single opaque pixel", () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 5, 7, 255);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeOpaquePixelBounds(canvas);
    expect(bounds).toEqual({ x: 5, y: 7, width: 1, height: 1 });
  });

  it("computes tight bounds around multiple opaque pixels", () => {
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 3, 5, 128);
    setPixelAlpha(data, w, 15, 5, 255);
    setPixelAlpha(data, w, 10, 18, 64);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeOpaquePixelBounds(canvas);
    expect(bounds).toEqual({ x: 3, y: 5, width: 13, height: 14 });
  });

  it("respects alphaThreshold parameter", () => {
    const w = 5;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 1, 1, 10);
    setPixelAlpha(data, w, 3, 3, 200);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeOpaquePixelBounds(canvas, 50);
    expect(bounds).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });

  it("includes pixel at threshold exactly", () => {
    const w = 5;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 2, 2, 100);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeOpaquePixelBounds(canvas, 100);
    expect(bounds).toEqual({ x: 2, y: 2, width: 1, height: 1 });
  });

  it("handles full canvas of opaque pixels", () => {
    const w = 4;
    const h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < data.length; i += 4) {
      data[i] = 255;
    }
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeOpaquePixelBounds(canvas);
    expect(bounds).toEqual({ x: 0, y: 0, width: 4, height: 3 });
  });
});

describe("computeLayerOpaquePixelBounds", () => {
  it("returns null for transparent canvas", () => {
    const canvas = createMockCanvas(10, 10);
    expect(computeLayerOpaquePixelBounds(canvas)).toBeNull();
  });

  it("offsets bounds by rasterOrigin", () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 2, 3, 255);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeLayerOpaquePixelBounds(canvas, { x: 100, y: 200 });
    expect(bounds).toEqual({ x: 102, y: 203, width: 1, height: 1 });
  });

  it("uses zero offset when rasterOrigin is undefined", () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 4, 6, 128);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeLayerOpaquePixelBounds(canvas);
    expect(bounds).toEqual({ x: 4, y: 6, width: 1, height: 1 });
  });

  it("passes alphaThreshold through", () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    setPixelAlpha(data, w, 1, 1, 5);
    setPixelAlpha(data, w, 8, 8, 200);
    const canvas = createMockCanvas(w, h, data);

    const bounds = computeLayerOpaquePixelBounds(canvas, { x: 0, y: 0 }, 50);
    expect(bounds).toEqual({ x: 8, y: 8, width: 1, height: 1 });
  });
});
