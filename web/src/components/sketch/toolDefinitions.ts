/**
 * Shared Tool Definitions
 *
 * Single source of truth for tool metadata used across SketchToolbar,
 * SketchCanvasContextMenu, and SketchToolTopBar.
 *
 * Adding or changing a tool should only require updating this file.
 */

import type { SvgIconProps } from "@mui/material/SvgIcon";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import BrushIcon from "@mui/icons-material/Brush";
import CreateIcon from "@mui/icons-material/Create";
import AutoFixNormalIcon from "@mui/icons-material/AutoFixNormal";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import ColorizeIcon from "@mui/icons-material/Colorize";
import CategoryIcon from "@mui/icons-material/Category";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GradientIcon from "@mui/icons-material/Gradient";
import CropIcon from "@mui/icons-material/Crop";
import TransformIcon from "@mui/icons-material/Transform";
import TuneIcon from "@mui/icons-material/Tune";
import type { SketchTool } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolIconComponent = React.ComponentType<SvgIconProps>;

export interface ToolDefinition {
  tool: SketchTool;
  label: string;
  shortcut?: string;
  Icon: ToolIconComponent;
  group: "painting" | "shape";
}

// ─── Definitions ──────────────────────────────────────────────────────────────

export const PAINTING_TOOLS: ToolDefinition[] = [
  { tool: "move", label: "Move", shortcut: "V", Icon: OpenWithIcon, group: "painting" },
  { tool: "transform", label: "Transform", shortcut: "F", Icon: TransformIcon, group: "painting" },
  { tool: "select", label: "Select", Icon: SelectAllIcon, group: "painting" },
  { tool: "brush", label: "Brush", shortcut: "B", Icon: BrushIcon, group: "painting" },
  { tool: "pencil", label: "Pencil", shortcut: "P", Icon: CreateIcon, group: "painting" },
  { tool: "eraser", label: "Eraser", shortcut: "E", Icon: AutoFixNormalIcon, group: "painting" },
  { tool: "fill", label: "Fill", shortcut: "G", Icon: FormatColorFillIcon, group: "painting" },
  { tool: "eyedropper", label: "Eyedropper", shortcut: "I", Icon: ColorizeIcon, group: "painting" },
  { tool: "blur", label: "Blur", shortcut: "Q", Icon: BlurOnIcon, group: "painting" },
  { tool: "clone_stamp", label: "Clone Stamp", shortcut: "S", Icon: ContentCopyIcon, group: "painting" }
];

export const SHAPE_TOOLS: ToolDefinition[] = [
  { tool: "shape", label: "Shape", shortcut: "U", Icon: CategoryIcon, group: "shape" },
  { tool: "gradient", label: "Gradient", shortcut: "T", Icon: GradientIcon, group: "shape" },
  { tool: "crop", label: "Crop", shortcut: "C", Icon: CropIcon, group: "shape" },
  { tool: "adjust", label: "Adjustments", shortcut: "J", Icon: TuneIcon, group: "shape" }
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
