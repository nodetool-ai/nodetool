/**
 * EyedropperTool – reads a pixel from the composite and dispatches an event.
 *
 * Uses getFullCompositeImageData when the display canvas uses a WebGPU context
 * that does not support getContext("2d").
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import ColorizeIcon from "@mui/icons-material/Colorize";

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export class EyedropperTool implements ToolHandler {
  readonly toolId = "eyedropper" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const pt = event.point;
    const x = Math.round(pt.x);
    const y = Math.round(pt.y);

    // Try display canvas 2D context first
    const displayCanvas = ctx.displayCanvasRef.current;
    if (displayCanvas) {
      const canvasCtx = displayCanvas.getContext("2d", { willReadFrequently: true });
      if (
        canvasCtx &&
        x >= 0 && x < displayCanvas.width &&
        y >= 0 && y < displayCanvas.height
      ) {
        const pixel = canvasCtx.getImageData(x, y, 1, 1).data;
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

    // Fallback: full composite readback (WebGPU path)
    const id = ctx.getFullCompositeImageData?.();
    if (id && x >= 0 && y >= 0 && x < id.width && y < id.height) {
      const i = (y * id.width + x) * 4;
      const hex = rgbToHex(id.data[i], id.data[i + 1], id.data[i + 2]);
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
