/**
 * Registry-level smoke tests for the transform mode handlers.
 *
 * Pure math correctness for each gesture is covered by
 * `tools/transform/__tests__/...` and `__tests__/transformCorrectness.test.ts`;
 * this file only verifies registry wiring and metadata after the
 * Affinity-parity consolidation (Scale, Perspective, Mesh Warp, Deform —
 * with Skew kept as an internal-only mode driven by Ctrl+edge promotion).
 */

import {
  TRANSFORM_MODES,
  getTransformMode,
  getToolbarTransformModes,
  type ModeDragInput
} from "../index";
import type { Point, TransformMode } from "../../../types";
import { IDENTITY_AFFINE } from "../../../types";

const ALL_MODES: ReadonlyArray<TransformMode> = [
  "scale",
  "distort",
  "skew",
  "perspective",
  "mesh-warp"
];

const BOUNDS = { x: 0, y: 0, width: 100, height: 100 };
const CORNERS: [Point, Point, Point, Point] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
];

function makeInput(
  overrides: Partial<ModeDragInput> = {}
): ModeDragInput {
  return {
    dragStartCorners: CORNERS,
    dragStartTransform: { ...IDENTITY_AFFINE },
    dragStart: { x: 100, y: 0 },
    cursor: { x: 120, y: -10 },
    center: { x: 50, y: 50 },
    rasterBounds: BOUNDS,
    handle: "top-right",
    modifiers: { ctrlOrMeta: false, shift: false, alt: false },
    ...overrides
  };
}

describe("transform/modes registry", () => {
  it("every TransformMode resolves to a handler", () => {
    for (const id of ALL_MODES) {
      const handler = getTransformMode(id);
      expect(handler).toBeDefined();
      expect(handler.id).toBe(id);
    }
  });

  it("every handler exposes a non-empty visibleHandles list", () => {
    for (const id of ALL_MODES) {
      const handler = getTransformMode(id);
      expect(handler.visibleHandles.length).toBeGreaterThan(0);
    }
  });

  it("only scale supports rotate + pivot", () => {
    for (const id of ALL_MODES) {
      const handler = getTransformMode(id);
      if (id === "scale") {
        expect(handler.supportsRotate).toBe(true);
        expect(handler.supportsPivot).toBe(true);
      } else {
        expect(handler.supportsRotate).toBe(false);
        expect(handler.supportsPivot).toBe(false);
      }
    }
  });

  it("toolbar exposes scale and perspective; hides skew, distort, mesh-warp", () => {
    // Deform (`distort`) and Mesh Warp are hidden until their real Affinity
    // implementations (MLS anchors / Bezier grid) ship. Skew is reachable
    // via Ctrl/Cmd+edge promotion from scale, never as a standalone mode.
    const toolbar = getToolbarTransformModes().map((h) => h.id);
    expect(toolbar).toEqual(expect.arrayContaining(["scale", "perspective"]));
    expect(toolbar).not.toContain("skew");
    expect(toolbar).not.toContain("distort");
    expect(toolbar).not.toContain("mesh-warp");
  });

  it("non-scale corner drags produce a quad-kind transform", () => {
    const cornerHandle = "top-right" as const;
    const quadModes: ReadonlyArray<TransformMode> = [
      "distort",
      "perspective",
      "mesh-warp"
    ];
    for (const id of quadModes) {
      const handler = getTransformMode(id);
      const out = handler.applyDrag(makeInput({ handle: cornerHandle }));
      expect(out.kind).toBe("quad");
    }
  });

  it("skew on an edge handle produces a quad transform", () => {
    const out = TRANSFORM_MODES.skew.applyDrag(
      makeInput({ handle: "right" })
    );
    expect(out.kind).toBe("quad");
  });

  it("scale on a corner handle produces an affine transform", () => {
    const out = TRANSFORM_MODES.scale.applyDrag(
      makeInput({ handle: "top-right" })
    );
    expect(out.kind).toBe("affine");
  });

  it("mesh-warp shares free-corner math with distort but tags differently", () => {
    const input = makeInput({ handle: "top-right" });
    const distortOut = TRANSFORM_MODES.distort.applyDrag(input);
    const meshOut = TRANSFORM_MODES["mesh-warp"].applyDrag(input);
    expect(distortOut.kind).toBe("quad");
    expect(meshOut.kind).toBe("quad");
    if (distortOut.kind === "quad" && meshOut.kind === "quad") {
      expect(meshOut.quad).toEqual(distortOut.quad);
      expect(distortOut.mode).toBe("distort");
      expect(meshOut.mode).toBe("mesh-warp");
    }
  });
});
