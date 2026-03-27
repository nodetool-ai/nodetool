/**
 * Sketch tool handlers – barrel export and factory.
 *
 * Each tool class implements the ToolHandler interface from ./types.
 * The `getToolHandler` factory returns the correct handler for a given tool,
 * caching instances so state (e.g. last stroke end for Shift+click) persists.
 */

import type { SketchTool } from "../types";
import { isShapeTool } from "../types";
import type { ToolHandler } from "./types";

export type {
  ToolHandler,
  ToolContext,
  ToolPointerEvent,
  StrokeEndOptions
} from "./types";

export { EyedropperTool } from "./EyedropperTool";
export { MoveTool } from "./MoveTool";
export { TransformTool } from "./TransformTool";
export { FillTool } from "./FillTool";
export { ShapeTool } from "./ShapeTool";
export { GradientTool } from "./GradientTool";
export { CropTool } from "./CropTool";
export { SelectTool } from "./SelectTool";
export { BrushTool } from "./BrushTool";
export { PencilTool } from "./PencilTool";
export { EraserTool } from "./EraserTool";
export { BlurTool } from "./BlurTool";
export { CloneStampTool } from "./CloneStampTool";
export { AdjustTool } from "./AdjustTool";

import { EyedropperTool } from "./EyedropperTool";
import { MoveTool } from "./MoveTool";
import { TransformTool } from "./TransformTool";
import { FillTool } from "./FillTool";
import { ShapeTool } from "./ShapeTool";
import { GradientTool } from "./GradientTool";
import { CropTool } from "./CropTool";
import { SelectTool } from "./SelectTool";
import { BrushTool } from "./BrushTool";
import { PencilTool } from "./PencilTool";
import { EraserTool } from "./EraserTool";
import { BlurTool } from "./BlurTool";
import { CloneStampTool } from "./CloneStampTool";
import { AdjustTool } from "./AdjustTool";

// ─── Singleton tool handler cache ─────────────────────────────────────────────

const toolHandlerCache = new Map<string, ToolHandler>();

/**
 * Returns the ToolHandler instance for the given tool.
 * Instances are cached so mutable state (like lastStrokeEnd) persists
 * across pointer events within a single editor session.
 */
export function getToolHandler(tool: SketchTool): ToolHandler {
  // Shape tools share a single ShapeTool instance
  const key = isShapeTool(tool) ? "shape" : tool;

  let handler = toolHandlerCache.get(key);
  if (handler) {
    return handler;
  }

  switch (key) {
    case "eyedropper":
      handler = new EyedropperTool();
      break;
    case "move":
      handler = new MoveTool();
      break;
    case "transform":
      handler = new TransformTool();
      break;
    case "fill":
      handler = new FillTool();
      break;
    case "shape":
      handler = new ShapeTool();
      break;
    case "gradient":
      handler = new GradientTool();
      break;
    case "crop":
      handler = new CropTool();
      break;
    case "select":
      handler = new SelectTool();
      break;
    case "brush":
      handler = new BrushTool();
      break;
    case "pencil":
      handler = new PencilTool();
      break;
    case "eraser":
      handler = new EraserTool();
      break;
    case "blur":
      handler = new BlurTool();
      break;
    case "clone_stamp":
      handler = new CloneStampTool();
      break;
    case "adjust":
      handler = new AdjustTool();
      break;
    default:
      // Fallback: return a no-op handler
      handler = { toolId: tool };
      break;
  }

  toolHandlerCache.set(key, handler);
  return handler;
}
