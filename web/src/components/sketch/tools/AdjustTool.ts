/**
 * AdjustTool – no-op tool handler for the adjustment panel.
 *
 * The adjustment workflow is entirely driven by the settings panel sliders
 * (brightness/contrast/saturation) rather than by canvas pointer events.
 * This handler exists so the factory does not fall through to the default
 * no-op and so the tool can be cleanly selected and deactivated.
 */

import type { ToolHandler, ToolContext } from "./types";

export class AdjustTool implements ToolHandler {
  readonly toolId = "adjust" as const;

  onActivate(_ctx: ToolContext): void {
    // Adjustment sliders are rendered via ToolSettingsPanels when tool === "adjust".
  }

  onDeactivate(_ctx: ToolContext): void {
    // Slider state and base snapshots are managed by useCanvasActions; nothing to do here.
  }
}
