import {
  SKETCH_FULL_OPACITY_THRESHOLD,
  snapStrokeDabCenterDoc
} from "../painting/strokeRendering";

describe("snapStrokeDabCenterDoc", () => {
  it("matches pencil dabAt floor-snap (hover preview parity with PencilEngine.stabilize)", () => {
    // PencilEngine.stabilize uses Math.floor so ink lands in the pixel that
    // CONTAINS the pointer (not the nearest integer grid intersection). The
    // crisp-pixel preview must agree with that — passing raw doc coords to
    // snapStrokeDabCenterDoc yields the same cell as the engine produces.
    const raw = { x: 10.6, y: 9.75 };
    const floored = { x: Math.floor(raw.x), y: Math.floor(raw.y) };
    expect(floored).toEqual({ x: 10, y: 9 });
    expect(snapStrokeDabCenterDoc(raw.x, raw.y, 1, 1)).toEqual({ x: 10.5, y: 9.5 });
    expect(snapStrokeDabCenterDoc(floored.x, floored.y, 1, 1)).toEqual({ x: 10.5, y: 9.5 });
  });

  it("uses half-integer centers for crisp single-pixel dabs (matches dabAt)", () => {
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 1, 1)).toEqual({ x: 3.5, y: 2.5 });
    expect(snapStrokeDabCenterDoc(3.25, 4.8, 1.25, 1)).toEqual({ x: 3.5, y: 4.5 });
  });

  it("snaps to pixel-center arc centers when opaque but larger than crisp threshold", () => {
    // Half-integer center of the pixel CONTAINING the pointer — matches
    // `drawPencilStroke.dabAt` non-crisp path (stabilize floors, dabAt + 0.5).
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 4, 1)).toEqual({ x: 3.5, y: 2.5 });
    expect(snapStrokeDabCenterDoc(3.0, 2.0, 4, 1)).toEqual({ x: 3.5, y: 2.5 });
    expect(snapStrokeDabCenterDoc(3.99, 2.99, 4, 1)).toEqual({ x: 3.5, y: 2.5 });
  });

  it("keeps continuous coords when below full-opacity threshold", () => {
    const sub = SKETCH_FULL_OPACITY_THRESHOLD - 0.01;
    expect(snapStrokeDabCenterDoc(3.7, 2.2, 1, sub)).toEqual({ x: 3.7, y: 2.2 });
  });
});
