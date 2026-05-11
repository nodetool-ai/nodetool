/**
 * @jest-environment node
 */
import {
  blendModeToComposite,
  checkerboardDocumentCellPx,
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
