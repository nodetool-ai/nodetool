/**
 * @jest-environment node
 */
import {
  blendModeToComposite,
  checkerboardDocumentCellPx,
  fitImageRect,
  PIXEL_GRID_MIN_ZOOM,
  PIXEL_GRID_FULL_OPACITY_ZOOM,
  PENCIL_PIXEL_CURSOR_MIN_ZOOM
} from "../canvasUtils";

describe("blendModeToComposite", () => {
  const cases: Array<[string, GlobalCompositeOperation]> = [
    ["multiply", "multiply"],
    ["screen", "screen"],
    ["overlay", "overlay"],
    ["darken", "darken"],
    ["lighten", "lighten"],
    ["color-dodge", "color-dodge"],
    ["color-burn", "color-burn"],
    ["hard-light", "hard-light"],
    ["soft-light", "soft-light"],
    ["difference", "difference"],
    ["exclusion", "exclusion"]
  ];

  it.each(cases)("maps '%s' to '%s'", (mode, expected) => {
    expect(blendModeToComposite(mode as any)).toBe(expected);
  });

  it("defaults 'normal' to 'source-over'", () => {
    expect(blendModeToComposite("normal" as any)).toBe("source-over");
  });

  it("defaults unknown blend modes to 'source-over'", () => {
    expect(blendModeToComposite("unknown-mode" as any)).toBe("source-over");
  });
});

describe("checkerboardDocumentCellPx", () => {
  it("returns 8 at 1x zoom (screen cell matches doc cell)", () => {
    expect(checkerboardDocumentCellPx(1)).toBe(8);
  });

  it("returns 4 at 2x zoom", () => {
    expect(checkerboardDocumentCellPx(2)).toBe(4);
  });

  it("returns 1 at very high zoom", () => {
    expect(checkerboardDocumentCellPx(100)).toBe(1);
  });

  it("never returns less than 1", () => {
    expect(checkerboardDocumentCellPx(1000)).toBeGreaterThanOrEqual(1);
  });

  it("returns larger cells at fractional zoom (zoomed out)", () => {
    const result = checkerboardDocumentCellPx(0.25);
    expect(result).toBe(32);
  });

  it("defaults to zoom=1 for undefined", () => {
    expect(checkerboardDocumentCellPx(undefined)).toBe(8);
  });

  it("defaults to zoom=1 for 0", () => {
    expect(checkerboardDocumentCellPx(0)).toBe(8);
  });

  it("defaults to zoom=1 for negative values", () => {
    expect(checkerboardDocumentCellPx(-1)).toBe(8);
  });

  it("keeps one cell size between doublings so zoom steps skip re-compositing", () => {
    const sizes = new Set(
      [0.75, 0.85, 1, 1.15, 1.35].map((z) => checkerboardDocumentCellPx(z))
    );
    expect([...sizes]).toEqual([8]);
    expect(checkerboardDocumentCellPx(0.6)).toBe(16);
    expect(checkerboardDocumentCellPx(1.5)).toBe(4);
  });

  it("always returns an integer", () => {
    for (const z of [0.3, 0.7, 1.5, 3.3, 7.7]) {
      expect(Number.isInteger(checkerboardDocumentCellPx(z))).toBe(true);
    }
  });
});

describe("constants", () => {
  it("has expected pixel grid zoom thresholds", () => {
    expect(PIXEL_GRID_MIN_ZOOM).toBe(20);
    expect(PIXEL_GRID_FULL_OPACITY_ZOOM).toBe(28);
    expect(PENCIL_PIXEL_CURSOR_MIN_ZOOM).toBe(2);
  });

  it("min zoom is less than full opacity zoom", () => {
    expect(PIXEL_GRID_MIN_ZOOM).toBeLessThan(PIXEL_GRID_FULL_OPACITY_ZOOM);
  });
});

// Round 6 F3: a generated image smaller than its layer was drawn at its own
// size in the top-left corner although the layer said "contain".
describe("fitImageRect", () => {
  it("keeps the image's own size when the layer names no fit", () => {
    expect(fitImageRect(256, 256, 1024, 1024, undefined)).toEqual({
      x: 0, y: 0, width: 256, height: 256
    });
  });

  it("scales a contained image up to the layer and centers it", () => {
    expect(fitImageRect(256, 256, 1024, 1024, "contain")).toEqual({
      x: 0, y: 0, width: 1024, height: 1024
    });
    expect(fitImageRect(200, 100, 1024, 1024, "contain")).toEqual({
      x: 0, y: 256, width: 1024, height: 512
    });
  });

  it("covers the layer, cropping the overflow evenly", () => {
    expect(fitImageRect(200, 100, 1024, 1024, "cover")).toEqual({
      x: -512, y: 0, width: 2048, height: 1024
    });
  });

  it("stretches a filled image to the layer", () => {
    expect(fitImageRect(200, 100, 1024, 512, "fill")).toEqual({
      x: 0, y: 0, width: 1024, height: 512
    });
  });
});
