/**
 * useToolChromeActions
 *
 * Shared store subscriptions and action wiring for tool-chrome components
 * (ConnectedToolTopBar and ConnectedContextMenu). Both components need
 * nearly identical tool-settings setters and selection actions; this hook
 * centralizes those subscriptions so they are defined once.
 *
 * ## What is shared
 * - All per-tool settings setters (brush, pencil, eraser, shape, fill, blur,
 *   gradient, cloneStamp, select, segment)
 * - Selection actions (invert, feather, smooth, border outline)
 *
 * ## What stays in connected components
 * - Component-specific state (panelsHidden in TopBar, colors/canUndo in ContextMenu)
 * - Props-passed callbacks (adjust, transform, segmentation)
 */

import { useSketchStore } from "../state";

export function useToolChromeActions() {
  // Per-tool settings setters
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore((s) => s.setCloneStampSettings);
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const setSegmentSettings = useSketchStore((s) => s.setSegmentSettings);

  // Selection actions
  const invertSelection = useSketchStore((s) => s.invertSelection);
  const featherCurrentSelection = useSketchStore(
    (s) => s.featherCurrentSelection
  );
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const convertSelectionToBorderOutline = useSketchStore(
    (s) => s.convertSelectionToBorderOutline
  );

  const setTransformSettings = useSketchStore(
    (s) => s.setTransformSettings
  );

  const setMoveSettings = useSketchStore(
    (s) => s.setMoveSettings
  );

  return {
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setShapeSettings,
    setFillSettings,
    setBlurSettings,
    setGradientSettings,
    setCloneStampSettings,
    setSelectSettings,
    setSegmentSettings,
    setMoveSettings,
    setTransformSettings,
    invertSelection,
    featherCurrentSelection,
    smoothCurrentSelectionBorders,
    convertSelectionToBorderOutline
  };
}
