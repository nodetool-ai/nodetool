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
import { buildSelectionOutsideStrokeMask } from "../selection";
import { useMenuHandler } from "../../../hooks/useIpcRenderer";
import type { MenuEventData } from "../../../window";
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

  /** While true, sketch editor keyboard shortcuts do not run (shortcuts overlay open). */
  suspendKeyboardShortcuts?: boolean;
}

export interface EditorCommandsResult {
  handleRunSegmentation: () => void;
  handleClearSegmentPrompts: () => void;
  handleFillSelectionWithForeground: () => void;
  handleStrokeSelectionWithForeground: () => void;
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
  handleUndo,
  handleRedo,
  canvasActions,
  layerActions,
  segmentation,
  canvasStore,
  colorStore,
  sessionStore,
  suspendKeyboardShortcuts
}: UseEditorCommandsParams): EditorCommandsResult {
  // ─── Segmentation bridge callbacks ─────────────────────────────────
  const handleRunSegmentation = useCallback(() => {
    const segmentSettings = useSketchStore.getState().document.toolSettings.segment;
    if (segmentSettings.promptMode === "auto") {
      void segmentation.splitSelectedLayer();
      return;
    }
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

  /**
   * Stroke the current selection: paint a `borderWidth`-wide ring of
   * pixels OUTSIDE the selection with the foreground color, leaving the
   * selection interior untouched. Pairs naturally with "Fill" to produce
   * a filled shape with an outer outline.
   *
   * Falls back to filling the whole layer when there is no active
   * selection (mirrors `handleFillSelectionWithForeground`).
   */
  const handleStrokeSelectionWithForeground = useCallback(() => {
    const state = useSketchStore.getState();
    const sel = state.selection;
    const fg = state.foregroundColor;
    if (!sel) {
      canvasActions.handleFillLayerWithColor(fg);
      return;
    }
    const ring = buildSelectionOutsideStrokeMask(
      sel,
      state.document.toolSettings.select.borderWidth
    );
    if (!ring) {
      return;
    }
    // Temporarily swap the selection to the outside-ring mask so the
    // existing `fillLayerBySelectionMask` path inside
    // `handleFillLayerWithColor` paints only the ring pixels. Restore
    // the original selection immediately so the rubberband/ants don't
    // visibly jump.
    state.setSelection(ring);
    try {
      canvasActions.handleFillLayerWithColor(fg);
    } finally {
      useSketchStore.getState().setSelection(sel);
    }
  }, [canvasActions]);

  const handleNewLayerFromContextMenu = useCallback((
    type: Extract<LayerType, "raster" | "mask"> = "raster"
  ) => {
    layerActions.handleAddLayer({ type });
  }, [layerActions]);

  /**
   * Materialize a layer canvas in the rendering runtime so the very next
   * `snapshotLayerCanvas` / paste call finds it. Without this, a layer
   * that was added in this same tick exists only in the Zustand store —
   * the runtime won't create its backing canvas until the next render
   * cycle reconciles the document, and `snapshotLayerCanvas` returns
   * `null` (the paste then silently bails and the new layer stays
   * empty). `setLayerData(id, null)` takes the synchronous
   * "no decoded image" branch in the runtime and creates a blank
   * doc-sized canvas immediately.
   */
  const ensureLayerCanvasMaterialized = useCallback(
    (layerId: string) => {
      canvasRef.current?.setLayerData(layerId, null);
    },
    [canvasRef]
  );

  /**
   * Photoshop-style Ctrl+V: paste the clipboard image into a new layer
   * centered on the cursor. Lives at the editor-commands level because it
   * needs both the clipboard plumbing (`canvasActions`) and the
   * add-layer action (`layerActions`).
   */
  const handlePasteAsNewLayer = useCallback(async () => {
    return canvasActions.handlePasteAsNewLayer(() =>
      layerActions.handleAddLayer()
    );
  }, [canvasActions, layerActions]);

  const handleLayerViaCopy = useCallback(async () => {
    canvasActions.handleCopy();
    const newLayerId = layerActions.handleAddLayer();
    ensureLayerCanvasMaterialized(newLayerId);
    await canvasActions.handlePaste(true, {
      targetLayerId: newLayerId,
      pasteAnchorDocument: null
    });
  }, [canvasActions, layerActions, ensureLayerCanvasMaterialized]);

  const handleLayerViaCut = useCallback(async () => {
    canvasActions.handleCut();
    const newLayerId = layerActions.handleAddLayer();
    ensureLayerCanvasMaterialized(newLayerId);
    await canvasActions.handlePaste(true, {
      targetLayerId: newLayerId,
      pasteAnchorDocument: null
    });
  }, [canvasActions, layerActions, ensureLayerCanvasMaterialized]);

  const handleFreeTransform = useCallback(() => {
    canvasActions.prepareSelectionFreeTransform?.();
    sessionStore.setActiveTool("transform" as SketchTool);
  }, [canvasActions, sessionStore]);

  // ─── Electron menu IPC interception ────────────────────────────────
  // Native menu accelerators (CmdOrCtrl+A, CmdOrCtrl+D) are consumed by the
  // OS before reaching the renderer's keydown handlers. When the sketch
  // editor is mounted, we route those menu events to sketch actions
  // (select-all / deselect) instead of the node-editor defaults.
  const handleSketchMenuEvent = useCallback(
    (data: MenuEventData) => {
      if (suspendKeyboardShortcuts) {
        return;
      }
      switch (data.type) {
        case "selectAll":
          useSketchStore.getState().selectAll();
          break;
        case "duplicate":
          // In sketch, Ctrl+D = deselect (Photoshop convention) rather
          // than the node-editor "duplicate".
          useSketchStore.getState().setSelection(null);
          break;
        default:
          break;
      }
    },
    [suspendKeyboardShortcuts]
  );
  useMenuHandler(handleSketchMenuEvent);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEditorKeyboardShortcuts({
    handleUndo,
    handleRedo,
    handleZoomIn: canvasActions.handleZoomIn,
    handleZoomOut: canvasActions.handleZoomOut,
    handleZoomFit: canvasActions.handleZoomFit,
    handleExportPng: canvasActions.handleExportPng,
    handleClearLayer: canvasActions.handleClearLayer,
    handleFillLayerWithColor: canvasActions.handleFillLayerWithColor,
    handleCopy: canvasActions.handleCopy,
    handleCut: canvasActions.handleCut,
    handlePaste: canvasActions.handlePaste,
    handlePasteAsNewLayer,
    handleNudgeLayer: canvasActions.handleNudgeLayer,
    syncSketchOutputsNow: canvasActions.syncSketchOutputsNow,
    setActiveTool: sessionStore.setActiveTool,
    setZoom: canvasStore.setZoom,
    setBrushSettings: colorStore.setBrushSettings,
    setPencilSettings: colorStore.setPencilSettings,
    setEraserSettings: colorStore.setEraserSettings,
    setShapeSettings: colorStore.setShapeSettings,
    setBlurSettings: colorStore.setBlurSettings,
    setCloneStampSettings: colorStore.setCloneStampSettings,
    setSelectSettings: colorStore.setSelectSettings,
    swapColors: colorStore.swapColors,
    resetColors: colorStore.resetColors,
    togglePanelsHidden: sessionStore.togglePanelsHidden,
    cancelActiveTool: () => canvasRef.current?.cancelActiveTool(),
    handleInvertLayerColors: canvasActions.handleInvertLayerColors,
    handleTransformCommit: canvasActions.handleTransformCommit,
    handleCropCommit: canvasActions.handleCropCommit,
    handleTransformCancel: canvasActions.handleTransformCancel,
    handleTransformReset: canvasActions.handleTransformReset,
    handleTransformUndo: canvasActions.handleTransformUndo,
    handleTransformRedo: canvasActions.handleTransformRedo,
    handleLayerViaCopy,
    handleLayerViaCut,
    handleMoveActiveLayer: layerActions.handleMoveActiveLayer,
    handleFreeTransform,
    handleRepeatLastTransform: canvasActions.handleRepeatLastTransform,
    handleRepeatLastTransformOnCopy:
      canvasActions.handleRepeatLastTransformOnCopy,
    suspendKeyboardShortcuts
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
    handleStrokeSelectionWithForeground,
    handleNewLayerFromContextMenu,
    handleLayerViaCopy,
    handleLayerViaCut,
    handleFreeTransform
  };
}
