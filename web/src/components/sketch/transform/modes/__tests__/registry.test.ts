/**
 * Registry-level smoke tests for the transform mode handlers.
 *
 * Pure math correctness for each gesture is covered by
 * `tools/transform/__tests__/...` and `__tests__/transformCorrectness.test.ts`;
 * this file only verifies registry wiring, metadata, and the alias contract.
 */

import {
  TRANSFORM_MODES,
  getTransformMode,
  getToolbarTransformModes,
  type ModeDragInput
} from "../index";
import { PerspectiveMode } from "../perspective";
import { WarpMode, MeshWarpMode } from "../warp";
import type { Point, TransformMode } from "../../../types";
import { IDENTITY_AFFINE } from "../../../types";

const ALL_MODES: ReadonlyArray<TransformMode> = [
  "scale",
  "distort",
  "skew",
  "perspective",
  "perspective-distort",
  "mesh-warp",
  "warp"
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

  it("toolbar list excludes mesh-warp but includes user-pickable modes", () => {
    const toolbar = getToolbarTransformModes().map((h) => h.id);
    expect(toolbar).toContain("scale");
    expect(toolbar).toContain("distort");
    expect(toolbar).toContain("skew");
    expect(toolbar).toContain("perspective");
    expect(toolbar).toContain("perspective-distort");
    expect(toolbar).toContain("warp");
    expect(toolbar).not.toContain("mesh-warp");
  });

  it("non-scale corner drags produce a quad-kind transform", () => {
    const cornerHandle = "top-right" as const;
    const quadModes: ReadonlyArray<TransformMode> = [
      "distort",
      "perspective",
      "perspective-distort",
      "warp",
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

  it("mesh-warp aliases the warp gesture (corner math is the warp math)", () => {
    const input = makeInput({ handle: "top-right" });
    const warpOut = WarpMode.applyDrag(input);
    const meshOut = MeshWarpMode.applyDrag(input);
    expect(warpOut.kind).toBe("quad");
    expect(meshOut.kind).toBe("quad");
    if (warpOut.kind === "quad" && meshOut.kind === "quad") {
      // Same geometry, different mode tag.
      expect(meshOut.quad).toEqual(warpOut.quad);
      expect(meshOut.mode).toBe("mesh-warp");
      expect(warpOut.mode).toBe("warp");
    }
  });

  it("perspective-distort aliases perspective with a distinct tag", () => {
    const input = makeInput({ handle: "top-right" });
    const baseOut = PerspectiveMode.applyDrag(input);
    const distortOut = TRANSFORM_MODES["perspective-distort"].applyDrag(input);
    expect(baseOut.kind).toBe("quad");
    expect(distortOut.kind).toBe("quad");
    if (baseOut.kind === "quad" && distortOut.kind === "quad") {
      expect(distortOut.quad).toEqual(baseOut.quad);
      expect(baseOut.mode).toBe("perspective");
      expect(distortOut.mode).toBe("perspective-distort");
    }
  });
});
