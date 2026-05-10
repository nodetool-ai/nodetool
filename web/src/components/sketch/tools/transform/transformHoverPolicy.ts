/**
 * transformHoverPolicy – Hover hit-test and cursor management for TransformTool.
 *
 * Separates hover/cursor concerns from the drag interaction in
 * TransformTool.ts. The policy knows how to:
 *   - hit-test handles against a document-space point
 *   - map handle type + rotation to a CSS cursor
 *   - determine if a point is inside the bounding box
 *
 * This module does NOT own any drag state or transform preview state.
 *
 * @module tools/transform/transformHoverPolicy
 */

import type { ToolContext } from "../types";
import type { Point, LayerTransform, LayerContentBounds } from "../../types";
import { cursorStyleForTool } from "../../sketchCursorStyle";
import type { TransformHandle } from "./handleGeometry";
import { hitTestHandles, isInRotateZone } from "./handleGeometry";
import { cursorForHandle } from "./cursorMapping";

/**
 * Hit-test transform handles and return cursor + handle info for a given
 * document-space point. Includes the outside-box rotate zone: if the point
 * misses all handles and the box interior but falls within the rotate
 * margin, handle is reported as `"rotate"`.
 *
 * @returns Object with `handle` (which handle, or null) and `cursor` (CSS cursor, or null).
 */
export function getTransformHoverInfo(
  docPoint: Point,
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  zoom: number
): { handle: TransformHandle | null; cursor: string | null } {
  const handle = hitTestHandles(transform, rasterBounds, docPoint, zoom);
  const rot = transform.rotation ?? 0;
  if (handle) {
    return { handle, cursor: cursorForHandle(handle, rot) };
  }
  // Check the outside-box rotate zone
  if (isInRotateZone(transform, rasterBounds, docPoint, zoom)) {
    return { handle: "rotate", cursor: cursorForHandle("rotate", rot) };
  }
  return { handle: null, cursor: null };
}

/**
 * Test whether a document-space point falls inside the transform bounding box
 * (any handle or the interior "move" zone).
 */
export function isPointInsideGizmo(
  docPoint: Point,
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  zoom: number
): boolean {
  const handle = hitTestHandles(transform, rasterBounds, docPoint, zoom);
  return handle !== null;
}

/**
 * Apply cursor feedback on the sketch container (direct `style.cursor`).
 * Prefer wiring hover through {@link ToolContext.setTransformHoverCursor} for
 * the Transform tool so the presentation layer stays in sync with React.
 */
export function applyCursorFeedback(
  ctx: ToolContext,
  cursor: string | null
): void {
  const el = ctx.containerRef.current;
  if (el) {
    el.style.cursor = cursor ?? cursorStyleForTool(ctx.activeTool);
  }
}
