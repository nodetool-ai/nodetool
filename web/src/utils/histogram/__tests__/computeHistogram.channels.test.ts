import { computeHistogramFromRgba } from "../computeHistogram";

describe("computeHistogramFromRgba — per-channel accuracy", () => {
  it("places pure green pixel in correct luminance bin (182)", () => {
    const rgba = new Uint8ClampedArray([0, 255, 0, 255]);
    const hist = computeHistogramFromRgba(rgba);
    const luminanceBin = Math.round(0.7152 * 255);
    expect(hist.luminance[luminanceBin]).toBe(1);
  });

  it("places pure blue pixel in correct luminance bin (18)", () => {
    const rgba = new Uint8ClampedArray([0, 0, 255, 255]);
    const hist = computeHistogramFromRgba(rgba);
    const luminanceBin = Math.round(0.0722 * 255);
    expect(hist.luminance[luminanceBin]).toBe(1);
  });

  it("ignores the alpha channel in histogram bins", () => {
    const opaqueRed = new Uint8ClampedArray([200, 0, 0, 255]);
    const transparentRed = new Uint8ClampedArray([200, 0, 0, 0]);
    const histOpaque = computeHistogramFromRgba(opaqueRed);
    const histTransparent = computeHistogramFromRgba(transparentRed);

    expect(histOpaque.r[200]).toBe(1);
    expect(histTransparent.r[200]).toBe(1);
    expect(histOpaque.luminance).toEqual(histTransparent.luminance);
  });

  it("counts multiple pixels at the same intensity", () => {
    const rgba = new Uint8ClampedArray([
      100, 0, 0, 255,
      100, 0, 0, 255,
      100, 0, 0, 255,
      100, 0, 0, 255,
      100, 0, 0, 255
    ]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.r[100]).toBe(5);
    expect(hist.g[0]).toBe(5);
    expect(hist.b[0]).toBe(5);
    expect(hist.pixelCount).toBe(5);
  });

  it("distributes a gradient across multiple bins", () => {
    const pixels = [];
    for (let i = 0; i < 256; i++) {
      pixels.push(i, i, i, 255);
    }
    const rgba = new Uint8ClampedArray(pixels);
    const hist = computeHistogramFromRgba(rgba);

    expect(hist.pixelCount).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(hist.r[i]).toBe(1);
      expect(hist.g[i]).toBe(1);
      expect(hist.b[i]).toBe(1);
    }
  });

  it("handles Uint8Array input (not just Uint8ClampedArray)", () => {
    const rgba = new Uint8Array([128, 64, 32, 255]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.r[128]).toBe(1);
    expect(hist.g[64]).toBe(1);
    expect(hist.b[32]).toBe(1);
    expect(hist.pixelCount).toBe(1);
  });

  it("total luminance count equals pixel count for any image", () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      128, 128, 128, 255,
      0, 0, 0, 255,
      255, 255, 255, 255
    ]);
    const hist = computeHistogramFromRgba(rgba);
    const totalLuminance = hist.luminance.reduce((a, b) => a + b, 0);
    expect(totalLuminance).toBe(hist.pixelCount);
    expect(hist.pixelCount).toBe(6);
  });

  it("throws for buffer of length 5 (not multiple of 4)", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0]);
    expect(() => computeHistogramFromRgba(rgba)).toThrow(/multiple of 4/);
  });

  it("throws for buffer of length 1", () => {
    const rgba = new Uint8ClampedArray([42]);
    expect(() => computeHistogramFromRgba(rgba)).toThrow(/multiple of 4/);
  });
});
