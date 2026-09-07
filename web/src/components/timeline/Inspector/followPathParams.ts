/**
 * Turn a shape clip's geometry into `followPath` preset params.
 *
 * The `followPath` preset (`@nodetool-ai/timeline` animation catalog) takes
 * an authored SVG path (`d`, normalized 0..1) placed in a box
 * (`pathX`/`pathY`/`pathWidth`/`pathHeight`, also normalized 0..1). A shape
 * clip's `ClipShapeStyle` already describes geometry in that same normalized
 * space, so "Use shape clip" in the inspector reads its `x`/`y`/`width`/
 * `height` as the box directly and, for the two kinds that carry no `d` of
 * their own (`rect`, `ellipse`), synthesizes one — the same unit-square and
 * four-cubic-ellipse outline `buildShapeSegments` in
 * `packages/timeline/src/render/shapeGeometry.ts` draws, expressed in the
 * clip's own normalized 0..1 box instead of surface px. Only `M`/`L`/`C`/`Q`/
 * `Z` parse (`render/svgPath.ts`) — no `H`/`V` shorthand — so the rect is
 * written as four `L`s rather than `H`/`V`.
 *
 * `line`, `polygon` and `star` return `null`: a line has no closed outline to
 * place a box around the way `followPath` expects, and a polygon/star would
 * need its own vertex-to-path synthesis this op does not attempt (T9 only
 * covers the two shapes `shapeGeometry.ts` rasterizes without an authored
 * `d`, plus `path` itself).
 *
 * Pure: no store, DOM, or GPU access.
 */

import type { ClipShapeStyle } from "@nodetool-ai/timeline";

/**
 * `(4/3)·tan(π/8)`, the cubic-Bezier quarter-circle control-point offset (as a
 * fraction of the radius) `ellipseSegments` in `shapeGeometry.ts` also uses.
 */
const QUARTER_ARC_K = 0.5522847498307936;

/** A closed unit square: `M0,0 → L1,0 → L1,1 → L0,1 → Z`. */
const RECT_UNIT_D = "M0 0L1 0L1 1L0 1Z";

/**
 * An ellipse inscribed in the unit box (center 0.5,0.5, radius 0.5 on each
 * axis), as four cubics from its rightmost point — the same construction
 * `ellipseSegments` draws, in normalized 0..1 space.
 */
const ELLIPSE_UNIT_D = (() => {
  const k = QUARTER_ARC_K * 0.5;
  return [
    "M1 0.5",
    `C1 ${0.5 + k} ${0.5 + k} 1 0.5 1`,
    `C${0.5 - k} 1 0 ${0.5 + k} 0 0.5`,
    `C0 ${0.5 - k} ${0.5 - k} 0 0.5 0`,
    `C${0.5 + k} 0 1 ${0.5 - k} 1 0.5`,
    "Z"
  ].join(" ");
})();

export interface FollowPathParams {
  d: string;
  pathX: number;
  pathY: number;
  pathWidth: number;
  pathHeight: number;
}

/** `shapeBox`'s defaults in `shapeGeometry.ts`, for a style missing a field. */
const DEFAULT_BOX = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

/**
 * Resolve a shape clip's `ClipShapeStyle` into `followPath` params, or `null`
 * when the style is absent or names a kind with no single closed outline to
 * offer (`line`, `polygon`, `star`, or an unrecognized kind), or a `path`
 * whose `d` is empty.
 */
export function shapeClipToFollowPathParams(
  shapeStyle: ClipShapeStyle | undefined
): FollowPathParams | null {
  if (!shapeStyle) return null;
  const box = {
    pathX: shapeStyle.x ?? DEFAULT_BOX.x,
    pathY: shapeStyle.y ?? DEFAULT_BOX.y,
    pathWidth: shapeStyle.width ?? DEFAULT_BOX.width,
    pathHeight: shapeStyle.height ?? DEFAULT_BOX.height
  };
  if (shapeStyle.kind === "rect") return { d: RECT_UNIT_D, ...box };
  if (shapeStyle.kind === "ellipse") return { d: ELLIPSE_UNIT_D, ...box };
  if (shapeStyle.kind === "path") {
    const d = shapeStyle.d?.trim();
    if (!d) return null;
    return { d, ...box };
  }
  return null;
}
