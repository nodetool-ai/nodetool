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
  layerAllowsTransformWhilePixelLocked,
  type LayerContentBounds,
  type LayerTransform,
  type Point,
  type PushHistoryOptions,
  type SketchDocument
} from "../types";
import { deserializeLayerData } from "../rendering/canvas2d/layerIO";

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
  commitLayerTransform: (layerId: string, transform: Point) => void;
  setLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  syncSketchOutputsNow: () => void;
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

  const pushTransformHistory = useCallback(
    (label: string) => {
      pushHistory(label, undefined, { restoreMode: "structure-only" });
    },
    [pushHistory]
  );

  /** Save the current layer transform as the baseline for cancel. */
  const saveTransformOriginal = useCallback(() => {
    const activeLayer = document.layers.find(
      (l) => l.id === document.activeLayerId
    );
    if (activeLayer) {
      transformOriginalRef.current = {
        x: activeLayer.transform.x,
        y: activeLayer.transform.y,
        scaleX: activeLayer.transform.scaleX ?? 1,
        scaleY: activeLayer.transform.scaleY ?? 1,
        rotation: activeLayer.transform.rotation ?? 0
      };
    }
  }, [document]);

  /** Commit: bake the current scale/rotation into the pixel data and reset transform fields. */
  const handleTransformCommit = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const activeLayer = document.layers.find((l) => l.id === activeLayerId);
    if (!activeLayer) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const newData = canvas.reconcileLayerToDocumentSpace(activeLayerId);
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
    setLayerTransform(activeLayerId, { x: 0, y: 0 });

    transformOriginalRef.current = null;
  }, [document, canvasRef, updateLayerData, setLayerTransform, setLayerContentBounds]);

  /** Cancel: restore the original transform. */
  const handleTransformCancel = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const original = transformOriginalRef.current;
    if (original) {
      setLayerTransform(activeLayerId, original);
    }
    transformOriginalRef.current = null;
  }, [document.activeLayerId, setLayerTransform]);

  /** Reset: set transform to identity. */
  const handleTransformReset = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    setLayerTransform(activeLayerId, { x: 0, y: 0 });
  }, [document.activeLayerId, setLayerTransform]);

  const handleCommitLayerTransform = useCallback(
    (layerId: string, transform: Point) => {
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

      const tx = layer.transform?.x ?? 0;
      const ty = layer.transform?.y ?? 0;
      if (tx === 0 && ty === 0) {
        return;
      }

      const data = canvasRef.current.reconcileLayerToDocumentSpace(layerId);
      commitLayerTransform(layerId, { x: 0, y: 0 });
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

  /** Undo the last handle adjustment while still in transform mode. */
  const handleTransformUndo = useCallback(() => {
    const handler = getToolHandler("transform");
    if (!(handler instanceof TransformTool)) {
      return;
    }
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    const currentTransform = handler.getLiveTransform() ?? layer.transform;
    const restored = handler.undoLastAdjustment(currentTransform);
    if (restored) {
      setLayerTransform(activeLayerId, restored);
    }
  }, [document.activeLayerId, document.layers, setLayerTransform]);

  /** Redo the last undone handle adjustment while still in transform mode. */
  const handleTransformRedo = useCallback(() => {
    const handler = getToolHandler("transform");
    if (!(handler instanceof TransformTool)) {
      return;
    }
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    const currentTransform = handler.getLiveTransform() ?? layer.transform;
    const restored = handler.redoLastAdjustment(currentTransform);
    if (restored) {
      setLayerTransform(activeLayerId, restored);
    }
  }, [document.activeLayerId, document.layers, setLayerTransform]);

  // ── Quick transform operations (for transform context menu) ─────────────

  /** Rotate the active layer's transform by the given angle in radians. */
  const handleTransformRotate = useCallback(
    (angleRad: number) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!layer) {
        return;
      }
      const current = layer.transform;
      const newRotation = (current.rotation ?? 0) + angleRad;
      setLayerTransform(activeLayerId, { ...current, rotation: newRotation });
    },
    [document.activeLayerId, document.layers, setLayerTransform]
  );

  /** Flip the active layer's transform horizontally (negate scaleX). */
  const handleTransformFlipH = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    const current = layer.transform;
    setLayerTransform(activeLayerId, {
      ...current,
      scaleX: -(current.scaleX ?? 1)
    });
  }, [document.activeLayerId, document.layers, setLayerTransform]);

  /** Flip the active layer's transform vertically (negate scaleY). */
  const handleTransformFlipV = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((l) => l.id === activeLayerId);
    if (!layer) {
      return;
    }
    const current = layer.transform;
    setLayerTransform(activeLayerId, {
      ...current,
      scaleY: -(current.scaleY ?? 1)
    });
  }, [document.activeLayerId, document.layers, setLayerTransform]);

  return {
    transformOriginalRef,
    saveTransformOriginal,
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
    handleTransformFlipV
  };
}
