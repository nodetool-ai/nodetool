import type { SketchTool } from "../types";

export function getToolSettingsLabel(tool: SketchTool): string {
  switch (tool) {
    case "brush":
      return "Brush";
    case "pencil":
      return "Pencil";
    case "eraser":
      return "Eraser";
    case "fill":
      return "Fill";
    case "blur":
      return "Blur Brush";
    case "gradient":
      return "Gradient";
    case "crop":
      return "Crop";
    case "select":
      return "Selection";
    case "adjust":
      return "Adjustments";
    case "segment":
      return "Segment";
    case "shape":
      return "Shape";
    case "transform":
      return "Transform";
    case "move":
      return "Move";
    case "eyedropper":
      return "Color Picker";
    case "clone_stamp":
      return "Clone Stamp";
    default:
      return "Settings";
  }
}
