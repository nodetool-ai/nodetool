/**
 * useEditorCommands
 *
 * Editor command-surface hook that centralizes keyboard-shortcut wiring,
 * context-menu action callbacks, segmentation bridge callbacks, free-transform
 * entry, and imperative modal actions. These were previously assembled inline
 * in `SketchEditor.tsx`.
 *
 * ## What it owns
 * - Keyboard shortcut wiring (delegates to `useEditorKeyboardShortcuts`)
 * - Context-menu action callbacks (fill with foreground, new layer, layer
 *   via copy/cut, free-transform)
 * - Segmentation bridge callbacks (run segmentation, clear prompts)
 * - Imperative handle creation (undo, redo, clear, export, flip, merge, etc.)
 *
 * ## What stays out
 * - Session state (canvasRef, store bundles, lifecycle) → useEditorSession
 * - Transform display/action model → useTransformAdapter
 * - Shell subscriber components → editor-shell/
 */

import { useCallback, useImperativeHandle } from "react";
import type { RefObject } from "react";
import type { LayerType, SketchDocument, SketchTool } from "../types";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { SketchEditorHandle } from "../SketchEditor";
import { useEditorKeyboardShortcuts } from "../useEditorKeyboardShortcuts";
import { getToolHandler } from "../tools";
import type { SegmentTool } from "../tools/SegmentTool";
import { useSketchStore } from "../state";
import type { useCanvasActions } from "./useCanvasActions";
import type { useLayerActions } from "./useLayerActions";
import type { useColorActions } from "./useColorActions";
import type { useSegmentation } from "./useSegmentation";
import type { useCanvasStoreActions, useColorStoreActions, useSessionStoreActions } from "./useEditorStoreActions";

export interface UseEditorCommandsParams {
  /** Forwarded ref from SketchEditor for imperative handle. */
  editorRef: RefObject<SketchEditorHandle | null>;

  canvasRef: RefObject<SketchCanvasRef | null>;
  initialDocumentRef: RefObject<SketchDocument | undefined>;
  document: SketchDocument;

  handleUndo: () => void;
  handleRedo: () => void;
  canvasActions: ReturnType<typeof useCanvasActions>;
  layerActions: ReturnType<typeof useLayerActions>;
  colorActions: ReturnType<typeof useColorActions>;
  segmentation: ReturnType<typeof useSegmentation>;

  canvasStore: ReturnType<typeof useCanvasStoreActions>;
  colorStore: ReturnType<typeof useColorStoreActions>;
  sessionStore: ReturnType<typeof useSessionStoreActions>;
}

export interface EditorCommandsResult {
  handleRunSegmentation: () => void;
  handleClearSegmentPrompts: () => void;
  handleFillSelectionWithForeground: () => void;
  handleNewLayerFromContextMenu: (
    type?: Extract<LayerType, "raster" | "mask">
  ) => void;
  handleLayerViaCopy: () => Promise<void>;
  handleLayerViaCut: () => Promise<void>;
  handleFreeTransform: () => void;
}

export function useEditorCommands({
  editorRef,
  canvasRef,
  initialDocumentRef,
  document,
  handleUndo,
  handleRedo,
  canvasActions,
  layerActions,
  colorActions,
  segmentation,
  canvasStore,
  colorStore,
  sessionStore
}: UseEditorCommandsParams): EditorCommandsResult {
  // ─── Segmentation bridge callbacks ─────────────────────────────────
  const handleRunSegmentation = useCallback(() => {
    const handler = getToolHandler("segment") as SegmentTool;
    segmentation.runSegmentation(
      [...handler.getPointPrompts()],
      handler.getBoxPrompt()
    );
  }, [segmentation]);

  const handleClearSegmentPrompts = useCallback(() => {
    const handler = getToolHandler("segment") as SegmentTool;
    handler.clearPrompts();
  }, []);

  // ─── Context-menu action callbacks ─────────────────────────────────
  const handleFillSelectionWithForeground = useCallback(() => {
    const fg = useSketchStore.getState().foregroundColor;
    canvasActions.handleFillLayerWithColor(fg);
  }, [canvasActions]);

  const handleNewLayerFromContextMenu = useCallback((
    type: Extract<LayerType, "raster" | "mask"> = "raster"
  ) => {
    layerActions.handleAddLayer({ type });
  }, [layerActions]);

  const handleLayerViaCopy = useCallback(async () => {
    canvasActions.handleCopy();
    const newLayerId = layerActions.handleAddLayer();
    await canvasActions.handlePaste(true, {
      targetLayerId: newLayerId,
      pasteAnchorDocument: null
    });
  }, [canvasActions, layerActions]);

  const handleLayerViaCut = useCallback(async () => {
    canvasActions.handleCut();
    const newLayerId = layerActions.handleAddLayer();
    await canvasActions.handlePaste(true, {
      targetLayerId: newLayerId,
      pasteAnchorDocument: null
    });
  }, [canvasActions, layerActions]);

  const handleFreeTransform = useCallback(() => {
    canvasActions.prepareSelectionFreeTransform?.();
    sessionStore.setActiveTool("transform" as SketchTool);
  }, [canvasActions, sessionStore]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEditorKeyboardShortcuts({
    handleUndo,
    handleRedo,
    handleZoomIn: canvasActions.handleZoomIn,
    handleZoomOut: canvasActions.handleZoomOut,
    handleZoomReset: canvasActions.handleZoomReset,
    handleExportPng: canvasActions.handleExportPng,
    handleClearLayer: canvasActions.handleClearLayer,
    handleFillLayerWithColor: canvasActions.handleFillLayerWithColor,
    handleCopy: canvasActions.handleCopy,
    handleCut: canvasActions.handleCut,
    handlePaste: canvasActions.handlePaste,
    handleNudgeLayer: canvasActions.handleNudgeLayer,
    syncSketchOutputsNow: canvasActions.syncSketchOutputsNow,
    setActiveTool: sessionStore.setActiveTool,
    setZoom: canvasStore.setZoom,
    setMirrorX: canvasStore.setMirrorX,
    setMirrorY: canvasStore.setMirrorY,
    setBrushSettings: colorStore.setBrushSettings,
    setPencilSettings: colorStore.setPencilSettings,
    setEraserSettings: colorStore.setEraserSettings,
    setShapeSettings: colorStore.setShapeSettings,
    setBlurSettings: colorStore.setBlurSettings,
    setCloneStampSettings: colorStore.setCloneStampSettings,
    swapColors: colorStore.swapColors,
    resetColors: colorStore.resetColors,
    togglePanelsHidden: sessionStore.togglePanelsHidden,
    cancelActiveTool: () => canvasRef.current?.cancelActiveTool(),
    handleInvertLayerColors: canvasActions.handleInvertLayerColors,
    handleTransformCommit: canvasActions.handleTransformCommit,
    handleTransformCancel: canvasActions.handleTransformCancel,
    handleTransformUndo: canvasActions.handleTransformUndo,
    handleTransformRedo: canvasActions.handleTransformRedo,
    handleLayerViaCopy,
    handleLayerViaCut,
    handleFreeTransform
  });

  // ─── Imperative handle ─────────────────────────────────────────────
  useImperativeHandle(
    editorRef,
    () => ({
      undo: handleUndo,
      redo: handleRedo,
      clearLayer: canvasActions.handleClearLayer,
      exportPng: canvasActions.handleExportPng,
      flipHorizontal: layerActions.handleFlipHorizontal,
      flipVertical: layerActions.handleFlipVertical,
      mergeDown: layerActions.handleMergeDown,
      flattenVisible: layerActions.handleFlattenVisible,
      flushPendingChanges: canvasActions.flushPendingCanvasSync,
      discardToInitial: () => {
        const doc = initialDocumentRef.current;
        if (!doc) {
          return;
        }
        sessionStore.setDocument(doc);
        if (canvasRef.current) {
          for (const layer of doc.layers) {
            canvasRef.current.setLayerData(layer.id, layer.data ?? null);
          }
        }
      }
    }),
    [handleUndo, handleRedo, canvasActions, layerActions, sessionStore, initialDocumentRef, canvasRef]
  );

  return {
    handleRunSegmentation,
    handleClearSegmentPrompts,
    handleFillSelectionWithForeground,
    handleNewLayerFromContextMenu,
    handleLayerViaCopy,
    handleLayerViaCut,
    handleFreeTransform
  };
}
