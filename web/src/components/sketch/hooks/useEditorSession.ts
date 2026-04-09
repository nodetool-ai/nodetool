/**
 * useEditorSession
 *
 * Dedicated session layer that owns all transient editor-session state so
 * future tools stop extending multiple session seams at once.
 *
 * ## What belongs here
 * - Canvas ref (the single imperative handle for the SketchCanvas instance)
 * - Store action bundles (history, layer, canvas, color, session)
 * - Narrow store selectors needed by the editor root (document, activeTool, transientMove)
 * - Interaction tool derivation (spring-loaded move)
 * - Live toolSettings ref (for autosave without dependency on slider changes)
 * - Flush-before-undo ref wiring
 * - Composed action hooks (history, layer, canvas, color, segmentation)
 * - Editor lifecycle (bootstrap, autosave, tool transitions, resize-handle preference)
 *
 * ## What stays out
 * - Command wiring (keyboard shortcuts, context-menu callbacks) → useEditorCommands
 * - Shell subscriber components (ConnectedToolbar, etc.) → editor-shell/
 * - Transform display/action model → useTransformAdapter
 */

import { useCallback, useMemo, useRef } from "react";
import { useSketchStore } from "../state";
import type { SketchDocument, SketchTool } from "../types";
import type { SketchCanvasRef } from "../SketchCanvas";
import {
  useHistoryActions,
  useLayerActions,
  useCanvasActions,
  useColorActions,
  useSegmentation,
  useEditorLifecycle,
  useHistoryStoreActions,
  useLayerStoreActions,
  useCanvasStoreActions,
  useColorStoreActions,
  useSessionStoreActions
} from "./index";

export interface UseEditorSessionParams {
  initialDocument?: SketchDocument;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useEditorSession({
  initialDocument,
  onDocumentChange,
  onExportImage,
  onExportMask
}: UseEditorSessionParams) {
  // ─── Canvas ref ─────────────────────────────────────────────────────
  const canvasRef = useRef<SketchCanvasRef>(null);

  // ─── Store action bundles ───────────────────────────────────────────
  const historyStore = useHistoryStoreActions();
  const layerStore = useLayerStoreActions();
  const canvasStore = useCanvasStoreActions();
  const colorStore = useColorStoreActions();
  const sessionStore = useSessionStoreActions();

  // ─── Narrow store selectors ─────────────────────────────────────────
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  const transientMoveModifierHeld = useSketchStore(
    (s) => s.transientMoveModifierHeld
  );

  const interactionTool = useMemo<SketchTool>(
    () =>
      transientMoveModifierHeld && activeTool !== "move"
        ? "move"
        : activeTool,
    [transientMoveModifierHeld, activeTool]
  );

  // ─── Live toolSettings ref (for autosave) ──────────────────────────
  const liveToolSettings = useSketchStore((s) => s.toolSettings);
  const liveToolSettingsRef = useRef(liveToolSettings);
  liveToolSettingsRef.current = liveToolSettings;

  // ─── Flush-before-undo ref ─────────────────────────────────────────
  const flushBeforeUndoRef = useRef<() => void>(() => {});

  // ─── History actions ────────────────────────────────────────────────
  const { handleUndo, handleRedo } = useHistoryActions({
    canvasRef,
    undo: historyStore.undo,
    redo: historyStore.redo,
    flushBeforeUndo: useCallback(() => flushBeforeUndoRef.current(), [])
  });

  // ─── Layer actions ──────────────────────────────────────────────────
  const layerActions = useLayerActions({
    canvasRef,
    document,
    pushHistory: historyStore.pushHistory,
    addLayer: layerStore.addLayer,
    removeLayer: layerStore.removeLayer,
    duplicateLayer: layerStore.duplicateLayer,
    reorderLayers: layerStore.reorderLayers,
    toggleLayerVisibility: layerStore.toggleLayerVisibility,
    setLayerOpacity: layerStore.setLayerOpacity,
    setLayerBlendMode: layerStore.setLayerBlendMode,
    renameLayer: layerStore.renameLayer,
    updateLayerData: layerStore.updateLayerData,
    setMaskLayer: layerStore.setMaskLayer,
    toggleAlphaLock: layerStore.toggleAlphaLock,
    toggleLayerExposedInput: layerStore.toggleLayerExposedInput,
    toggleLayerExposedOutput: layerStore.toggleLayerExposedOutput,
    mergeLayerDown: layerStore.mergeLayerDown,
    flattenVisible: layerStore.flattenVisible,
    addGroup: layerStore.addGroup,
    toggleGroupCollapsed: layerStore.toggleGroupCollapsed,
    moveLayerToGroup: layerStore.moveLayerToGroup,
    ungroupLayer: layerStore.ungroupLayer,
    groupLayers: layerStore.groupLayers
  });

  // ─── Canvas actions ─────────────────────────────────────────────────
  const canvasActions = useCanvasActions({
    canvasRef,
    document,
    activeTool,
    interactionTool,
    pushHistory: historyStore.pushHistory,
    updateLayerData: layerStore.updateLayerData,
    offsetLayerTransform: layerStore.offsetLayerTransform,
    commitLayerTransform: layerStore.commitLayerTransform,
    setLayerTransform: layerStore.setLayerTransform,
    setLayerContentBounds: layerStore.setLayerContentBounds,
    setDocument: sessionStore.setDocument,
    setZoom: canvasStore.setZoom,
    setPan: canvasStore.setPan,
    resizeCanvas: canvasStore.resizeCanvas,
    offsetAllPaintLayersTransform: canvasStore.offsetAllPaintLayersTransform,
    onExportImage,
    onExportMask
  });

  // Wire up flush-before-undo now that canvasActions is available
  flushBeforeUndoRef.current = canvasActions.flushPendingCanvasSync;

  // ─── Color actions ──────────────────────────────────────────────────
  const colorActions = useColorActions({
    activeTool,
    setForegroundColor: colorStore.setForegroundColor,
    setBrushSettings: colorStore.setBrushSettings,
    setPencilSettings: colorStore.setPencilSettings,
    setEraserSettings: colorStore.setEraserSettings,
    setFillSettings: colorStore.setFillSettings,
    setBlurSettings: colorStore.setBlurSettings,
    setCloneStampSettings: colorStore.setCloneStampSettings,
    setShapeSettings: colorStore.setShapeSettings,
    setGradientSettings: colorStore.setGradientSettings
  });

  // ─── Segmentation ──────────────────────────────────────────────────
  const segmentation = useSegmentation({
    canvasRef,
    pushHistory: historyStore.pushHistory
  });

  // ─── Editor lifecycle ──────────────────────────────────────────────
  const {
    canvasReady,
    initialDocumentRef,
    canvasResizeHandlesEnabled,
    handleCanvasResizeHandlesEnabledChange
  } = useEditorLifecycle({
    initialDocument,
    onDocumentChange,
    setDocument: sessionStore.setDocument,
    activeTool,
    document,
    canvasActions,
    segmentation,
    liveToolSettingsRef
  });

  return {
    // Refs
    canvasRef,

    // Store bundles
    historyStore,
    layerStore,
    canvasStore,
    colorStore,
    sessionStore,

    // Narrow state
    document,
    activeTool,
    interactionTool,

    // Composed actions
    handleUndo,
    handleRedo,
    layerActions,
    canvasActions,
    colorActions,
    segmentation,

    // Lifecycle
    canvasReady,
    initialDocumentRef,
    canvasResizeHandlesEnabled,
    handleCanvasResizeHandlesEnabledChange
  };
}
