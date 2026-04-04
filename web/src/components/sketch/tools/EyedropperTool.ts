/**
 * EyedropperTool – reads a pixel from the composite and dispatches an event.
 *
 * Uses getFullCompositeImageData when the display canvas uses a WebGPU context
 * that does not support getContext("2d").
 *
 * Also exports `sampleColorHex` so the dispatcher can delegate Alt+click
 * eyedropper sampling without duplicating the pixel readback logic.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point } from "../types";
import { rgbToHex } from "../types/geometry";
import ColorizeIcon from "@mui/icons-material/Colorize";

/**
 * Sample the composite color at a document-space point.
 *
 * Tries the display canvas 2D context first (fast path), then falls back to
 * full composite readback (required when the display canvas uses WebGPU).
 *
 * @returns A hex color string (e.g. "#ff0000") or null if sampling failed.
 */
export function sampleColorHex(ctx: ToolContext, docPoint: Point): string | null {
  const x = Math.round(docPoint.x);
  const y = Math.round(docPoint.y);

  // Fast path: display canvas 2D context
  const displayCanvas = ctx.displayCanvasRef.current;
  if (displayCanvas) {
    const canvasCtx = displayCanvas.getContext("2d", { willReadFrequently: true });
    if (
      canvasCtx &&
      x >= 0 && x < displayCanvas.width &&
      y >= 0 && y < displayCanvas.height
    ) {
      const pixel = canvasCtx.getImageData(x, y, 1, 1).data;
      return rgbToHex(pixel[0], pixel[1], pixel[2]);
    }
  }

  // Fallback: full composite readback (WebGPU path)
  const id = ctx.getFullCompositeImageData?.();
  if (id && x >= 0 && y >= 0 && x < id.width && y < id.height) {
    const i = (y * id.width + x) * 4;
    return rgbToHex(id.data[i], id.data[i + 1], id.data[i + 2]);
  }

  return null;
}

export class EyedropperTool implements ToolHandler {
  readonly toolId = "eyedropper" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const hex = sampleColorHex(ctx, event.point);
    if (hex) {
      ctx.containerRef.current?.dispatchEvent(
        new CustomEvent("sketch-eyedropper", {
          detail: { color: hex },
          bubbles: true
        })
      );
    }
    return false;
  }
}

export const definition: ToolDefinition = {
  tool: "eyedropper",
  label: "Eyedropper",
  shortcut: "I",
  Icon: ColorizeIcon,
  group: "painting"
};
