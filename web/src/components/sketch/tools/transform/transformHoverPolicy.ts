/**
 * transformHoverPolicy – cursor feedback helper for transform-style tools.
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
