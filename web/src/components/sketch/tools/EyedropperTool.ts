/**
 * EyedropperTool – reads a pixel from the display canvas and dispatches an event.
 *
 * Extracted from usePointerHandlers handlePointerDown (~line 734-756).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export class EyedropperTool implements ToolHandler {
  readonly toolId = "eyedropper" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const displayCanvas = ctx.displayCanvasRef.current;
    if (!displayCanvas) {
      return;
    }
    const canvasCtx = displayCanvas.getContext("2d");
    if (!canvasCtx) {
      return;
    }
    const pt = event.point;
    const pixel = canvasCtx.getImageData(
      Math.round(pt.x),
      Math.round(pt.y),
      1,
      1
    ).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    ctx.containerRef.current?.dispatchEvent(
      new CustomEvent("sketch-eyedropper", {
        detail: { color: hex },
        bubbles: true
      })
    );
    return false;
  }
}
