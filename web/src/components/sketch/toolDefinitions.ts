/**
 * Shared Tool Definitions
 *
 * Single source of truth for tool metadata used across SketchToolbar,
 * SketchCanvasContextMenu, and SketchToolTopBar.
 *
 * Each tool file exports its own `definition` object. This module
 * assembles them into the canonical lists and lookup helpers.
 * Adding a new tool only requires creating a single tool file with
 * a `definition` export.
 */

import type { SketchTool } from "./types";
import type { ToolDefinition, ToolIconComponent } from "./tools/types";

export type { ToolDefinition, ToolIconComponent };

// ─── Import definitions from individual tool files ────────────────────────

import { definition as moveDef } from "./tools/MoveTool";
import { definition as transformDef } from "./tools/TransformTool";
import { definition as selectDef } from "./tools/SelectTool";
import { definition as brushDef } from "./tools/BrushTool";
import { definition as pencilDef } from "./tools/PencilTool";
import { definition as eraserDef } from "./tools/EraserTool";
import { definition as fillDef } from "./tools/FillTool";
import { definition as eyedropperDef } from "./tools/EyedropperTool";
import { definition as blurDef } from "./tools/BlurTool";
import { definition as cloneStampDef } from "./tools/CloneStampTool";
import { definition as shapeDef } from "./tools/ShapeTool";
import { definition as gradientDef } from "./tools/GradientTool";
import { definition as cropDef } from "./tools/CropTool";
import { definition as adjustDef } from "./tools/AdjustTool";
import { definition as segmentDef } from "./tools/SegmentTool";

// ─── Definitions ──────────────────────────────────────────────────────────────

export const PAINTING_TOOLS: ToolDefinition[] = [
  moveDef,
  transformDef,
  selectDef,
  brushDef,
  pencilDef,
  eraserDef,
  fillDef,
  eyedropperDef,
  blurDef,
  cloneStampDef
];

export const SHAPE_TOOLS: ToolDefinition[] = [
  shapeDef,
  gradientDef,
  cropDef,
  adjustDef,
  segmentDef
];

export const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  ...PAINTING_TOOLS,
  ...SHAPE_TOOLS
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

const toolMap = new Map<SketchTool, ToolDefinition>(
  ALL_TOOL_DEFINITIONS.map((d) => [d.tool, d])
);

export function getToolDefinition(tool: SketchTool): ToolDefinition {
  return toolMap.get(tool) ?? PAINTING_TOOLS[0];
}

// Context menu excludes "adjust" since it has no quick controls
export const CONTEXT_MENU_TOOLS: ToolDefinition[] = ALL_TOOL_DEFINITIONS.filter(
  (d) => d.tool !== "adjust"
);
