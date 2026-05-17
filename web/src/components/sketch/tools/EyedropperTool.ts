/**
 * EyedropperTool – reads a pixel from the composite and dispatches an event.
 *
 * Uses `sampleCompositeColor` from the shared sampling contract so
 * display-only chrome (checkerboard background) never leaks into
 * the sampled result. This is the same readback path used by magic wand,
 * clone-stamp source preview, and any future readback helpers.
 *
 * Also exports `sampleColorHex` so the dispatcher can delegate Alt+click
 * color-picker sampling without duplicating the pixel readback logic.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point } from "../types";
import { sampleCompositeColor } from "../painting/sampleDocument";
import ColorizeIcon from "@mui/icons-material/Colorize";

/**
 * Sample the composite color at a document-space point.
 *
 * Delegates to the shared `sampleCompositeColor` utility which always
 * uses `readbackComposite` (no checkerboard, no border, no display chrome).
 *
 * @returns A hex color string (e.g. "#ff0000") or null if sampling failed.
 */
export function sampleColorHex(ctx: ToolContext, docPoint: Point): string | null {
  return sampleCompositeColor(ctx, docPoint);
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
  label: "Color Picker",
  Icon: ColorizeIcon,
  group: "painting"
};
