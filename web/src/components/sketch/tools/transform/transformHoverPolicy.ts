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
import { cursorStyleForTool } from "../../sketchCursorStyle";

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
