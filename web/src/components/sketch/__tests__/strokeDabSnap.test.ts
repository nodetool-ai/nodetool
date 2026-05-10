import {
  SKETCH_FULL_OPACITY_THRESHOLD,
  snapStrokeDabCenterDoc
} from "../painting/strokeRendering";

describe("snapStrokeDabCenterDoc", () => {
  it("matches pencil dabAt after PencilEngine integer grid (hover preview parity)", () => {
    const raw = { x: 10.6, y: 9.75 };
    const grid = { x: Math.round(raw.x), y: Math.round(raw.y) };
    expect(grid).toEqual({ x: 11, y: 10 });
    expect(snapStrokeDabCenterDoc(grid.x, grid.y, 1, 1)).toEqual({ x: 11.5, y: 10.5 });
    // Without grid snap, crisp math picks the wrong cell near half-integers:
    expect(snapStrokeDabCenterDoc(raw.x, raw.y, 1, 1)).toEqual({ x: 10.5, y: 9.5 });
  });

  it("uses half-integer centers for crisp single-pixel dabs (matches dabAt)", () => {
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 1, 1)).toEqual({ x: 3.5, y: 2.5 });
    expect(snapStrokeDabCenterDoc(3.25, 4.8, 1.25, 1)).toEqual({ x: 3.5, y: 4.5 });
  });

  it("snaps to integer arc centers when opaque but larger than crisp threshold", () => {
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 4, 1)).toEqual({ x: 4, y: 2 });
  });

  it("keeps continuous coords when below full-opacity threshold", () => {
    const sub = SKETCH_FULL_OPACITY_THRESHOLD - 0.01;
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 1, sub)).toEqual({ x: 3.7, y: 2.2 });
  });
});
