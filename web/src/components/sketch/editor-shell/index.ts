/**
 * Editor Shell Components
 *
 * Connected store-subscriber wrapper components extracted from SketchEditor.tsx.
 * Each component subscribes directly to the store slices it needs, keeping
 * the editor root focused on session orchestration rather than shell/store
 * subscriber wiring.
 *
 * ## Re-exported components
 * - ConnectedToolbar
 * - ConnectedToolTopBar
 * - ConnectedLayersPanel
 * - ConnectedContextMenu
 * - SketchCanvasPane
 */

export { ConnectedToolbar } from "./ConnectedToolbar";
export { ConnectedToolTopBar } from "./ConnectedToolTopBar";
export type { ConnectedToolTopBarProps } from "./ConnectedToolTopBar";
export { ConnectedLayersPanel } from "./ConnectedLayersPanel";
export type { ConnectedLayersPanelProps } from "./ConnectedLayersPanel";
export { ConnectedContextMenu } from "./ConnectedContextMenu";
export type { ConnectedContextMenuProps } from "./ConnectedContextMenu";
export { SketchCanvasPane } from "./SketchCanvasPane";
export type { SketchCanvasPaneProps } from "./SketchCanvasPane";
