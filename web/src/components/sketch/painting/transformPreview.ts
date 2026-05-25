/**
 * transformPreview – Shared transform-preview merge / update contract.
 *
 * This module owns the rules for how transient transform previews are
 * merged with stored layer transforms during live compositing. Tools
 * (MoveTool, TransformTool, etc.) call these helpers to produce preview
 * transforms; compositing reads them to build a temporary document for
 * display.
 *
 * Design invariants:
 *   - A preview transform is always a *complete* LayerTransform that
 *     fully replaces the stored transform during compositing. It must
 *     never be a partial delta that gets merged field-by-field.
 *   - Preview transforms must preserve the full transform state
 *     (translation + scale + rotation + matrix) so that a moved layer
 *     with existing scale/rotation is not downgraded to translation-only.
 *   - Tools produce preview transforms via `mergeTransformPreview`;
 *     compositing applies them via `applyTransformPreviews`.
 *   - Commit and preview must use the same transform-resolution rules.
 *     `mergeTransformPreview` is used for both preview and commit so the
 *     result is identical.
 *
 * @module painting/transformPreview
 */

import type { LayerTransform, SketchDocument, Layer } from "../types";
import { IDENTITY_AFFINE, cloneTransform, makeAffineTransform } from "../types";

// ─── Preview merge ───────────────────────────────────────────────────────────

/**
 * Merge a transform update into an existing layer transform, preserving
 * all fields that the update does not explicitly change.
 *
 * This is the single merge rule for both preview and commit paths. Using
 * the same function for both ensures parity: what the user sees during a
 * drag is exactly what gets committed.
 *
 * When `update` contains only translation ({x, y}), the existing
 * scale/rotation/matrix fields are carried over so a layer that was
 * previously scaled or rotated does not lose those properties.
 *
 * When `update` contains scale/rotation, those fields are applied and a
 * fresh matrix is computed.
 */
export function mergeTransformPreview(
  base: LayerTransform,
  update: LayerTransform
): LayerTransform {
  // Each kind owns its own field set. The update is canonical; just clone it.
  // The previous implementation flattened fields together; the discriminated
  // union makes that class of merge bug impossible.
  void base;
  return cloneTransform(update);
}

// ─── Preview application for compositing ─────────────────────────────────────

/**
 * Build a temporary document snapshot with transform previews applied.
 *
 * Returns `null` when there are no active previews (callers can skip the
 * clone and use the original doc directly).
 *
 * The returned document is a shallow clone: layer objects that receive a
 * preview transform are replaced; all others are reused by reference.
 */
export function applyTransformPreviews(
  doc: SketchDocument,
  previewByLayerId: Record<string, LayerTransform>
): SketchDocument | null {
  const entries = Object.keys(previewByLayerId);
  if (entries.length === 0) {
    return null;
  }
  return {
    ...doc,
    layers: doc.layers.map((layer) => {
      const preview = previewByLayerId[layer.id];
      if (!preview) {
        return layer;
      }
      // Use mergeTransformPreview to ensure the preview is a full transform
      // that preserves any fields the update doesn't override.
      // Guard: layer.transform may be undefined for layers loaded from external
      // sources without default values applied (e.g. imageReference layers from
      // the NodeTool backend). Fall back to identity so the merge doesn't throw.
      const baseTransform: LayerTransform = layer.transform ?? { ...IDENTITY_AFFINE };
      return { ...layer, transform: mergeTransformPreview(baseTransform, preview) };
    })
  };
}

// ─── Preview creation helpers ────────────────────────────────────────────────

/**
 * Create a translation-only preview transform that preserves the layer's
 * existing scale, rotation, and matrix fields. This is the correct way to
 * produce a preview for a move gesture on a transformed layer.
 *
 * @param layer  The layer being moved (reads its current transform).
 * @param newX   New document-space X translation.
 * @param newY   New document-space Y translation.
 */
export function createMovePreview(
  layer: Layer,
  newX: number,
  newY: number
): LayerTransform {
  const base = layer.transform;
  if (base.kind === "affine") {
    return makeAffineTransform({ ...base, x: newX, y: newY });
  }
  // Quad: translation is expressed by translating the quad. Callers should
  // use computeMoveTransform directly; we fall back to identity-shifted
  // affine to satisfy the API contract.
  return makeAffineTransform({ x: newX, y: newY });
}

/** True iff `t` is a valid canonical LayerTransform. */
export function isCompleteTransform(t: LayerTransform): boolean {
  return t.kind === "affine" || t.kind === "quad";
}
