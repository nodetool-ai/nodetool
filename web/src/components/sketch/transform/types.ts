/**
 * Sketch Editor — Layer Transform (canonical types)
 *
 * Discriminated union: every `LayerTransform` is *exactly* one of three kinds.
 * Renderers, gizmo painter, hit-tester, gesture handlers all `switch (t.kind)`
 * — TypeScript refuses code that forgets a case.
 *
 * Why a union and not a single struct?
 *   The previous shape carried optional `matrix`, `quad`, `mode`,
 *   `scaleX/Y`, `rotation` fields on every transform. Every consumer had to
 *   re-derive which fields were valid for which gesture, and they drifted.
 *   That class of bug is unrepresentable here.
 *
 * Why no `matrix` field?
 *   Affine transforms expose decomposed TRS values (translate/rotate/scale).
 *   The renderer composes the 3×3 matrix on demand via `affineToMatrix`.
 *   Storing both meant they could disagree.
 *
 * Why a `mode` tag on quad transforms?
 *   The pixel-level rasterization is the same for every single-quad mode
 *   (`drawImageToQuad`). The tag exists so the gizmo can offer the correct
 *   re-edit affordances (skew constraints, mesh handles, perspective ring).
 *   It is not consulted by any renderer or bake path.
 */

import type { Point } from "../types/geometry";

// ─── Core Types ───────────────────────────────────────────────────────────────

export type Quad = readonly [Point, Point, Point, Point];

/** TRS — translate, then rotate, then scale around the layer's raster origin. */
export interface AffineTransform {
  readonly kind: "affine";
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Radians. */
  readonly rotation: number;
}

/**
 * Single-quad gesture modes. All render via `drawImageToQuad`; the tag only
 * affects the gizmo affordances.
 *
 * - `distort`     — independent corners, no constraints.
 * - `skew`        — opposite edges remain parallel.
 * - `perspective` — projective transform from a unit rect.
 * - `perspective-distort` — manual projective straightening.
 * - `warp`        — bezier-style edges (currently rendered as straight).
 * - `mesh-warp`   — control mesh (UI not yet implemented; aliases warp).
 */
export type SingleQuadMode =
  | "distort"
  | "skew"
  | "perspective"
  | "perspective-distort"
  | "warp"
  | "mesh-warp";

export interface SingleQuadTransform {
  readonly kind: "quad";
  readonly mode: SingleQuadMode;
  /** Document-space corners: top-left, top-right, bottom-right, bottom-left. */
  readonly quad: Quad;
}

export type QuadTransform = SingleQuadTransform;
export type LayerTransform = AffineTransform | QuadTransform;

/**
 * The mode tag for any transform. Affine transforms have no mode (they're
 * the pure TRS path). Convenient for the toolbar / settings panel, which
 * wants a single string to display.
 */
export type LayerTransformModeTag = "affine" | SingleQuadMode;

// ─── Constants ────────────────────────────────────────────────────────────────

export const IDENTITY_AFFINE: AffineTransform = {
  kind: "affine",
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0
};

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isAffineTransform(t: LayerTransform): t is AffineTransform {
  return t.kind === "affine";
}

export function isSingleQuadTransform(t: LayerTransform): t is SingleQuadTransform {
  return t.kind === "quad";
}

export function isQuadTransform(t: LayerTransform): t is QuadTransform {
  return t.kind === "quad";
}

/** True when the transform produces no visual change. */
export function isIdentityTransform(t: LayerTransform): boolean {
  return (
    t.kind === "affine" &&
    t.x === 0 &&
    t.y === 0 &&
    t.scaleX === 1 &&
    t.scaleY === 1 &&
    t.rotation === 0
  );
}

/** Mode tag suitable for UI display / serialization. */
export function transformModeTag(t: LayerTransform): LayerTransformModeTag {
  return t.kind === "affine" ? "affine" : t.mode;
}

// ─── Constructors ─────────────────────────────────────────────────────────────

export function makeAffineTransform(opts: Partial<Omit<AffineTransform, "kind">> = {}): AffineTransform {
  return {
    kind: "affine",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    scaleX: opts.scaleX ?? 1,
    scaleY: opts.scaleY ?? 1,
    rotation: opts.rotation ?? 0
  };
}

export function makeSingleQuadTransform(mode: SingleQuadMode, quad: Quad): SingleQuadTransform {
  return { kind: "quad", mode, quad: cloneQuad(quad) };
}

export function cloneQuad(q: Quad): Quad {
  return [
    { x: q[0].x, y: q[0].y },
    { x: q[1].x, y: q[1].y },
    { x: q[2].x, y: q[2].y },
    { x: q[3].x, y: q[3].y }
  ];
}

export function cloneTransform(t: LayerTransform): LayerTransform {
  switch (t.kind) {
    case "affine":
      return { ...t };
    case "quad":
      return { kind: "quad", mode: t.mode, quad: cloneQuad(t.quad) };
  }
}
