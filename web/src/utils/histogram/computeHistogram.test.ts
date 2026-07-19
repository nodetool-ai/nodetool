import { computeHistogramFromRgba } from "./computeHistogram";

describe("computeHistogramFromRgba", () => {
  it("throws when buffer length is not a multiple of 4", () => {
    const bad = new Uint8ClampedArray([1, 2, 3]);
    expect(() => computeHistogramFromRgba(bad)).toThrow(
      /must be a multiple of 4/
    );
  });

  it("counts a single red pixel", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.pixelCount).toBe(1);
    expect(hist.r[255]).toBe(1);
    expect(hist.g[0]).toBe(1);
    expect(hist.b[0]).toBe(1);
  });

  it("counts multiple pixels across channels", () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.pixelCount).toBe(3);
    expect(hist.r[255]).toBe(1);
    expect(hist.r[0]).toBe(2);
    expect(hist.g[255]).toBe(1);
    expect(hist.g[0]).toBe(2);
    expect(hist.b[255]).toBe(1);
    expect(hist.b[0]).toBe(2);
  });

  it("computes luminance using Rec. 709 weights", () => {
    const white = new Uint8ClampedArray([255, 255, 255, 255]);
    const hist = computeHistogramFromRgba(white);
    expect(hist.luminance[255]).toBe(1);

    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    const histBlack = computeHistogramFromRgba(black);
    expect(histBlack.luminance[0]).toBe(1);
  });

  it("computes expected luminance for a mid-green pixel", () => {
    const r = 0;
    const g = 128;
    const b = 0;
    const green = new Uint8ClampedArray([r, g, b, 255]);
    const hist = computeHistogramFromRgba(green);
    const expectedLum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    expect(hist.luminance[expectedLum]).toBe(1);
  });

  it("returns 256-bin arrays", () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.r.length).toBe(256);
    expect(hist.g.length).toBe(256);
    expect(hist.b.length).toBe(256);
    expect(hist.luminance.length).toBe(256);
  });

  it("handles an empty buffer", () => {
    const hist = computeHistogramFromRgba(new Uint8ClampedArray(0));
    expect(hist.pixelCount).toBe(0);
    expect(hist.r.every((v) => v === 0)).toBe(true);
  });

  it("accepts Uint8Array input", () => {
    const rgba = new Uint8Array([128, 128, 128, 255]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.pixelCount).toBe(1);
    expect(hist.r[128]).toBe(1);
  });
});
