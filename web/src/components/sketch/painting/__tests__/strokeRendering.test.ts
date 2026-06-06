/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  strokePressureMultiplier,
  paintPressureForEngine,
  pixelPerfectPencilDabFootprint,
  snapStrokeDabCenterDoc,
  stampAlongStroke,
  expandDirtyRect,
  expandDirtyRectFromPoints,
  brushSettingsForEraserStroke,
  pencilSettingsForEraserStroke,
  SKETCH_FULL_OPACITY_THRESHOLD,
  MIN_PRESSURE_FACTOR,
  type StrokeStampState
} from "../strokeRendering";
import type { BrushSettings, PencilSettings, EraserSettings } from "../../types";

// ─── Helpers ────────────────────────────────────────────────────────────────

type DirtyRectBox = { minX: number; minY: number; maxX: number; maxY: number };
type DirtyRectTracker = { current: DirtyRectBox | null };

function makeDirtyRect(box?: DirtyRectBox): DirtyRectTracker {
  return { current: box ?? null };
}

function makeBrush(overrides: Partial<BrushSettings> = {}): BrushSettings {
  return {
    size: 10,
    opacity: 1,
    hardness: 0.8,
    color: "#ff0000",
    brushType: "round",
    pressureSensitivity: false,
    pressureAffects: "size",
    pressureMinScale: 0.06,
    pressureCurve: 1,
    roundness: 1,
    angle: 0,
    stabilizer: 0,
    ...overrides
  };
}

function makePencil(overrides: Partial<PencilSettings> = {}): PencilSettings {
  return {
    size: 1,
    opacity: 1,
    color: "#000000",
    pressureSensitivity: false,
    pressureAffects: "size",
    pressureMinScale: 0.06,
    pressureCurve: 1,
    stabilizer: 0,
    ...overrides
  };
}

function makeEraser(overrides: Partial<EraserSettings> = {}): EraserSettings {
  return {
    size: 20,
    opacity: 1,
    mode: "brush",
    stabilizer: 0,
    ...overrides
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("SKETCH_FULL_OPACITY_THRESHOLD is 0.999", () => {
    expect(SKETCH_FULL_OPACITY_THRESHOLD).toBe(0.999);
  });

  it("MIN_PRESSURE_FACTOR is 0.2", () => {
    expect(MIN_PRESSURE_FACTOR).toBe(0.2);
  });
});

// ─── strokePressureMultiplier ───────────────────────────────────────────────

describe("strokePressureMultiplier", () => {
  it("returns minScale at pressure=0", () => {
    expect(strokePressureMultiplier(0, 0.2, 1)).toBe(0.2);
  });

  it("returns 1 at pressure=1", () => {
    expect(strokePressureMultiplier(1, 0.2, 1)).toBe(1);
  });

  it("returns 1 at pressure=1 regardless of minScale and curve", () => {
    expect(strokePressureMultiplier(1, 0.5, 2)).toBe(1);
    expect(strokePressureMultiplier(1, 0.02, 3)).toBe(1);
    expect(strokePressureMultiplier(1, 0.8, 0.5)).toBe(1);
  });

  it("linear interpolation when curve=1", () => {
    const result = strokePressureMultiplier(0.5, 0.2, 1);
    // m + (1-m)*p = 0.2 + 0.8*0.5 = 0.6
    expect(result).toBeCloseTo(0.6, 10);
  });

  it("uses pow for non-linear curve", () => {
    const result = strokePressureMultiplier(0.5, 0.2, 2);
    // shaped = pow(0.5, 2) = 0.25
    // m + (1-m)*shaped = 0.2 + 0.8*0.25 = 0.4
    expect(result).toBeCloseTo(0.4, 10);
  });

  it("curve < 1 gives higher multiplier at mid pressures", () => {
    const result = strokePressureMultiplier(0.5, 0.2, 0.5);
    // shaped = pow(0.5, 0.5) = sqrt(0.5) ~ 0.7071
    // m + (1-m)*shaped = 0.2 + 0.8*0.7071 ~ 0.7657
    expect(result).toBeCloseTo(0.2 + 0.8 * Math.pow(0.5, 0.5), 10);
  });

  it("uses default minScale and curve when omitted", () => {
    // DEFAULT_PRESSURE_MIN_SCALE = 0.06, DEFAULT_PRESSURE_CURVE = 1
    const result = strokePressureMultiplier(0.5);
    // m=0.06, c=1 => 0.06 + 0.94*0.5 = 0.53
    expect(result).toBeCloseTo(0.53, 10);
  });

  // ─── Clamping ───

  it("clamps pressure below 0 to 0", () => {
    expect(strokePressureMultiplier(-0.5, 0.2, 1)).toBe(0.2);
  });

  it("clamps pressure above 1 to 1", () => {
    expect(strokePressureMultiplier(1.5, 0.2, 1)).toBe(1);
  });

  it("clamps minScale below 0.02 to 0.02", () => {
    const result = strokePressureMultiplier(0, 0.001, 1);
    expect(result).toBe(0.02);
  });

  it("clamps minScale above 1 to 1", () => {
    const result = strokePressureMultiplier(0.5, 5, 1);
    // m=1, so m + (1-m)*shaped = 1 + 0*shaped = 1
    expect(result).toBe(1);
  });

  it("clamps curve below 0.35 to 0.35", () => {
    const result = strokePressureMultiplier(0.5, 0.2, 0.1);
    const expected = 0.2 + 0.8 * Math.pow(0.5, 0.35);
    expect(result).toBeCloseTo(expected, 10);
  });

  it("clamps curve above 3 to 3", () => {
    const result = strokePressureMultiplier(0.5, 0.2, 10);
    const expected = 0.2 + 0.8 * Math.pow(0.5, 3);
    expect(result).toBeCloseTo(expected, 10);
  });

  it("monotonically increases with pressure", () => {
    const pressures = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    const results = pressures.map((p) => strokePressureMultiplier(p, 0.2, 1.4));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }
  });

  it("result is always in [minScale, 1]", () => {
    const cases = [
      { p: 0, m: 0.1, c: 1 },
      { p: 0.5, m: 0.3, c: 2 },
      { p: 1, m: 0.05, c: 0.5 },
      { p: 0.001, m: 0.9, c: 1.5 }
    ];
    for (const { p, m, c } of cases) {
      const result = strokePressureMultiplier(p, m, c);
      const clampedM = Math.max(0.02, Math.min(1, m));
      expect(result).toBeGreaterThanOrEqual(clampedM);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

// ─── paintPressureForEngine ─────────────────────────────────────────────────

describe("paintPressureForEngine", () => {
  it("returns pressure for pen pointer type", () => {
    expect(paintPressureForEngine(0.7, "pen")).toBe(0.7);
  });

  it("returns pressure for touch pointer type", () => {
    expect(paintPressureForEngine(0.5, "touch")).toBe(0.5);
  });

  it("returns undefined for mouse pointer type", () => {
    expect(paintPressureForEngine(0.5, "mouse")).toBeUndefined();
  });

  it("returns undefined for unknown pointer type", () => {
    expect(paintPressureForEngine(0.5, "trackpad")).toBeUndefined();
  });

  it("returns undefined when pointerType is undefined", () => {
    expect(paintPressureForEngine(0.5, undefined)).toBeUndefined();
  });

  it("returns undefined when pressure is undefined", () => {
    expect(paintPressureForEngine(undefined, "pen")).toBeUndefined();
  });

  it("returns undefined when pressure is 0", () => {
    expect(paintPressureForEngine(0, "pen")).toBeUndefined();
  });

  it("returns undefined when pressure is negative", () => {
    expect(paintPressureForEngine(-0.1, "pen")).toBeUndefined();
  });

  it("returns very small positive pressure for pen", () => {
    expect(paintPressureForEngine(0.001, "pen")).toBe(0.001);
  });

  it("returns pressure=1 for pen", () => {
    expect(paintPressureForEngine(1, "pen")).toBe(1);
  });
});

// ─── pixelPerfectPencilDabFootprint ─────────────────────────────────────────

describe("pixelPerfectPencilDabFootprint", () => {
  it("size=1 produces 1x1 at floor(x), floor(y)", () => {
    const result = pixelPerfectPencilDabFootprint(5.3, 7.8, 1);
    // n = max(1, round(1)) = 1, offset = floor(0/2) = 0
    expect(result).toEqual({ ix: 5, iy: 7, n: 1 });
  });

  it("size=3 produces 3x3 centered", () => {
    const result = pixelPerfectPencilDabFootprint(10, 20, 3);
    // n=3, offset=floor(2/2)=1
    expect(result).toEqual({ ix: 9, iy: 19, n: 3 });
  });

  it("even size=2 uses floor((n-1)/2)=0 offset (top-left convention)", () => {
    const result = pixelPerfectPencilDabFootprint(10.5, 20.5, 2);
    // n=2, offset=floor(1/2)=0
    expect(result).toEqual({ ix: 10, iy: 20, n: 2 });
  });

  it("even size=4 uses offset=1", () => {
    const result = pixelPerfectPencilDabFootprint(10, 20, 4);
    // n=4, offset=floor(3/2)=1
    expect(result).toEqual({ ix: 9, iy: 19, n: 4 });
  });

  it("fractional size rounds to nearest integer", () => {
    // size=1.6 => n=round(1.6)=2
    const result = pixelPerfectPencilDabFootprint(5, 5, 1.6);
    expect(result.n).toBe(2);
  });

  it("size=0.4 rounds to 1 (minimum is 1)", () => {
    const result = pixelPerfectPencilDabFootprint(5, 5, 0.4);
    // n=max(1, round(0.4))=max(1,0)=1
    expect(result.n).toBe(1);
  });

  it("size=0 gives n=1", () => {
    const result = pixelPerfectPencilDabFootprint(5, 5, 0);
    expect(result.n).toBe(1);
  });

  it("negative coordinates work correctly", () => {
    const result = pixelPerfectPencilDabFootprint(-3.2, -7.9, 3);
    // floor(-3.2)=-4, floor(-7.9)=-8, n=3, offset=1
    expect(result).toEqual({ ix: -5, iy: -9, n: 3 });
  });

  it("large size produces correct offset", () => {
    const result = pixelPerfectPencilDabFootprint(100, 100, 9);
    // n=9, offset=floor(8/2)=4
    expect(result).toEqual({ ix: 96, iy: 96, n: 9 });
  });
});

// ─── snapStrokeDabCenterDoc ─────────────────────────────────────────────────

describe("snapStrokeDabCenterDoc", () => {
  describe("low opacity (below threshold) - no snapping", () => {
    it("returns coordinates unchanged", () => {
      const result = snapStrokeDabCenterDoc(5.3, 7.8, 10, 0.5);
      expect(result).toEqual({ x: 5.3, y: 7.8 });
    });

    it("returns coordinates unchanged even with pixelPerfect", () => {
      const result = snapStrokeDabCenterDoc(5.3, 7.8, 10, 0.5, true);
      expect(result).toEqual({ x: 5.3, y: 7.8 });
    });

    it("just below threshold returns unchanged", () => {
      const result = snapStrokeDabCenterDoc(5.3, 7.8, 10, 0.998);
      expect(result).toEqual({ x: 5.3, y: 7.8 });
    });
  });

  describe("high opacity with pixelPerfect", () => {
    it("snaps to pixel-perfect center for size=1", () => {
      // pixelPerfectPencilDabFootprint(5.3,7.8,1) => {ix:5, iy:7, n:1}
      // result: {x:5+0.5, y:7+0.5}
      const result = snapStrokeDabCenterDoc(5.3, 7.8, 1, 1.0, true);
      expect(result).toEqual({ x: 5.5, y: 7.5 });
    });

    it("snaps to pixel-perfect center for size=3", () => {
      // pixelPerfectPencilDabFootprint(10,20,3) => {ix:9, iy:19, n:3}
      // result: {x:9+1.5, y:19+1.5}
      const result = snapStrokeDabCenterDoc(10, 20, 3, 1.0, true);
      expect(result).toEqual({ x: 10.5, y: 20.5 });
    });

    it("works at exactly the threshold opacity", () => {
      const result = snapStrokeDabCenterDoc(5.3, 7.8, 1, 0.999, true);
      expect(result).toEqual({ x: 5.5, y: 7.5 });
    });
  });

  describe("high opacity without pixelPerfect, small size (<=1.25)", () => {
    it("snaps to floor + 0.5", () => {
      const result = snapStrokeDabCenterDoc(5.7, 7.2, 1.0, 1.0, false);
      expect(result).toEqual({ x: 5.5, y: 7.5 });
    });

    it("snaps for size=1.25", () => {
      const result = snapStrokeDabCenterDoc(3.9, 4.1, 1.25, 1.0, false);
      expect(result).toEqual({ x: 3.5, y: 4.5 });
    });
  });

  describe("high opacity without pixelPerfect, larger size (>1.25)", () => {
    it("snaps to floor + 0.5", () => {
      const result = snapStrokeDabCenterDoc(5.7, 7.2, 5, 1.0, false);
      expect(result).toEqual({ x: 5.5, y: 7.5 });
    });

    it("snaps for large brush sizes", () => {
      const result = snapStrokeDabCenterDoc(100.9, 200.1, 50, 1.0);
      expect(result).toEqual({ x: 100.5, y: 200.5 });
    });
  });

  describe("edge cases", () => {
    it("integer coordinates snap to n+0.5 when opaque", () => {
      const result = snapStrokeDabCenterDoc(5, 10, 2, 1.0, false);
      expect(result).toEqual({ x: 5.5, y: 10.5 });
    });

    it("negative coordinates snap correctly", () => {
      const result = snapStrokeDabCenterDoc(-3.2, -7.9, 1, 1.0, false);
      // floor(-3.2)=-4, floor(-7.9)=-8
      expect(result).toEqual({ x: -4 + 0.5, y: -8 + 0.5 });
    });

    it("pixelPerfect defaults to false", () => {
      const result = snapStrokeDabCenterDoc(5.7, 7.2, 5, 1.0);
      // No pixelPerfect, snapDabs=true, size>1.25 => floor+0.5
      expect(result).toEqual({ x: 5.5, y: 7.5 });
    });
  });
});

// ─── stampAlongStroke ───────────────────────────────────────────────────────

describe("stampAlongStroke", () => {
  describe("without stampState", () => {
    it("stamps once at from when distance is 0", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 5, y: 10 },
        { x: 5, y: 10 },
        4,
        (x, y) => stamps.push({ x, y })
      );
      expect(stamps).toEqual([{ x: 5, y: 10 }]);
    });

    it("stamps evenly along a horizontal line", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        5,
        (x, y) => stamps.push({ x, y })
      );
      // distance=10, steps=ceil(10/5)=2, stamps at t=0, 0.5, 1
      expect(stamps).toHaveLength(3);
      expect(stamps[0]).toEqual({ x: 0, y: 0 });
      expect(stamps[1]).toEqual({ x: 5, y: 0 });
      expect(stamps[2]).toEqual({ x: 10, y: 0 });
    });

    it("always produces at least 2 stamps for nonzero distance", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        100,
        (x, y) => stamps.push({ x, y })
      );
      // distance=1, steps=max(1,ceil(1/100))=1, stamps at t=0,1
      expect(stamps).toHaveLength(2);
      expect(stamps[0]).toEqual({ x: 0, y: 0 });
      expect(stamps[1]).toEqual({ x: 1, y: 0 });
    });

    it("produces ceil(distance/spacing)+1 stamps", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 7, y: 0 },
        3,
        (x, y) => stamps.push({ x, y })
      );
      // distance=7, steps=ceil(7/3)=3, stamps at t=0, 1/3, 2/3, 1 => 4 stamps
      expect(stamps).toHaveLength(4);
    });

    it("stamps along a diagonal line", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        5,
        (x, y) => stamps.push({ x, y })
      );
      // distance=5, steps=ceil(5/5)=1, stamps at t=0,1
      expect(stamps).toHaveLength(2);
      expect(stamps[0]).toEqual({ x: 0, y: 0 });
      expect(stamps[1]).toEqual({ x: 3, y: 4 });
    });

    it("first stamp is exactly at from, last is exactly at to", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      stampAlongStroke(
        { x: 2, y: 3 },
        { x: 12, y: 8 },
        2,
        (x, y) => stamps.push({ x, y })
      );
      expect(stamps[0]).toEqual({ x: 2, y: 3 });
      const last = stamps[stamps.length - 1];
      expect(last.x).toBeCloseTo(12, 10);
      expect(last.y).toBeCloseTo(8, 10);
    });
  });

  describe("with stampState", () => {
    it("first call stamps at from and sets hasStamped", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: false, distanceToNextDab: 0 };
      stampAlongStroke(
        { x: 5, y: 10 },
        { x: 5, y: 10 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toEqual([{ x: 5, y: 10 }]);
      expect(state.hasStamped).toBe(true);
      expect(state.distanceToNextDab).toBe(4);
    });

    it("does not stamp again until spacing is met", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: false, distanceToNextDab: 0 };

      // First call: stamps at from, sets distanceToNextDab = 4
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(1);

      // Move 2 pixels - not enough for another dab
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(1); // No new stamps
    });

    it("stamps when accumulated distance reaches spacing", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: false, distanceToNextDab: 0 };

      // First call
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );

      // Move 5 pixels - exceeds spacing of 4
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );
      // After initial stamp, distanceToNextDab=4. Move 5: stamp at distance 4 from origin.
      expect(stamps).toHaveLength(2);
      expect(stamps[1].x).toBeCloseTo(4, 10);
      expect(stamps[1].y).toBeCloseTo(0, 10);
    });

    it("multiple stamps in a single segment when distance is large", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: false, distanceToNextDab: 0 };

      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        3,
        (x, y) => stamps.push({ x, y }),
        state
      );

      // Move 10 pixels with spacing 3, starting from distanceToNextDab=3
      // Stamps at distance 3, 6, 9
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        3,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(4); // initial + 3 along segment
    });

    it("zero distance with hasStamped=true produces no stamps", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: true, distanceToNextDab: 2 };
      stampAlongStroke(
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        4,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(0);
    });

    it("carries over fractional distance between segments", () => {
      const stamps: Array<{ x: number; y: number }> = [];
      const state: StrokeStampState = { hasStamped: false, distanceToNextDab: 0 };

      // First call
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        5,
        (x, y) => stamps.push({ x, y }),
        state
      );
      // distanceToNextDab = 5

      // Move 3 - no stamp, distanceToNextDab should become 5 - 3 = 2
      stampAlongStroke(
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        5,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(1);
      expect(state.distanceToNextDab).toBeCloseTo(2, 10);

      // Move 3 more - should stamp at distance 2 from start of this segment
      stampAlongStroke(
        { x: 3, y: 0 },
        { x: 6, y: 0 },
        5,
        (x, y) => stamps.push({ x, y }),
        state
      );
      expect(stamps).toHaveLength(2);
      // Stamp at x = 3 + 2 = 5
      expect(stamps[1].x).toBeCloseTo(5, 10);
    });
  });
});

// ─── expandDirtyRect ────────────────────────────────────────────────────────

describe("expandDirtyRect", () => {
  it("initializes rect from null", () => {
    const tracker = makeDirtyRect();
    expandDirtyRect(tracker, 10, 20, 5);
    expect(tracker.current).toEqual({
      minX: Math.floor(10 - 5),
      minY: Math.floor(20 - 5),
      maxX: Math.ceil(10 + 5),
      maxY: Math.ceil(20 + 5)
    });
  });

  it("sets exact values with integer inputs", () => {
    const tracker = makeDirtyRect();
    expandDirtyRect(tracker, 10, 20, 5);
    expect(tracker.current).toEqual({ minX: 5, minY: 15, maxX: 15, maxY: 25 });
  });

  it("expands existing rect to include new point", () => {
    const tracker = makeDirtyRect({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
    expandDirtyRect(tracker, 20, 20, 2);
    expect(tracker.current).toEqual({ minX: 5, minY: 5, maxX: 22, maxY: 22 });
  });

  it("does not shrink existing rect", () => {
    const tracker = makeDirtyRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expandDirtyRect(tracker, 50, 50, 1);
    expect(tracker.current).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it("handles fractional coordinates with floor/ceil", () => {
    const tracker = makeDirtyRect();
    expandDirtyRect(tracker, 5.7, 3.2, 2.5);
    expect(tracker.current).toEqual({
      minX: Math.floor(5.7 - 2.5),  // floor(3.2) = 3
      minY: Math.floor(3.2 - 2.5),  // floor(0.7) = 0
      maxX: Math.ceil(5.7 + 2.5),   // ceil(8.2) = 9
      maxY: Math.ceil(3.2 + 2.5)    // ceil(5.7) = 6
    });
  });

  it("handles negative coordinates", () => {
    const tracker = makeDirtyRect();
    expandDirtyRect(tracker, -5, -10, 3);
    expect(tracker.current).toEqual({
      minX: Math.floor(-8),
      minY: Math.floor(-13),
      maxX: Math.ceil(-2),
      maxY: Math.ceil(-7)
    });
  });

  it("handles zero padding", () => {
    const tracker = makeDirtyRect();
    expandDirtyRect(tracker, 10, 20, 0);
    expect(tracker.current).toEqual({ minX: 10, minY: 20, maxX: 10, maxY: 20 });
  });

  it("expands in all directions independently", () => {
    const tracker = makeDirtyRect({ minX: 10, minY: 10, maxX: 20, maxY: 20 });
    // Expand minX only
    expandDirtyRect(tracker, 5, 15, 2);
    expect(tracker.current!.minX).toBe(3);
    expect(tracker.current!.minY).toBe(10);
    expect(tracker.current!.maxX).toBe(20);
    expect(tracker.current!.maxY).toBe(20);
  });
});

// ─── expandDirtyRectFromPoints ──────────────────────────────────────────────

describe("expandDirtyRectFromPoints", () => {
  it("initializes rect from null using two points", () => {
    const tracker = makeDirtyRect();
    expandDirtyRectFromPoints(
      tracker,
      { x: 5, y: 10 },
      { x: 15, y: 20 },
      2
    );
    expect(tracker.current).toEqual({
      minX: Math.floor(5 - 2),    // 3
      minY: Math.floor(10 - 2),   // 8
      maxX: Math.ceil(15 + 2),    // 17
      maxY: Math.ceil(20 + 2)     // 22
    });
  });

  it("uses min/max of start and end coordinates", () => {
    const tracker = makeDirtyRect();
    expandDirtyRectFromPoints(
      tracker,
      { x: 20, y: 30 },
      { x: 5, y: 10 },
      1
    );
    expect(tracker.current).toEqual({
      minX: Math.floor(5 - 1),
      minY: Math.floor(10 - 1),
      maxX: Math.ceil(20 + 1),
      maxY: Math.ceil(30 + 1)
    });
  });

  it("expands existing rect", () => {
    const tracker = makeDirtyRect({ minX: 10, minY: 10, maxX: 20, maxY: 20 });
    expandDirtyRectFromPoints(
      tracker,
      { x: 5, y: 15 },
      { x: 25, y: 15 },
      1
    );
    expect(tracker.current).toEqual({
      minX: 4,   // min(10, floor(5-1))
      minY: 10,  // min(10, floor(15-1))=10
      maxX: 26,  // max(20, ceil(25+1))
      maxY: 20   // max(20, ceil(15+1))=20
    });
  });

  it("handles same start and end point", () => {
    const tracker = makeDirtyRect();
    expandDirtyRectFromPoints(
      tracker,
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      3
    );
    expect(tracker.current).toEqual({
      minX: 7,
      minY: 7,
      maxX: 13,
      maxY: 13
    });
  });

  it("handles fractional coordinates", () => {
    const tracker = makeDirtyRect();
    expandDirtyRectFromPoints(
      tracker,
      { x: 1.3, y: 2.7 },
      { x: 4.8, y: 0.1 },
      0.5
    );
    expect(tracker.current).toEqual({
      minX: Math.floor(1.3 - 0.5),   // floor(0.8) = 0
      minY: Math.floor(0.1 - 0.5),   // floor(-0.4) = -1
      maxX: Math.ceil(4.8 + 0.5),    // ceil(5.3) = 6
      maxY: Math.ceil(2.7 + 0.5)     // ceil(3.2) = 4
    });
  });
});

// ─── brushSettingsForEraserStroke ────────────────────────────────────────────

describe("brushSettingsForEraserStroke", () => {
  it("uses eraser size, not brush size", () => {
    const eraser = makeEraser({ size: 30 });
    const brush = makeBrush({ size: 10 });
    const result = brushSettingsForEraserStroke(eraser, brush);
    expect(result.size).toBe(30);
  });

  it("forces opacity to 1", () => {
    const eraser = makeEraser();
    const brush = makeBrush({ opacity: 0.5 });
    const result = brushSettingsForEraserStroke(eraser, brush);
    expect(result.opacity).toBe(1);
  });

  it("forces color to #000000", () => {
    const eraser = makeEraser();
    const brush = makeBrush({ color: "#ff0000" });
    const result = brushSettingsForEraserStroke(eraser, brush);
    expect(result.color).toBe("#000000");
  });

  it("preserves other brush settings", () => {
    const eraser = makeEraser({ size: 15 });
    const brush = makeBrush({
      hardness: 0.5,
      brushType: "soft",
      roundness: 0.7,
      angle: 45,
      pressureSensitivity: true,
      pressureAffects: "both",
      stabilizer: 0.3
    });
    const result = brushSettingsForEraserStroke(eraser, brush);
    expect(result.hardness).toBe(0.5);
    expect(result.brushType).toBe("soft");
    expect(result.roundness).toBe(0.7);
    expect(result.angle).toBe(45);
    expect(result.pressureSensitivity).toBe(true);
    expect(result.pressureAffects).toBe("both");
    expect(result.stabilizer).toBe(0.3);
  });
});

// ─── pencilSettingsForEraserStroke ───────────────────────────────────────────

describe("pencilSettingsForEraserStroke", () => {
  it("uses eraser size, not pencil size", () => {
    const eraser = makeEraser({ size: 25 });
    const pencil = makePencil({ size: 3 });
    const result = pencilSettingsForEraserStroke(eraser, pencil);
    expect(result.size).toBe(25);
  });

  it("forces opacity to 1", () => {
    const eraser = makeEraser();
    const pencil = makePencil({ opacity: 0.3 });
    const result = pencilSettingsForEraserStroke(eraser, pencil);
    expect(result.opacity).toBe(1);
  });

  it("forces color to #000000", () => {
    const eraser = makeEraser();
    const pencil = makePencil({ color: "#00ff00" });
    const result = pencilSettingsForEraserStroke(eraser, pencil);
    expect(result.color).toBe("#000000");
  });

  it("preserves other pencil settings", () => {
    const eraser = makeEraser({ size: 8 });
    const pencil = makePencil({
      pressureSensitivity: true,
      pressureAffects: "opacity",
      stabilizer: 0.6,
      pixelPerfect: true
    });
    const result = pencilSettingsForEraserStroke(eraser, pencil);
    expect(result.pressureSensitivity).toBe(true);
    expect(result.pressureAffects).toBe("opacity");
    expect(result.stabilizer).toBe(0.6);
    expect(result.pixelPerfect).toBe(true);
  });

  it("eraser settings override spread from pencil", () => {
    const eraser = makeEraser({ size: 50 });
    const pencil = makePencil({ size: 2, opacity: 0.7, color: "#abcdef" });
    const result = pencilSettingsForEraserStroke(eraser, pencil);
    // size, opacity, color are overwritten
    expect(result.size).toBe(50);
    expect(result.opacity).toBe(1);
    expect(result.color).toBe("#000000");
  });
});
