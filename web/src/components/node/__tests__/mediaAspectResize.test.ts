import {
  computeAspectResize,
  computeFreeResize,
  type MediaBox,
  type ResizeBounds
} from "../mediaAspectResize";

const bounds: ResizeBounds = { minWidth: 150, maxWidth: 800, minHeight: 80 };

describe("computeAspectResize", () => {
  // Image-only node: square image, 30px of chrome (header), no side padding.
  const squareImageOnly: MediaBox = { ratio: 1, sidePad: 0, chrome: 30 };

  it("derives height from width so the media box keeps its ratio", () => {
    const result = computeAspectResize(
      { startWidth: 200, startHeight: 200, deltaX: 100, deltaY: 0 },
      squareImageOnly,
      bounds
    );
    // width 300 → media 300 wide → media 300 tall (ratio 1) → +30 chrome.
    expect(result).toEqual({ width: 300, height: 330 });
  });

  it("treats sliders/chrome as a fixed offset, not scaled with the media", () => {
    // 2:1 image, 24px side padding, 120px chrome (header + a slider + outputs).
    const wideWithSliders: MediaBox = { ratio: 2, sidePad: 24, chrome: 120 };
    const result = computeAspectResize(
      { startWidth: 300, startHeight: 300, deltaX: 200, deltaY: 0 },
      wideWithSliders,
      bounds
    );
    // width 500 → media 476 wide → media 238 tall → +120 chrome = 358.
    expect(result.width).toBe(500);
    expect(result.height).toBe(358);
    // The media box ratio is preserved (≈ 2), the chrome is untouched.
    expect((result.width - 24) / (result.height - 120)).toBeCloseTo(2, 5);
  });

  it("drives from the axis the pointer moved most (height-driven)", () => {
    const result = computeAspectResize(
      { startWidth: 200, startHeight: 200, deltaX: 10, deltaY: 100 },
      squareImageOnly,
      bounds
    );
    // height 300 → media 270 tall → media 270 wide (ratio 1) → +0 side pad.
    expect(result).toEqual({ width: 270, height: 300 });
  });

  it("re-derives width when the height floor clamps a width-driven resize", () => {
    // Very wide media shrunk hard: the new width would push height under
    // minHeight, so height floors and width grows back to honour the ratio.
    const wide: MediaBox = { ratio: 4, sidePad: 0, chrome: 20 };
    const result = computeAspectResize(
      { startWidth: 600, startHeight: 200, deltaX: -500, deltaY: 0 },
      wide,
      bounds
    );
    expect(result.height).toBe(bounds.minHeight); // 80
    // media height 60 → media width 240 (ratio 4).
    expect(result.width).toBe(240);
    expect((result.width - 0) / (result.height - 20)).toBeCloseTo(4, 5);
  });

  it("clamps width to maxWidth and re-derives height", () => {
    const result = computeAspectResize(
      { startWidth: 700, startHeight: 700, deltaX: 400, deltaY: 0 },
      squareImageOnly,
      bounds
    );
    expect(result.width).toBe(bounds.maxWidth);
    // width 800 → media 800 → height 830.
    expect(result.height).toBe(830);
  });
});

describe("computeFreeResize", () => {
  it("moves both axes independently within bounds", () => {
    expect(
      computeFreeResize(
        { startWidth: 200, startHeight: 200, deltaX: 50, deltaY: -40 },
        bounds
      )
    ).toEqual({ width: 250, height: 160 });
  });

  it("respects min/max bounds", () => {
    expect(
      computeFreeResize(
        { startWidth: 200, startHeight: 200, deltaX: 1000, deltaY: -1000 },
        bounds
      )
    ).toEqual({ width: 800, height: 80 });
  });
});
