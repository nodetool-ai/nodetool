import { previewBackingSize, previewQualityScale } from "../previewQuality";

describe("previewQualityScale", () => {
  it.each([
    ["auto", 1920, 1080, 1],
    ["auto", 3840, 2160, 0.5],
    ["auto", 1920, 2160, 0.5],
    ["full", 3840, 2160, 1],
    ["half", 1920, 1080, 0.5],
    ["quarter", 1920, 1080, 0.25]
  ] as const)("resolves %s at %ix%i to %s", (quality, width, height, scale) => {
    expect(previewQualityScale(quality, width, height)).toBe(scale);
  });

  it("restores Auto to Full resolution while paused", () => {
    expect(previewQualityScale("auto", 3840, 2160, false)).toBe(1);
  });

  it("applies quality after device pixel ratio to backing dimensions", () => {
    expect(previewBackingSize(960, 540, 2, 0.5)).toEqual({
      width: 960,
      height: 540
    });
    expect(previewBackingSize(960, 540, 2, 0.25)).toEqual({
      width: 480,
      height: 270
    });
  });

  it("caps a fullscreen high-DPI backing at the sequence resolution", () => {
    // 1512x850 CSS fullscreen on a 2x display is 3024x1700 device pixels.
    expect(previewBackingSize(1512, 850.5, 2, 1, 1920, 1080)).toEqual({
      width: 1920,
      height: 1080
    });
    expect(previewBackingSize(1512, 850.5, 2, 0.5, 1920, 1080)).toEqual({
      width: 960,
      height: 540
    });
  });

  it("keeps display resolution when it is below the sequence resolution", () => {
    expect(previewBackingSize(640, 360, 2, 1, 1920, 1080)).toEqual({
      width: 1280,
      height: 720
    });
  });
});
