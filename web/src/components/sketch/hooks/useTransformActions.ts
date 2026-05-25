/**
 * useTransformActions
 *
 * Handles transform lifecycle (save/commit/cancel/reset), layer nudge,
 * baking layer transforms into document-space pixels, and in-transform
 * undo/redo plus quick transform operations (rotate, flip).
 */

import { useCallback, useRef, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import { getToolHandler } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import {
  IDENTITY_AFFINE,
  cloneTransform,
  isAffineTransform,
  layerAllowsTransformWhilePixelLocked,
  makeAffineTransform,
  type LayerContentBounds,
  type LayerTransform,
  type Point,
  type PushHistoryOptions,
  type SketchDocument
} from "../types";
import { deserializeLayerData, getLayerDataFromCanvas } from "../rendering/canvas2d/layerIO";
import { reconcileLayerToDocumentSpace } from "../rendering/canvas2d/reconcile";
import { getCanvasRasterBounds } from "../transform/geometry/layerGeometry";
import { useSketchStore } from "../state";
import { resolveTransformTargetLayerIds } from "../tools/transformTargetSet";
import { cloneSelectionMask, selectionHasAnyPixels } from "../selection";
import {
  compositeSelectionOverBase,
  prepareSelectionFreeTransformCanvases,
  transformSelectionMask
} from "../selection/selectionFreeTransform";

export interface UseTransformActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  offsetLayerTransform: (layerId: string, dx: number, dy: number) => void;
  commitLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  syncSketchOutputsNow: () => void;
}

interface SelectionFreeTransformSession {
  layerId: string;
  originalSnapshot: HTMLCanvasElement;
  baseSnapshot: HTMLCanvasElement;
  selectionBounds: LayerContentBounds;
  originalSelection: ReturnType<typeof cloneSelectionMask>;
  originalContentBounds: LayerContentBounds;
}

interface RepeatableTransformRecord {
  transform: LayerTransform;
  selectionScoped: boolean;
}


/** Runtime canvas snapshots for history restore (multi-layer bake, etc.). */
function snapshotLayersForHistory(
  canvasRef: RefObject<SketchCanvasRef | null>,
  layerIds: readonly string[]
): Record<string, HTMLCanvasElement | null> | undefined {
  const canvas = canvasRef.current;
  if (!canvas || layerIds.length === 0) {
    return undefined;
  }
  const out: Record<string, HTMLCanvasElement | null> = {};
  let hasSnapshot = false;
  for (const id of layerIds) {
    const snap = canvas.snapshotLayerCanvas(id);
    out[id] = snap;
    if (snap) {
      hasSnapshot = true;
    }
  }
  return hasSnapshot ? out : undefined;
}

export function useTransformActions({
  canvasRef,
  document,
  pushHistory,
  updateLayerData,
  offsetLayerTransform,
  commitLayerTransform,
  setLayerTransform,
  setLayerContentBounds,
  syncSketchOutputsNow
}: UseTransformActionsParams) {
  /** Original transform saved when the transform tool activates. */
  const transformOriginalRef = useRef<LayerTransform | null>(null);
  const multiTransformOriginalRef = useRef<Record<
    string,
    LayerTransform
  > | null>(null);
  const selectionFreeTransformRef = useRef<SelectionFreeTransformSession | null>(null);
  const lastCommittedTransformRef = useRef<RepeatableTransformRecord | null>(null);
  const selection = useSketchStore((state) => state.selection);
  const setSelection = useSketchStore((state) => state.setSelection);

  const storeLastCommittedTransform = useCallback(
    (transform: LayerTransform, selectionScoped: boolean) => {
      lastCommittedTransformRef.current = {
        transform: cloneTransform(transform),
        selectionScoped
      };
    },
    []
  );

  const pushTransformHistory = useCallback(
    (label: string) => {
      const activeLayerId = document.activeLayerId;
      const layerCanvasSnapshots =
        activeLayerId && canvasRef.current
          ? {
              [activeLayerId]: canvasRef.current.snapshotLayerCanvas(activeLayerId)
            }
          : undefined;
      pushHistory(label, layerCanvasSnapshots, { restoreMode: "structure-only" });
    },
    [pushHistory, document.activeLayerId, canvasRef]
  );

  /** Save the current layer transform as the baseline for cancel. */
  const saveTransformOriginal = useCallback(() => {
    const store = useSketchStore.getState();
    const panelSelection =
      store.selectedLayerIds.length > 0 ? store.selectedLayerIds : [];
    const targetIds = resolveTransformTargetLayerIds(
      document,
      panelSelection,
      document.activeLayerId
    );

    if (targetIds.length > 1) {
      const map: Record<string, LayerTransform> = {};
      for (const id of targetIds) {
        const layer = document.layers.find((l) => l.id === id);
        if (layer) {
          map[id] = cloneTransform(layer.transform);
        }
      }
      multiTransformOriginalRef.current = map;
      transformOriginalRef.current = null;
      return;
    }

    multiTransformOriginalRef.current = null;
    const soleId =
      targetIds.length === 1 ? targetIds[0]! : document.activeLayerId;
    const layer = soleId
      ? document.layers.find((l) => l.id === soleId)
      : undefined;
    if (layer) {
      transformOriginalRef.current = cloneTransform(layer.transform);
    }
  }, [document]);

  const clearSelectionFreeTransformSession = useCallback(() => {
    selectionFreeTransformRef.current = null;
  }, []);

  /**
   * Restores the original layer pixels/content bounds when a selection-scoped
   * transform is cancelled or cannot be completed.
   *
   * @returns `true` when a selection transform session was restored.
   */
  const restoreSelectionFreeTransformState = useCallback(() => {
    const session = selectionFreeTransformRef.current;
    const canvas = canvasRef.current;
    if (!session || !canvas) {
      return false;
    }
    canvas.restoreLayerCanvas(session.layerId, session.originalSnapshot);
    setLayerContentBounds(session.layerId, session.originalContentBounds);
    setSelection(cloneSelectionMask(session.originalSelection));
    clearSelectionFreeTransformSession();
    return true;
  }, [canvasRef, setLayerContentBounds, clearSelectionFreeTransformSession, setSelection]);

  /**
   * Splits the active selection from the current layer so Free Transform can
   * operate on just the selected pixels instead of the full layer.
   *
   * @returns `true` when selection-scoped transform state was prepared.
   */
  const prepareSelectionFreeTransform = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const canvas = canvasRef.current;
    if (!activeLayerId || !canvas || !selection || !selectionHasAnyPixels(selection)) {
      return false;
    }
    const activeLayer = document.layers.find((layer) => layer.id === activeLayerId);
    if (!activeLayer) {
      return false;
    }
    const originalSnapshot = canvas.snapshotLayerCanvas(activeLayerId);
    if (!originalSnapshot) {
      return false;
    }
    const prepared = prepareSelectionFreeTransformCanvases({
      snapshot: originalSnapshot,
      layer: activeLayer,
      documentCanvasWidth: document.canvas.width,
      documentCanvasHeight: document.canvas.height,
      selection
    });
    if (!prepared) {
      return false;
    }
    selectionFreeTransformRef.current = {
      layerId: activeLayerId,
      originalSnapshot,
      baseSnapshot: prepared.baseCanvas,
      selectionBounds: prepared.selectionBounds,
      originalSelection: cloneSelectionMask(selection),
      originalContentBounds: activeLayer.contentBounds ?? {
        x: 0,
        y: 0,
        width: originalSnapshot.width,
        height: originalSnapshot.height
      }
    };
    canvas.restoreLayerCanvas(activeLayerId, prepared.selectionCanvas);
    setLayerContentBounds(activeLayerId, prepared.selectionBounds);
    return true;
  }, [
    canvasRef,
    document.activeLayerId,
    document.canvas.height,
    document.canvas.width,
    document.layers,
    selection,
    setLayerContentBounds
  ]);

  const applyRepeatTransformToLayer = useCallback(
    (
      layerId: string,
      record: RepeatableTransformRecord
    ): boolean => {
      const canvas = canvasRef.current;
      const state = useSketchStore.getState();
      const activeLayer = state.document.layers.find((layer) => layer.id === layerId);
      if (!canvas || !activeLayer) {
        return false;
      }
      if (activeLayer.locked && !layerAllowsTransformWhilePixelLocked(activeLayer)) {
        return false;
      }

      const originalSnapshot = canvas.snapshotLayerCanvas(layerId);
      if (!originalSnapshot) {
        return false;
      }

      if (record.selectionScoped) {
        const currentSelection = state.selection;
        if (!currentSelection || !selectionHasAnyPixels(currentSelection)) {
          return false;
        }
        const prepared = prepareSelectionFreeTransformCanvases({
          snapshot: originalSnapshot,
          layer: activeLayer,
          documentCanvasWidth: state.document.canvas.width,
          documentCanvasHeight: state.document.canvas.height,
          selection: currentSelection
        });
        if (!prepared) {
          return false;
        }

        const tempDocument = {
          ...state.document,
          layers: state.document.layers.map((layer) =>
            layer.id === layerId
              ? {
                  ...layer,
                  transform: record.transform,
                  contentBounds: prepared.selectionBounds
                }
              : layer
          )
        };
        const tempCanvases = new Map<string, HTMLCanvasElement>([
          [layerId, prepared.selectionCanvas]
        ]);
        const reconciledData = reconcileLayerToDocumentSpace(
          layerId,
          tempDocument,
          tempCanvases
        );
        const transformedSelectionCanvas = tempCanvases.get(layerId);
        if (!reconciledData || !transformedSelectionCanvas) {
          return false;
        }

        const finalCanvas = compositeSelectionOverBase(
          prepared.baseCanvas,
          transformedSelectionCanvas
        );
        const fallbackBounds =
          getCanvasRasterBounds(finalCanvas) ?? prepared.selectionBounds;
        const finalData = getLayerDataFromCanvas(finalCanvas);
        const { bounds } = deserializeLayerData(finalData, fallbackBounds);
        const transformedSelection = transformSelectionMask(
          currentSelection,
          prepared.selectionBounds,
          record.transform
        );

        canvas.restoreLayerCanvas(layerId, finalCanvas);
        updateLayerData(layerId, finalData);
        setLayerContentBounds(layerId, bounds);
        setLayerTransform(layerId, { ...IDENTITY_AFFINE });
        setSelection(transformedSelection);
        syncSketchOutputsNow();
        return true;
      }

      const tempDocument = {
        ...state.document,
        layers: state.document.layers.map((layer) =>
          layer.id === layerId
            ? { ...layer, transform: record.transform }
            : layer
        )
      };
      const tempCanvases = new Map<string, HTMLCanvasElement>([
        [layerId, originalSnapshot]
      ]);
      const reconciledData = reconcileLayerToDocumentSpace(
        layerId,
        tempDocument,
        tempCanvases
      );
      const reconciledCanvas = tempCanvases.get(layerId);
      if (!reconciledData || !reconciledCanvas) {
        return false;
      }
      const fallbackBounds = getCanvasRasterBounds(reconciledCanvas) ?? {
        x: 0,
        y: 0,
        width: state.document.canvas.width,
        height: state.document.canvas.height
      };
      const { bounds } = deserializeLayerData(reconciledData, fallbackBounds);

      canvas.restoreLayerCanvas(layerId, reconciledCanvas);
      updateLayerData(layerId, reconciledData);
      setLayerContentBounds(layerId, bounds);
      setLayerTransform(layerId, { ...IDENTITY_AFFINE });
      syncSketchOutputsNow();
      return true;
    },
    [
      canvasRef,
      updateLayerData,
      setLayerContentBounds,
      setLayerTransform,
      setSelection,
      syncSketchOutputsNow
    ]
  );

  /** Commit: bake the current scale/rotation into the pixel data and reset transform fields. */
  const handleTransformCommit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const transformToolHandler = getToolHandler("transform");
    if (
      transformToolHandler instanceof TransformTool &&
      transformToolHandler.isMultiTarget()
    ) {
      const ids = [...transformToolHandler.getMultiTargetLayerIds()];
      pushHistory("transform bake", snapshotLayersForHistory(canvasRef, ids));
      const primary =
        document.layers.find((l) => l.id === document.activeLayerId) ??
        document.layers.find((l) => l.id === ids[0]);
      if (primary) {
        storeLastCommittedTransform(primary.transform, false);
      }
      const fallbackBounds = {
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height
      };
      for (const layerId of ids) {
        const lyr = document.layers.find((l) => l.id === layerId);
        if (!lyr) {
          continue;
        }
        const newData = canvas.reconcileLayerToDocumentSpace(layerId);
        if (newData !== null) {
          updateLayerData(layerId, newData);
          const { bounds } = deserializeLayerData(newData, fallbackBounds);
          setLayerContentBounds(layerId, bounds);
        }
        setLayerTransform(layerId, { ...IDENTITY_AFFINE });
      }
      transformOriginalRef.current = null;
      multiTransformOriginalRef.current = null;
      syncSketchOutputsNow();
      return;
    }

    const activeLayerId = document.activeLayerId;
    const activeLayer = document.layers.find((l) => l.id === activeLayerId);
    if (!activeLayer) {
      return;
    }

    const selectionSession = selectionFreeTransformRef.current;
    if (selectionSession && selectionSession.layerId === activeLayerId) {
      pushHistory(
        "transform bake",
        snapshotLayersForHistory(canvasRef, [activeLayerId])
      );
      storeLastCommittedTransform(activeLayer.transform, true);
      canvas.reconcileLayerToDocumentSpace(activeLayerId);
      const transformedSelectionCanvas = canvas.snapshotLayerCanvas(activeLayerId);
      if (!transformedSelectionCanvas) {
        restoreSelectionFreeTransformState();
        transformOriginalRef.current = null;
        return;
      }
      const finalCanvas = compositeSelectionOverBase(
        selectionSession.baseSnapshot,
        transformedSelectionCanvas
      );
      const fallbackBounds =
        getCanvasRasterBounds(finalCanvas) ?? selectionSession.originalContentBounds;
      const finalData = getLayerDataFromCanvas(finalCanvas);
      const { bounds } = deserializeLayerData(finalData, fallbackBounds);
      const transformedSelection = transformSelectionMask(
        selectionSession.originalSelection,
        selectionSession.selectionBounds,
        activeLayer.transform
      );
      setLayerTransform(activeLayerId, { ...IDENTITY_AFFINE });
      canvas.restoreLayerCanvas(activeLayerId, finalCanvas);
      updateLayerData(activeLayerId, finalData);
      setLayerContentBounds(activeLayerId, bounds);
      setSelection(transformedSelection);
      clearSelectionFreeTransformSession();
      transformOriginalRef.current = null;
      multiTransformOriginalRef.current = null;
      return;
    }

    pushHistory(
      "transform bake",
      snapshotLayersForHistory(canvasRef, [activeLayerId])
    );
    const newData = canvas.reconcileLayerToDocumentSpace(activeLayerId);
    storeLastCommittedTransform(activeLayer.transform, false);
    if (newData !== null) {
      updateLayerData(activeLayerId, newData);
      // Extract the bounds from the reconciled data and update the store
      // so the layer's contentBounds match the baked pixel data.
      const fallback = {
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height
      };
      const { bounds } = deserializeLayerData(newData, fallback);
      setLayerContentBounds(activeLayerId, bounds);
    }
    // After reconcile, the transform is baked into pixel data, so reset to identity.
    setLayerTransform(activeLayerId, { ...IDENTITY_AFFINE });

    transformOriginalRef.current = null;
    multiTransformOriginalRef.current = null;
  }, [
    document,
    canvasRef,
    storeLastCommittedTransform,
    updateLayerData,
    setLayerTransform,
    setLayerContentBounds,
    restoreSelectionFreeTransformState,
    clearSelectionFreeTransformSession,
    setSelection,
    syncSketchOutputsNow,
    pushHistory
  ]);

  /** Cancel: restore the original transform. */
  const handleTransformCancel = useCallback(() => {
    restoreSelectionFreeTransformState();
    const multi = multiTransformOriginalRef.current;
    if (multi) {
      for (const [layerId, transform] of Object.entries(multi)) {
        setLayerTransform(layerId, transform);
      }
      multiTransformOriginalRef.current = null;
      transformOriginalRef.current = null;
      return;
    }
    const activeLayerId = document.activeLayerId;
    const original = transformOriginalRef.current;
    if (original) {
      setLayerTransform(activeLayerId, original);
    }
    transformOriginalRef.current = null;
  }, [document.activeLayerId, setLayerTransform, restoreSelectionFreeTransformState]);

  /** Reset: set transform to identity. */
  const handleTransformReset = useCallback(() => {
    const handler = getToolHandler("transform");
    if (handler instanceof TransformTool && handler.isMultiTarget()) {
      for (const id of handler.getMultiTargetLayerIds()) {
        setLayerTransform(id, { ...IDENTITY_AFFINE });
      }
      return;
    }
    const store = useSketchStore.getState();
    const panelSelection =
      store.selectedLayerIds.length > 0 ? store.selectedLayerIds : [];
    const targetIds = resolveTransformTargetLayerIds(
      document,
      panelSelection,
      document.activeLayerId
    );
    if (targetIds.length > 1) {
      for (const id of targetIds) {
        setLayerTransform(id, { ...IDENTITY_AFFINE });
      }
      return;
    }
    const soleId =
      targetIds.length === 1 ? targetIds[0]! : document.activeLayerId;
    if (soleId) {
      setLayerTransform(soleId, { ...IDENTITY_AFFINE });
    }
  }, [document, setLayerTransform]);

  const handleCommitLayerTransform = useCallback(
    (layerId: string, transform: LayerTransform) => {
      commitLayerTransform(layerId, transform);
    },
    [commitLayerTransform]
  );

  const bakeLayerTransformIntoDocumentSpace = useCallback(
    (layerId: string) => {
      const layer = document.layers.find((entry) => entry.id === layerId);
      if (!layer || !canvasRef.current) {
        return;
      }

      if (layer.transform.kind === "affine") {
        const tx = layer.transform.x;
        const ty = layer.transform.y;
        if (tx === 0 && ty === 0) {
          return;
        }
      }

      pushHistory(
        "transform bake",
        snapshotLayersForHistory(canvasRef, [layerId])
      );
      const data = canvasRef.current.reconcileLayerToDocumentSpace(layerId);
      commitLayerTransform(layerId, { ...IDENTITY_AFFINE });
      setLayerContentBounds(layerId, {
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height
      });
      updateLayerData(layerId, data);
    },
    [
      document.layers,
      document.canvas.width,
      document.canvas.height,
      canvasRef,
      pushHistory,
      commitLayerTransform,
      setLayerContentBounds,
      updateLayerData
    ]
  );

  const reconcileAllLayerTransforms = useCallback(() => {
    for (const layer of document.layers) {
      bakeLayerTransformIntoDocumentSpace(layer.id);
    }
  }, [document.layers, bakeLayerTransformIntoDocumentSpace]);

  /** Arrow key nudge for active layer. */
  const handleNudgeLayer = useCallback(
    (
      dx: number,
      dy: number,
      options?: { recordHistory?: boolean; syncOutputs?: boolean }
    ) => {
      const recordHistory = options?.recordHistory !== false;
      const syncOutputs = options?.syncOutputs !== false;
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      const blockedByLock =
        layer?.locked && !layerAllowsTransformWhilePixelLocked(layer);
      if (!activeLayerId || !canvasRef.current || !layer || blockedByLock) {
        return;
      }
      if (recordHistory) {
        pushTransformHistory("nudge layer");
      }
      offsetLayerTransform(activeLayerId, dx, dy);
      if (!canvasRef.current) {
        return;
      }
      if (syncOutputs) {
        syncSketchOutputsNow();
      }
    },
    [
      document.activeLayerId,
      document.layers,
      pushTransformHistory,
      offsetLayerTransform,
      syncSketchOutputsNow,
      canvasRef
    ]
  );

  // ── In-transform undo/redo ─────────────────────────────────────────────

  /** Helper: get the TransformTool handler and current active layer transform. */
  const getTransformToolState = useCallback(() => {
    const handler = getToolHandler("transform");
    if (!(handler instanceof TransformTool)) {
      return null;
    }
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return null;
    }
    const currentTransform = handler.getLiveTransform() ?? layer.transform;
    return { handler, activeLayerId, layer, currentTransform };
  }, [document.activeLayerId, document.layers]);

  /** Undo the last handle adjustment while still in transform mode. */
  const handleTransformUndo = useCallback(() => {
    const state = getTransformToolState();
    if (
      state &&
      !state.handler.isMultiTarget() &&
      state.handler.hasUndoableAdjustments()
    ) {
      const restored = state.handler.undoLastAdjustment(state.currentTransform);
      if (restored) {
        setLayerTransform(state.activeLayerId, restored);
        return;
      }
    }
    useSketchStore.getState().undo();
  }, [getTransformToolState, setLayerTransform]);

  /** Redo the last undone handle adjustment while still in transform mode. */
  const handleTransformRedo = useCallback(() => {
    const state = getTransformToolState();
    if (
      state &&
      !state.handler.isMultiTarget() &&
      state.handler.hasRedoableAdjustments()
    ) {
      const restored = state.handler.redoLastAdjustment(state.currentTransform);
      if (restored) {
        setLayerTransform(state.activeLayerId, restored);
        return;
      }
    }
    useSketchStore.getState().redo();
  }, [getTransformToolState, setLayerTransform]);

  // ── Quick transform operations (for transform context menu) ─────────────

  /** Rotate the active layer's transform by the given angle in radians. */
  const handleTransformRotate = useCallback(
    (angleRad: number) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!layer) {
        return;
      }
      pushTransformHistory("transform rotate");
      const current = layer.transform;
      const base = isAffineTransform(current) ? current : IDENTITY_AFFINE;
      setLayerTransform(activeLayerId, makeAffineTransform({
        ...base,
        rotation: base.rotation + angleRad
      }));
    },
    [
      document.activeLayerId,
      document.layers,
      pushTransformHistory,
      setLayerTransform
    ]
  );

  /** Flip the active layer's transform horizontally (negate scaleX). */
  const handleTransformFlipH = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    pushTransformHistory("transform flip horizontal");
    const current = layer.transform;
    const base = isAffineTransform(current) ? current : IDENTITY_AFFINE;
    setLayerTransform(activeLayerId, makeAffineTransform({
      ...base,
      scaleX: -base.scaleX
    }));
  }, [
    document.activeLayerId,
    document.layers,
    pushTransformHistory,
    setLayerTransform
  ]);

  /** Flip the active layer's transform vertically (negate scaleY). */
  const handleTransformFlipV = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    pushTransformHistory("transform flip vertical");
    const current = layer.transform;
    const base = isAffineTransform(current) ? current : IDENTITY_AFFINE;
    setLayerTransform(activeLayerId, makeAffineTransform({
      ...base,
      scaleY: -base.scaleY
    }));
  }, [
    document.activeLayerId,
    document.layers,
    pushTransformHistory,
    setLayerTransform
  ]);

  const handleRepeatLastTransform = useCallback(() => {
    const record = lastCommittedTransformRef.current;
    const activeLayerId = useSketchStore.getState().document.activeLayerId;
    if (!record || !activeLayerId) {
      return;
    }
    pushTransformHistory("repeat transform");
    applyRepeatTransformToLayer(activeLayerId, record);
  }, [applyRepeatTransformToLayer, pushTransformHistory]);

  const handleRepeatLastTransformOnCopy = useCallback(() => {
    const record = lastCommittedTransformRef.current;
    const canvas = canvasRef.current;
    const state = useSketchStore.getState();
    const activeLayerId = state.document.activeLayerId;
    if (!record || !canvas || !activeLayerId) {
      return;
    }
    if (record.selectionScoped && (!state.selection || !selectionHasAnyPixels(state.selection))) {
      return;
    }

    pushTransformHistory("repeat transform on copy");
    state.duplicateLayer(activeLayerId);
    const nextState = useSketchStore.getState();
    const duplicatedLayer = nextState.document.layers.find(
      (layer) => layer.id === nextState.document.activeLayerId
    );
    if (!duplicatedLayer) {
      return;
    }

    canvas.setLayerData(
      duplicatedLayer.id,
      duplicatedLayer.data ?? null,
      duplicatedLayer.contentBounds
    );
    const applied = applyRepeatTransformToLayer(duplicatedLayer.id, record);
    if (!applied) {
      useSketchStore.getState().removeLayer(duplicatedLayer.id);
    }
  }, [applyRepeatTransformToLayer, canvasRef, pushTransformHistory]);

  return {
    transformOriginalRef,
    saveTransformOriginal,
    prepareSelectionFreeTransform,
    handleTransformCommit,
    handleTransformCancel,
    handleTransformReset,
    handleCommitLayerTransform,
    handleNudgeLayer,
    pushTransformHistory,
    bakeLayerTransformIntoDocumentSpace,
    reconcileAllLayerTransforms,
    handleTransformUndo,
    handleTransformRedo,
    handleTransformRotate,
    handleTransformFlipH,
    handleTransformFlipV,
    handleRepeatLastTransform,
    handleRepeatLastTransformOnCopy
  };
}
