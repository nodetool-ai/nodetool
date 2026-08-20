/**
 * Editor Shell Components
 *
 * Connected store-subscriber wrapper components extracted from SketchEditor.tsx.
 * Each component subscribes directly to the store slices it needs, keeping
 * the editor root focused on session orchestration rather than shell/store
 * subscriber wiring.
 *
 * ## Re-exported components
 * - ConnectedEditorActions
 * - ConnectedGeneratePopover
 * - ConnectedStatusBar
 * - ConnectedToolbar
 * - ConnectedToolTopBar
 * - ConnectedLayersPanel
 * - ConnectedCanvasSizePanel
 * - ConnectedContextMenu
 * - SketchCanvasPane
 */

export { ConnectedEditorActions } from "./ConnectedEditorActions";
export { ConnectedGeneratePopover } from "./ConnectedGeneratePopover";
export { ConnectedStatusBar } from "./ConnectedStatusBar";
export { ConnectedToolbar } from "./ConnectedToolbar";
export { ConnectedToolTopBar } from "./ConnectedToolTopBar";
export type { ConnectedToolTopBarProps } from "./ConnectedToolTopBar";
export { ConnectedLayersPanel } from "./ConnectedLayersPanel";
export type { ConnectedLayersPanelProps } from "./ConnectedLayersPanel";
export { ConnectedCanvasSizePanel } from "./ConnectedCanvasSizePanel";
export { ConnectedContextMenu } from "./ConnectedContextMenu";
export { SketchCanvasPane } from "./SketchCanvasPane";
