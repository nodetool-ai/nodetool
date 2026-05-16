/**
 * Sketch Editor — LayerTransform Migration Boundary
 *
 * Single source of truth for converting *anything* (legacy persisted shape,
 * unknown blob from history restore, partial fixture in a test) into the
 * canonical discriminated union.
 *
 * Called at I/O boundaries:
 *   - `serialization/index.ts` deserialize → `normalizeLayerTransform`
 *   - `types/document.ts` `normalizeSketchDocument`
 *   - History restore (when reviving snapshots)
 *
 * Inside the app, code should never see the legacy shape. Always work with
 * the canonical union.
 */

import type {
  LayerTransform,
  Quad,
  SingleQuadMode
} from "./types";
import {
  IDENTITY_AFFINE,
  cloneQuad,
  makeAffineTransform,
  makeSingleQuadTransform
} from "./types";

const SINGLE_QUAD_MODES: ReadonlySet<string> = new Set<SingleQuadMode>([
  "distort",
  "skew",
  "perspective",
  "perspective-distort",
  "warp",
  "mesh-warp"
]);

function isQuadShape(value: unknown): value is Quad {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (p) =>
        p !== null &&
        typeof p === "object" &&
        Number.isFinite((p as { x?: unknown }).x) &&
        Number.isFinite((p as { y?: unknown }).y)
    )
  );
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Convert any legacy/unknown transform payload into the canonical union.
 *
 * Migration rules:
 *   - Already canonical → cloned, validated.
 *   - Legacy `kind: "dual-quad"` / `mode: "perspective-dual"` payloads →
 *     lossy downgrade to a single-quad perspective using the primary quad
 *     only (the secondary plane is dropped; users will have to re-edit).
 *   - Single-quad mode + valid quad → SingleQuadTransform.
 *   - Anything else → AffineTransform from any present TRS fields. Legacy
 *     `matrix`-only payloads are *not* preserved as matrices because the
 *     canonical affine kind has no matrix slot; the data is recovered from
 *     the decomposed `x/y/scaleX/scaleY/rotation` fields if present, else
 *     identity. This is acceptable because (a) bake resets transforms to
 *     identity and (b) round-tripping always wrote the decomposed fields.
 */
export function normalizeLayerTransform(raw: unknown): LayerTransform {
  if (!raw || typeof raw !== "object") {
    return { ...IDENTITY_AFFINE };
  }
  const t = raw as Record<string, unknown>;

  if (t.kind === "affine") {
    return makeAffineTransform({
      x: num(t.x, 0),
      y: num(t.y, 0),
      scaleX: num(t.scaleX, 1),
      scaleY: num(t.scaleY, 1),
      rotation: num(t.rotation, 0)
    });
  }

  // Lossy migration: legacy dual-quad payloads downgrade to a single-quad
  // perspective using the primary quad. The secondary plane cannot be
  // represented in the new canonical union and is discarded.
  if (
    (t.kind === "dual-quad" || t.mode === "perspective-dual") &&
    isQuadShape(t.quad)
  ) {
    return makeSingleQuadTransform("perspective", t.quad);
  }

  if (
    t.kind === "quad" &&
    typeof t.mode === "string" &&
    SINGLE_QUAD_MODES.has(t.mode) &&
    isQuadShape(t.quad)
  ) {
    return makeSingleQuadTransform(t.mode as SingleQuadMode, t.quad);
  }

  if (
    typeof t.mode === "string" &&
    SINGLE_QUAD_MODES.has(t.mode) &&
    isQuadShape(t.quad)
  ) {
    return makeSingleQuadTransform(t.mode as SingleQuadMode, t.quad);
  }

  return makeAffineTransform({
    x: num(t.x, 0),
    y: num(t.y, 0),
    scaleX: num(t.scaleX, 1),
    scaleY: num(t.scaleY, 1),
    rotation: num(t.rotation, 0)
  });
}

/** Validate and clone an already-canonical transform (defence against mutation). */
export function cloneAndValidateTransform(t: LayerTransform): LayerTransform {
  switch (t.kind) {
    case "affine":
      return { ...t };
    case "quad":
      return makeSingleQuadTransform(t.mode, t.quad);
  }
}

/** For tests / debugging — assert that a value is a canonical transform. */
export function assertCanonicalTransform(t: unknown): asserts t is LayerTransform {
  if (!t || typeof t !== "object") {
    throw new Error("LayerTransform: expected object");
  }
  const kind = (t as { kind?: unknown }).kind;
  if (kind !== "affine" && kind !== "quad") {
    throw new Error(`LayerTransform: unknown kind ${String(kind)}`);
  }
}

export { cloneQuad };
