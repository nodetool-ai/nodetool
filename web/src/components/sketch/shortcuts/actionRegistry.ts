export const SKETCH_ACTION_IDS = [
  // Edit
  "undo", "redo",
  "copy", "cut", "paste", "paste-masked",
  "free-transform", "repeat-transform", "repeat-transform-on-copy",
  "clear-layer", "fill-background", "fill-foreground",
  "invert-colors", "cancel-or-deselect",
  "nudge-up", "nudge-down", "nudge-left", "nudge-right",
  // Selection
  "select-all", "deselect", "reselect", "invert-selection",
  // Canvas
  "export-png", "zoom-fit", "zoom-100", "zoom-in", "zoom-out", "toggle-panels",
  "toggle-rulers", "toggle-guides", "toggle-snap",
  // Color
  "swap-colors", "reset-colors",
  // Paint
  "tool-size-decrease", "tool-size-increase",
  "tool-hardness-decrease", "tool-hardness-increase",
  "tool-opacity-preset",
  // Layers
  "layer-via-copy", "layer-via-cut",
  "layer-move-up", "layer-move-down",
  "blend-mode-prev", "blend-mode-next",
  "canvas-preset-prev", "canvas-preset-next",
  // Tools
  "tool-move", "tool-brush", "tool-pencil", "tool-eraser",
  "tool-fill", "tool-eyedropper", "tool-blur", "tool-clone-stamp",
  "tool-adjust", "tool-select-magic-wand", "tool-select-rect",
  "tool-crop", "tool-gradient", "tool-transform", "tool-shape",
  "tool-shape-line", "tool-shape-rect", "tool-shape-ellipse", "tool-shape-arrow",
  // Mode: Transform
  "transform-undo", "transform-redo", "transform-commit", "transform-cancel",
  "transform-reset",
  // Mode: Crop
  "crop-commit", "crop-cancel",
] as const;

export type SketchActionId = (typeof SKETCH_ACTION_IDS)[number];

export type DisplayGroup =
  | "Edit"
  | "Selection"
  | "Canvas"
  | "Color"
  | "Paint"
  | "Layers"
  | "Tools"
  | "Mode: Transform"
  | "Mode: Crop";

export interface ActionMeta {
  readonly id: SketchActionId;
  readonly label: string;
  readonly displayGroup: DisplayGroup;
}

export const ACTION_REGISTRY: readonly ActionMeta[] = [
  { id: "undo", label: "Undo", displayGroup: "Edit" },
  { id: "redo", label: "Redo", displayGroup: "Edit" },
  { id: "copy", label: "Copy", displayGroup: "Edit" },
  { id: "cut", label: "Cut", displayGroup: "Edit" },
  { id: "paste", label: "Paste", displayGroup: "Edit" },
  { id: "paste-masked", label: "Paste masked", displayGroup: "Edit" },
  { id: "free-transform", label: "Free transform", displayGroup: "Edit" },
  { id: "repeat-transform", label: "Repeat last transform", displayGroup: "Edit" },
  { id: "repeat-transform-on-copy", label: "Repeat transform on copy", displayGroup: "Edit" },
  { id: "clear-layer", label: "Clear layer", displayGroup: "Edit" },
  { id: "fill-background", label: "Fill with background color", displayGroup: "Edit" },
  { id: "fill-foreground", label: "Fill with foreground color", displayGroup: "Edit" },
  { id: "invert-colors", label: "Invert colors", displayGroup: "Edit" },
  { id: "cancel-or-deselect", label: "Cancel / deselect", displayGroup: "Edit" },
  { id: "nudge-up", label: "Nudge up", displayGroup: "Edit" },
  { id: "nudge-down", label: "Nudge down", displayGroup: "Edit" },
  { id: "nudge-left", label: "Nudge left", displayGroup: "Edit" },
  { id: "nudge-right", label: "Nudge right", displayGroup: "Edit" },
  { id: "select-all", label: "Select all", displayGroup: "Selection" },
  { id: "deselect", label: "Deselect", displayGroup: "Selection" },
  { id: "reselect", label: "Reselect", displayGroup: "Selection" },
  { id: "invert-selection", label: "Invert selection", displayGroup: "Selection" },
  { id: "export-png", label: "Export image", displayGroup: "Canvas" },
  { id: "zoom-fit", label: "Fit to screen", displayGroup: "Canvas" },
  { id: "zoom-100", label: "Zoom to 100%", displayGroup: "Canvas" },
  { id: "zoom-in", label: "Zoom in", displayGroup: "Canvas" },
  { id: "zoom-out", label: "Zoom out", displayGroup: "Canvas" },
  { id: "toggle-panels", label: "Toggle panels", displayGroup: "Canvas" },
  { id: "toggle-rulers", label: "Show / hide rulers", displayGroup: "Canvas" },
  { id: "toggle-guides", label: "Show / hide guides", displayGroup: "Canvas" },
  { id: "toggle-snap", label: "Snap on / off", displayGroup: "Canvas" },
  { id: "swap-colors", label: "Swap colors", displayGroup: "Color" },
  { id: "reset-colors", label: "Reset colors", displayGroup: "Color" },
  { id: "tool-size-decrease", label: "Decrease size", displayGroup: "Paint" },
  { id: "tool-size-increase", label: "Increase size", displayGroup: "Paint" },
  { id: "tool-hardness-decrease", label: "Decrease hardness", displayGroup: "Paint" },
  { id: "tool-hardness-increase", label: "Increase hardness", displayGroup: "Paint" },
  { id: "tool-opacity-preset", label: "Set Opacity (0–9)", displayGroup: "Paint" },
  { id: "layer-via-copy", label: "Layer via copy", displayGroup: "Layers" },
  { id: "layer-via-cut", label: "Layer via cut", displayGroup: "Layers" },
  { id: "layer-move-up", label: "Move layer up", displayGroup: "Layers" },
  { id: "layer-move-down", label: "Move layer down", displayGroup: "Layers" },
  { id: "blend-mode-prev", label: "Previous blend mode", displayGroup: "Layers" },
  { id: "blend-mode-next", label: "Next blend mode", displayGroup: "Layers" },
  { id: "canvas-preset-prev", label: "Previous canvas preset", displayGroup: "Layers" },
  { id: "canvas-preset-next", label: "Next canvas preset", displayGroup: "Layers" },
  { id: "tool-move", label: "Move", displayGroup: "Tools" },
  { id: "tool-brush", label: "Brush", displayGroup: "Tools" },
  { id: "tool-pencil", label: "Pencil", displayGroup: "Tools" },
  { id: "tool-eraser", label: "Eraser", displayGroup: "Tools" },
  { id: "tool-fill", label: "Fill", displayGroup: "Tools" },
  { id: "tool-eyedropper", label: "Color picker", displayGroup: "Tools" },
  { id: "tool-blur", label: "Blur", displayGroup: "Tools" },
  { id: "tool-clone-stamp", label: "Clone stamp", displayGroup: "Tools" },
  { id: "tool-adjust", label: "Adjustments", displayGroup: "Tools" },
  { id: "tool-select-magic-wand", label: "Magic wand select", displayGroup: "Tools" },
  { id: "tool-select-rect", label: "Rectangle select", displayGroup: "Tools" },
  { id: "tool-crop", label: "Crop", displayGroup: "Tools" },
  { id: "tool-gradient", label: "Gradient", displayGroup: "Tools" },
  { id: "tool-transform", label: "Transform", displayGroup: "Tools" },
  { id: "tool-shape", label: "Shape", displayGroup: "Tools" },
  { id: "tool-shape-line", label: "Line", displayGroup: "Tools" },
  { id: "tool-shape-rect", label: "Rectangle", displayGroup: "Tools" },
  { id: "tool-shape-ellipse", label: "Ellipse", displayGroup: "Tools" },
  { id: "tool-shape-arrow", label: "Arrow", displayGroup: "Tools" },
  { id: "transform-undo", label: "Undo transform", displayGroup: "Mode: Transform" },
  { id: "transform-redo", label: "Redo transform", displayGroup: "Mode: Transform" },
  { id: "transform-commit", label: "Commit transform", displayGroup: "Mode: Transform" },
  { id: "transform-cancel", label: "Cancel transform", displayGroup: "Mode: Transform" },
  { id: "transform-reset", label: "Reset transform box", displayGroup: "Mode: Transform" },
  { id: "crop-commit", label: "Commit crop", displayGroup: "Mode: Crop" },
  { id: "crop-cancel", label: "Cancel crop", displayGroup: "Mode: Crop" },
];

export const ACTION_MAP = new Map<SketchActionId, ActionMeta>(
  ACTION_REGISTRY.map((a) => [a.id, a])
);
