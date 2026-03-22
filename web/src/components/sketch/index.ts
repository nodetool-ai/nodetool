/**
 * Sketch Editor Module
 *
 * Public API for the sketch editor. All external consumers
 * should import from this index file.
 */

export { default as SketchEditor } from "./SketchEditor";
export { default as SketchModal } from "./SketchModal";
export { default as SketchCanvas } from "./SketchCanvas";
export { default as SketchToolbar } from "./SketchToolbar";
export { default as SketchToolTopBar } from "./SketchToolTopBar";
export { default as SketchLayersPanel } from "./SketchLayersPanel";

export { useSketchStore } from "./state";

export {
  useSketchStoreSelectors,
  useHistoryActions,
  useLayerActions,
  useCanvasActions,
  useColorActions
} from "./hooks";

export { useCollapsedSections } from "./useCollapsedSections";

export {
  ALL_TOOL_DEFINITIONS,
  PAINTING_TOOLS,
  SHAPE_TOOLS,
  CONTEXT_MENU_TOOLS,
  getToolDefinition
} from "./toolDefinitions";

export type {
  ToolDefinition,
  ToolIconComponent
} from "./toolDefinitions";

export type {
  SketchDocument,
  SketchTool,
  ShapeToolType,
  Layer,
  LayerType,
  BlendMode,
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  ToolSettings,
  Point,
  Size,
  Color,
  ColorMode,
  Selection,
  HistoryEntry,
  SketchEditorState
} from "./types";

export type {
  CanvasPreset
} from "./types";

export {
  SKETCH_FORMAT_VERSION,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_SWATCHES,
  CANVAS_PRESETS,
  createDefaultDocument,
  createDefaultLayer,
  generateLayerId,
  isShapeTool,
  isPaintingTool,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  MAX_HISTORY_SIZE
} from "./types";

export {
  serializeDocument,
  deserializeDocument,
  flattenDocument,
  exportMask,
  canvasToDataUrl,
  canvasToBlob,
  loadImageToLayerData,
  loadImageWithDimensions
} from "./serialization";

export type {
  ImageLoadResult
} from "./serialization";
