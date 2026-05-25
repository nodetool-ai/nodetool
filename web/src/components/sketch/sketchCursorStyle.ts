/**
 * CSS cursor strings for the sketch canvas, keyed by the effective interaction tool.
 * Shared by presentation, pointer handlers, and transform hover feedback.
 */

import type { SketchTool } from "./types";

export function cursorStyleForTool(interactionTool: SketchTool): string {
  if (interactionTool === "move" || interactionTool === "transform") {
    return "move";
  }
  if (
    interactionTool === "crop" ||
    interactionTool === "select" ||
    interactionTool === "eyedropper"
  ) {
    return "crosshair";
  }
  if (
    interactionTool === "brush" ||
    interactionTool === "pencil" ||
    interactionTool === "eraser" ||
    interactionTool === "blur"
  ) {
    return "none";
  }
  return "crosshair";
}
