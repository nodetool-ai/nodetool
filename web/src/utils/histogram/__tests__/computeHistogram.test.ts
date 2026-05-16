import { computeHistogramFromRgba } from "../computeHistogram";

describe("computeHistogramFromRgba", () => {
  it("returns 256-bin Uint32Arrays for each channel", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.r.length).toBe(256);
    expect(hist.g.length).toBe(256);
    expect(hist.b.length).toBe(256);
    expect(hist.luminance.length).toBe(256);
  });

  it("counts every pixel in each per-channel histogram", () => {
    // 4 pixels: white, black, gray, gray
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      128, 128, 128, 255,
      128, 128, 128, 255
    ]);
    const hist = computeHistogramFromRgba(rgba);
    expect(hist.pixelCount).toBe(4);
    expect(hist.r[255]).toBe(1);
    expect(hist.r[0]).toBe(1);
    expect(hist.r[128]).toBe(2);
    expect(hist.g[128]).toBe(2);
    expect(hist.b[128]).toBe(2);
  });

  it("computes Rec. 709 luminance bucketed to 0–255", () => {
    // Pure red → Y ≈ 0.2126 * 255 ≈ 54
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const hist = computeHistogramFromRgba(rgba);
    const sum = hist.luminance.reduce((a, b) => a + b, 0);
    expect(sum).toBe(1);
    expect(hist.luminance[54]).toBe(1);
  });
});
