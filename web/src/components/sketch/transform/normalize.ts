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

import { normalizeLayerTransform as normalizeSharedLayerTransform } from "@nodetool-ai/image-editor/render.js";

import type { LayerTransform } from "./types";
import { cloneQuad } from "./types";

/**
 * Convert any legacy/unknown transform payload into the canonical union.
 *
 * Migration rules (shared with the headless renderer, so a legacy document
 * places its layers the same way in both):
 *   - Already canonical → cloned, validated.
 *   - Legacy `kind: "dual-quad"` / `mode: "perspective-dual"` payloads →
 *     lossy downgrade to a single-quad perspective using the primary quad
 *     only (the secondary plane is dropped; users will have to re-edit).
 *   - Single-quad mode + valid quad → SingleQuadTransform. Legacy `warp` and
 *     `perspective-distort` tags migrate to `distort` and `perspective`.
 *   - Anything else → AffineTransform from any present TRS fields. Legacy
 *     `matrix`-only payloads are *not* preserved as matrices because the
 *     canonical affine kind has no matrix slot; the data is recovered from
 *     the decomposed `x/y/scaleX/scaleY/rotation` fields if present, else
 *     identity. This is acceptable because (a) bake resets transforms to
 *     identity and (b) round-tripping always wrote the decomposed fields.
 */
export function normalizeLayerTransform(raw: unknown): LayerTransform {
  return normalizeSharedLayerTransform(raw);
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
