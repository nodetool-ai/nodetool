/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  resolveTransformGestureMode,
  computeMoveTransform,
  computeRotateTransform,
  computeDistortTransform,
  computeTransformForHandle
} from "../computeTransform";
import {
  makeAffineTransform,
  makeSingleQuadTransform,
  isAffineTransform
} from "../../../types";
import type { TransformHandle } from "../handleGeometry";

// ─── Helpers ────────────────────────────────────────────────────────────────

const NO_MODIFIERS = { ctrlOrMeta: false, shift: false, alt: false };

function affine(
  overrides: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotation: number }> = {}
) {
  return makeAffineTransform(overrides);
}

// ─── resolveTransformGestureMode ────────────────────────────────────────────

describe("resolveTransformGestureMode", () => {
  describe("when baseMode is not 'scale'", () => {
    const nonScaleModes = ["distort", "skew", "perspective", "mesh-warp"] as const;

    it.each(nonScaleModes)(
      "returns '%s' unchanged regardless of modifiers or handle",
      (mode) => {
        expect(
          resolveTransformGestureMode(mode, "top-left", {
            ctrlOrMeta: true,
            shift: true,
            alt: true
          })
        ).toBe(mode);
      }
    );

    it("ignores handle type when baseMode is not scale", () => {
      expect(
        resolveTransformGestureMode("distort", "top", {
          ctrlOrMeta: true,
          shift: false,
          alt: false
        })
      ).toBe("distort");
    });
  });

  describe("when baseMode is 'scale'", () => {
    it("returns 'perspective' when ctrl+alt+shift are all held", () => {
      expect(
        resolveTransformGestureMode("scale", "top-left", {
          ctrlOrMeta: true,
          shift: true,
          alt: true
        })
      ).toBe("perspective");
    });

    it("returns 'perspective' for any handle when ctrl+alt+shift", () => {
      const handles: TransformHandle[] = [
        "top-left", "top-right", "bottom-left", "bottom-right",
        "top", "bottom", "left", "right", "move", "rotate"
      ];
      for (const h of handles) {
        expect(
          resolveTransformGestureMode("scale", h, {
            ctrlOrMeta: true,
            shift: true,
            alt: true
          })
        ).toBe("perspective");
      }
    });

    it("returns 'skew' when ctrl is held on an edge handle", () => {
      const edgeHandles: TransformHandle[] = ["top", "bottom", "left", "right"];
      for (const h of edgeHandles) {
        expect(
          resolveTransformGestureMode("scale", h, {
            ctrlOrMeta: true,
            shift: false,
            alt: false
          })
        ).toBe("skew");
      }
    });

    it("returns 'scale' when ctrl is held on a corner handle (not skew)", () => {
      const cornerHandles: TransformHandle[] = [
        "top-left", "top-right", "bottom-left", "bottom-right"
      ];
      for (const h of cornerHandles) {
        expect(
          resolveTransformGestureMode("scale", h, {
            ctrlOrMeta: true,
            shift: false,
            alt: false
          })
        ).toBe("scale");
      }
    });

    it("returns 'scale' when no modifiers are held", () => {
      expect(
        resolveTransformGestureMode("scale", "top-left", NO_MODIFIERS)
      ).toBe("scale");
    });

    it("returns 'scale' when only shift is held", () => {
      expect(
        resolveTransformGestureMode("scale", "top", {
          ctrlOrMeta: false,
          shift: true,
          alt: false
        })
      ).toBe("scale");
    });

    it("returns 'scale' when only alt is held", () => {
      expect(
        resolveTransformGestureMode("scale", "right", {
          ctrlOrMeta: false,
          shift: false,
          alt: true
        })
      ).toBe("scale");
    });

    it("returns 'skew' when ctrl+shift on edge (perspective requires alt too)", () => {
      expect(
        resolveTransformGestureMode("scale", "left", {
          ctrlOrMeta: true,
          shift: true,
          alt: false
        })
      ).toBe("skew");
    });

    it("returns 'skew' when ctrl+alt on edge (perspective requires shift too)", () => {
      expect(
        resolveTransformGestureMode("scale", "top", {
          ctrlOrMeta: true,
          shift: false,
          alt: true
        })
      ).toBe("skew");
    });

    it("returns 'scale' for move handle with no modifiers", () => {
      expect(
        resolveTransformGestureMode("scale", "move", NO_MODIFIERS)
      ).toBe("scale");
    });

    it("returns 'scale' for rotate handle with no modifiers", () => {
      expect(
        resolveTransformGestureMode("scale", "rotate", NO_MODIFIERS)
      ).toBe("scale");
    });

    it("returns 'scale' for ctrl on move handle (not edge)", () => {
      expect(
        resolveTransformGestureMode("scale", "move", {
          ctrlOrMeta: true,
          shift: false,
          alt: false
        })
      ).toBe("scale");
    });

    it("returns 'scale' for ctrl on rotate handle (not edge)", () => {
      expect(
        resolveTransformGestureMode("scale", "rotate", {
          ctrlOrMeta: true,
          shift: false,
          alt: false
        })
      ).toBe("scale");
    });
  });

  describe("priority: perspective wins over skew", () => {
    it("ctrl+alt+shift on edge handle returns perspective, not skew", () => {
      expect(
        resolveTransformGestureMode("scale", "top", {
          ctrlOrMeta: true,
          shift: true,
          alt: true
        })
      ).toBe("perspective");
    });
  });
});

// ─── computeMoveTransform ───────────────────────────────────────────────────

describe("computeMoveTransform", () => {
  describe("affine transforms", () => {
    it("translates by cursor delta", () => {
      const start = affine({ x: 100, y: 200 });
      const result = computeMoveTransform(
        start,
        { x: 10, y: 20 },
        { x: 30, y: 50 }
      );
      expect(isAffineTransform(result)).toBe(true);
      if (!isAffineTransform(result)) return;
      expect(result.x).toBe(120); // 100 + (30-10)
      expect(result.y).toBe(230); // 200 + (50-20)
    });

    it("preserves scaleX, scaleY, and rotation", () => {
      const start = affine({ x: 50, y: 50, scaleX: 2, scaleY: 3, rotation: 1.5 });
      const result = computeMoveTransform(
        start,
        { x: 0, y: 0 },
        { x: 10, y: 20 }
      );
      if (!isAffineTransform(result)) return;
      expect(result.scaleX).toBe(2);
      expect(result.scaleY).toBe(3);
      expect(result.rotation).toBe(1.5);
    });

    it("rounds position to nearest integer", () => {
      const start = affine({ x: 0, y: 0 });
      const result = computeMoveTransform(
        start,
        { x: 0, y: 0 },
        { x: 3.7, y: 4.2 }
      );
      if (!isAffineTransform(result)) return;
      expect(result.x).toBe(4); // Math.round(3.7)
      expect(result.y).toBe(4); // Math.round(4.2)
    });

    it("handles negative deltas", () => {
      const start = affine({ x: 50, y: 50 });
      const result = computeMoveTransform(
        start,
        { x: 20, y: 30 },
        { x: 5, y: 10 }
      );
      if (!isAffineTransform(result)) return;
      expect(result.x).toBe(35); // 50 + (5-20)
      expect(result.y).toBe(30); // 50 + (10-30)
    });

    it("returns identity position when delta is zero", () => {
      const start = affine({ x: 100, y: 200 });
      const result = computeMoveTransform(
        start,
        { x: 5, y: 5 },
        { x: 5, y: 5 }
      );
      if (!isAffineTransform(result)) return;
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("result has kind 'affine'", () => {
      const start = affine();
      const result = computeMoveTransform(
        start,
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      );
      expect(result.kind).toBe("affine");
    });
  });

  describe("quad transforms", () => {
    const quadCorners: readonly [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];

    it("translates all four corners by cursor delta", () => {
      const start = makeSingleQuadTransform("distort", quadCorners);
      const result = computeMoveTransform(
        start,
        { x: 10, y: 20 },
        { x: 30, y: 50 }
      );
      expect(result.kind).toBe("quad");
      if (result.kind !== "quad") return;
      // dx=20, dy=30
      expect(result.quad[0]).toEqual({ x: 20, y: 30 });
      expect(result.quad[1]).toEqual({ x: 120, y: 30 });
      expect(result.quad[2]).toEqual({ x: 120, y: 130 });
      expect(result.quad[3]).toEqual({ x: 20, y: 130 });
    });

    it("preserves the quad mode", () => {
      const start = makeSingleQuadTransform("perspective", quadCorners);
      const result = computeMoveTransform(
        start,
        { x: 0, y: 0 },
        { x: 5, y: 5 }
      );
      if (result.kind !== "quad") return;
      expect(result.mode).toBe("perspective");
    });

    it("handles negative deltas on quad", () => {
      const start = makeSingleQuadTransform("distort", quadCorners);
      const result = computeMoveTransform(
        start,
        { x: 50, y: 50 },
        { x: 30, y: 20 }
      );
      if (result.kind !== "quad") return;
      // dx=-20, dy=-30
      expect(result.quad[0]).toEqual({ x: -20, y: -30 });
      expect(result.quad[1]).toEqual({ x: 80, y: -30 });
    });

    it("does not round quad corners (only affine rounds)", () => {
      const start = makeSingleQuadTransform("distort", quadCorners);
      const result = computeMoveTransform(
        start,
        { x: 0, y: 0 },
        { x: 3.7, y: 4.2 }
      );
      if (result.kind !== "quad") return;
      expect(result.quad[0].x).toBeCloseTo(3.7);
      expect(result.quad[0].y).toBeCloseTo(4.2);
    });
  });
});

// ─── computeRotateTransform ─────────────────────────────────────────────────

describe("computeRotateTransform", () => {
  it("computes rotation delta from pivot", () => {
    // Drag from the right (angle=0) to the top (angle=-pi/2)
    const start = affine({ x: 0, y: 0, rotation: 0 });
    const pivot = { x: 0, y: 0 };
    const dragStart = { x: 100, y: 0 }; // angle = 0
    const cursor = { x: 0, y: -100 }; // angle = -pi/2

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, false
    );
    if (!isAffineTransform(result)) return;
    expect(result.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it("adds rotation delta to existing rotation", () => {
    const startRotation = Math.PI / 4; // 45 degrees
    const start = affine({ rotation: startRotation });
    const pivot = { x: 0, y: 0 };
    // Drag 90 degrees clockwise: from right to bottom
    const dragStart = { x: 100, y: 0 }; // angle = 0
    const cursor = { x: 0, y: 100 }; // angle = pi/2

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, false
    );
    if (!isAffineTransform(result)) return;
    // 45deg + 90deg = 135deg
    expect(result.rotation).toBeCloseTo(startRotation + Math.PI / 2);
  });

  it("snaps to 15-degree increments when shift is held", () => {
    const start = affine({ rotation: 0 });
    const pivot = { x: 0, y: 0 };
    const dragStart = { x: 100, y: 0 };
    // Rotate by ~20 degrees (0.349 rad) -- should snap to 15deg (pi/12)
    const angle = 20 * (Math.PI / 180);
    const cursor = {
      x: 100 * Math.cos(angle),
      y: 100 * Math.sin(angle)
    };

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, true
    );
    if (!isAffineTransform(result)) return;
    const snap15 = Math.PI / 12; // 15 degrees
    expect(result.rotation).toBeCloseTo(snap15);
  });

  it("snaps to 30 degrees when shift is held and angle is ~28 degrees", () => {
    const start = affine({ rotation: 0 });
    const pivot = { x: 0, y: 0 };
    const dragStart = { x: 100, y: 0 };
    const angle = 28 * (Math.PI / 180);
    const cursor = {
      x: 100 * Math.cos(angle),
      y: 100 * Math.sin(angle)
    };

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, true
    );
    if (!isAffineTransform(result)) return;
    const snap30 = Math.PI / 6; // 30 degrees
    expect(result.rotation).toBeCloseTo(snap30);
  });

  it("preserves position when no layerCenter is provided", () => {
    const start = affine({ x: 50, y: 75 });
    const pivot = { x: 0, y: 0 };
    const dragStart = { x: 100, y: 0 };
    const cursor = { x: 0, y: 100 };

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, false
    );
    if (!isAffineTransform(result)) return;
    expect(result.x).toBe(50);
    expect(result.y).toBe(75);
  });

  it("orbits layer around pivot when layerCenter is provided", () => {
    const start = affine({ x: 0, y: 0, rotation: 0 });
    const pivot = { x: 0, y: 0 };
    const layerCenter = { x: 100, y: 0 };
    // Rotate 90 degrees counterclockwise: layerCenter orbits to (0, -100)
    // atan2(0, 100)=0, atan2(-100, 0)=-pi/2 => delta=-pi/2
    const dragStart = { x: 100, y: 0 };
    const cursor = { x: 0, y: -100 };

    const result = computeRotateTransform(
      start, dragStart, cursor, pivot, false, layerCenter
    );
    if (!isAffineTransform(result)) return;
    // layerCenter (100,0) rotated -pi/2 around (0,0) => (0, -100)
    // offset = orbited - layerCenter = (0-100, -100-0) = (-100, -100)
    expect(result.x).toBe(Math.round(-100));
    expect(result.y).toBe(Math.round(-100));
  });

  it("returns clone for non-affine (quad) transforms", () => {
    const quadCorners: readonly [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const start = makeSingleQuadTransform("distort", quadCorners);
    const result = computeRotateTransform(
      start,
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      false
    );
    expect(result.kind).toBe("quad");
    if (result.kind !== "quad") return;
    // Corners should be unchanged (clone)
    expect(result.quad[0]).toEqual({ x: 0, y: 0 });
    expect(result.quad[1]).toEqual({ x: 100, y: 0 });
  });

  it("zero rotation when cursor equals dragStart", () => {
    const start = affine({ rotation: 0.5 });
    const pivot = { x: 50, y: 50 };
    const pos = { x: 100, y: 50 };

    const result = computeRotateTransform(
      start, pos, pos, pivot, false
    );
    if (!isAffineTransform(result)) return;
    expect(result.rotation).toBeCloseTo(0.5);
  });
});

// ─── computeDistortTransform ────────────────────────────────────────────────

describe("computeDistortTransform", () => {
  const startCorners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
  ] = [
    { x: 0, y: 0 },     // top-left
    { x: 100, y: 0 },   // top-right
    { x: 100, y: 100 }, // bottom-right
    { x: 0, y: 100 }    // bottom-left
  ];
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const baseTransform = affine();

  it("moves only the dragged corner", () => {
    const result = computeDistortTransform(
      startCorners,
      "top-left",
      { x: 0, y: 0 },
      { x: 10, y: 15 },
      bounds,
      false,
      baseTransform
    );
    expect(result.kind).toBe("quad");
    if (result.kind !== "quad") return;
    // top-left moved
    expect(result.quad[0]).toEqual({ x: 10, y: 15 });
    // other corners unchanged
    expect(result.quad[1]).toEqual({ x: 100, y: 0 });
    expect(result.quad[2]).toEqual({ x: 100, y: 100 });
    expect(result.quad[3]).toEqual({ x: 0, y: 100 });
  });

  it("moves the bottom-right corner correctly", () => {
    const result = computeDistortTransform(
      startCorners,
      "bottom-right",
      { x: 50, y: 50 },
      { x: 70, y: 80 },
      bounds,
      false,
      baseTransform
    );
    if (result.kind !== "quad") return;
    // dx=20, dy=30 applied to bottom-right
    expect(result.quad[2]).toEqual({ x: 120, y: 130 });
    // others unchanged
    expect(result.quad[0]).toEqual({ x: 0, y: 0 });
    expect(result.quad[1]).toEqual({ x: 100, y: 0 });
    expect(result.quad[3]).toEqual({ x: 0, y: 100 });
  });

  it("constrains to horizontal axis when dx > dy", () => {
    const result = computeDistortTransform(
      startCorners,
      "top-right",
      { x: 0, y: 0 },
      { x: 30, y: 10 },
      bounds,
      true,
      baseTransform
    );
    if (result.kind !== "quad") return;
    // constrain=true, |dx|=30 > |dy|=10 => dy zeroed
    expect(result.quad[1]).toEqual({ x: 130, y: 0 });
  });

  it("constrains to vertical axis when dy > dx", () => {
    const result = computeDistortTransform(
      startCorners,
      "bottom-left",
      { x: 0, y: 0 },
      { x: 5, y: 40 },
      bounds,
      true,
      baseTransform
    );
    if (result.kind !== "quad") return;
    // constrain=true, |dy|=40 > |dx|=5 => dx zeroed
    expect(result.quad[3]).toEqual({ x: 0, y: 140 });
  });

  it("returns distort mode in the quad transform", () => {
    const result = computeDistortTransform(
      startCorners,
      "top-left",
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      bounds,
      false,
      baseTransform
    );
    if (result.kind !== "quad") return;
    expect(result.mode).toBe("distort");
  });

  it("does not modify original corners array", () => {
    const corners: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ] = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 120 },
      { x: 10, y: 120 }
    ];
    computeDistortTransform(
      corners,
      "top-left",
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      bounds,
      false,
      baseTransform
    );
    expect(corners[0]).toEqual({ x: 10, y: 20 });
  });

  it("handles zero delta", () => {
    const result = computeDistortTransform(
      startCorners,
      "top-left",
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      bounds,
      false,
      baseTransform
    );
    if (result.kind !== "quad") return;
    expect(result.quad[0]).toEqual({ x: 0, y: 0 });
  });
});

// ─── computeTransformForHandle (dispatcher) ─────────────────────────────────

describe("computeTransformForHandle", () => {
  const center = { x: 50, y: 50 };
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it("dispatches 'move' to computeMoveTransform", () => {
    const start = affine({ x: 10, y: 20 });
    const result = computeTransformForHandle(
      "move",
      start,
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      center,
      bounds,
      false,
      false
    );
    if (!isAffineTransform(result)) return;
    expect(result.x).toBe(15);
    expect(result.y).toBe(30);
  });

  it("dispatches 'rotate' to computeRotateTransform", () => {
    const start = affine({ rotation: 0 });
    const pivot = { x: 0, y: 0 };
    const dragStart = { x: 100, y: 0 };
    const cursor = { x: 0, y: 100 };

    const result = computeTransformForHandle(
      "rotate",
      start,
      dragStart,
      cursor,
      pivot,
      bounds,
      false,
      false
    );
    if (!isAffineTransform(result)) return;
    expect(result.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("dispatches corner handles to computeScaleTransform", () => {
    const start = affine({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const result = computeTransformForHandle(
      "top-right",
      start,
      { x: 100, y: 0 },
      { x: 100, y: 0 }, // no movement
      center,
      bounds,
      false,
      false
    );
    if (!isAffineTransform(result)) return;
    // With no cursor movement, scale should remain ~1
    expect(result.scaleX).toBeCloseTo(1, 0);
    expect(result.scaleY).toBeCloseTo(1, 0);
  });

  it("dispatches edge handles to computeScaleTransform", () => {
    const start = affine({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const result = computeTransformForHandle(
      "right",
      start,
      { x: 100, y: 50 },
      { x: 100, y: 50 }, // no movement
      center,
      bounds,
      false,
      false
    );
    if (!isAffineTransform(result)) return;
    expect(result.scaleX).toBeCloseTo(1, 0);
  });
});
