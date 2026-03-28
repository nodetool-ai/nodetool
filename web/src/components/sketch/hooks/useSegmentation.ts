/**
 * useSegmentation – hook for managing SAM-based segmentation workflow.
 *
 * Orchestrates: model availability → prompt collection → inference →
 * mask preview → layer group creation.
 *
 * This hook is intended to be called once at the SketchEditor level and
 * provides action callbacks that the SegmentTool and ToolSettingsPanel consume.
 */

import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type {
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationResult,
  SegmentationMask,
  SegmentationStatus,
  Layer,
  PushHistoryOptions
} from "../types";
import {
  createDefaultGroupLayer,
  createDefaultLayer,
  generateLayerId
} from "../types";
import { useSketchStore } from "../state";
import { getSamService, generateSegmentationRunId, DEFAULT_SAM_MODEL_ID } from "../sam";
import type { SamModelInfo } from "../sam";

export interface UseSegmentationParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
}

export interface UseSegmentationReturn {
  /** Current segmentation workflow status. */
  status: SegmentationStatus;
  /** Model availability info. */
  modelInfo: SamModelInfo | null;
  /** Latest segmentation result (masks). */
  result: SegmentationResult | null;
  /** Check model availability. */
  checkModel: () => Promise<void>;
  /** Run segmentation on the active layer with the collected prompts. */
  runSegmentation: (
    points: SegmentPointPrompt[],
    box: SegmentBoxPrompt | null
  ) => Promise<void>;
  /** Cancel a running segmentation. */
  cancelSegmentation: () => void;
  /** Apply the previewed masks → create layer group with cutout layers. */
  applyResult: () => void;
  /** Discard the current segmentation result. */
  discardResult: () => void;
}

export function useSegmentation({
  canvasRef,
  pushHistory
}: UseSegmentationParams): UseSegmentationReturn {
  const [status, setStatus] = useState<SegmentationStatus>("idle");
  const [modelInfo, setModelInfo] = useState<SamModelInfo | null>(null);
  const [result, setResult] = useState<SegmentationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Check model availability ───────────────────────────────────────────

  const checkModel = useCallback(async () => {
    setStatus("checking-model");
    try {
      const service = getSamService();
      const info = await service.checkModelAvailability();
      setModelInfo(info);
      setStatus("idle");
    } catch {
      // Intentionally catching all errors: model check failures (network, timeout, backend
      // unavailability) are surfaced to the UI via the "error" status. No logging here since
      // the user action is to retry via the UI.
      setStatus("error");
    }
  }, []);

  // ─── Run segmentation ──────────────────────────────────────────────────

  const runSegmentation = useCallback(
    async (points: SegmentPointPrompt[], box: SegmentBoxPrompt | null) => {
      const store = useSketchStore.getState();
      const doc = store.document;
      const activeLayer = doc.layers.find(
        (l) => l.id === doc.activeLayerId
      );
      if (!activeLayer || activeLayer.type === "group") {
        return;
      }

      // Get the active layer's image data
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const layerData = canvas.getLayerData(doc.activeLayerId);
      if (!layerData) {
        return;
      }

      // Cancel any existing request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("inferring");

      try {
        const service = getSamService();
        const response = await service.runSegmentation(
          {
            imageDataUrl: layerData,
            pointPrompts: points,
            boxPrompt: box,
            settings: doc.toolSettings.segment
          },
          controller.signal
        );

        if (controller.signal.aborted) {
          return;
        }

        const runId = generateSegmentationRunId();
        const segResult: SegmentationResult = {
          runId,
          sourceLayerId: doc.activeLayerId,
          masks: response.masks,
          timestamp: Date.now(),
          modelId: DEFAULT_SAM_MODEL_ID
        };

        setResult(segResult);
        setStatus(segResult.masks.length > 0 ? "previewing" : "idle");
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("idle");
          return;
        }
        // Log inference errors for debugging; status is exposed to the UI
        console.error("[useSegmentation] Inference failed:", err);
        setStatus("error");
      }
    },
    [canvasRef]
  );

  // ─── Cancel ─────────────────────────────────────────────────────────────

  const cancelSegmentation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  // ─── Apply result → create layer group with cutout layers ───────────────

  const applyResult = useCallback(() => {
    if (!result || result.masks.length === 0) {
      return;
    }

    const store = useSketchStore.getState();
    const doc = store.document;
    const settings = doc.toolSettings.segment;

    // Push history before making structural changes
    pushHistory("Segment Objects", undefined, {
      restoreMode: "structure-only"
    });

    // Create the group layer
    const groupLayer = createDefaultGroupLayer("Segmented Objects");

    // Create one raster layer per mask with segmentation metadata
    const maskLayers: Layer[] = result.masks.map(
      (mask: SegmentationMask, i: number) => {
        const layer = createDefaultLayer(
          mask.label || `Object ${i + 1}`,
          settings.outputCutouts ? "raster" : "mask",
          doc.canvas.width,
          doc.canvas.height
        );
        layer.id = generateLayerId();
        layer.parentId = groupLayer.id;
        layer.contentBounds = { ...mask.bounds };
        layer.transform = { x: 0, y: 0 };
        layer.segmentationMeta = {
          segmentationRunId: result.runId,
          sourceLayerId: result.sourceLayerId,
          modelId: result.modelId,
          confidence: mask.confidence,
          maskIndex: i
        };
        return layer;
      }
    );

    // Insert group + children into the document
    // Place them above the source layer
    const sourceIdx = doc.layers.findIndex(
      (l) => l.id === result.sourceLayerId
    );
    const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : doc.layers.length;

    const newLayers = [...doc.layers];

    // Apply source layer action
    if (settings.sourceLayerAction === "hide" && sourceIdx >= 0) {
      newLayers[sourceIdx] = { ...newLayers[sourceIdx], visible: false };
    } else if (settings.sourceLayerAction === "lock" && sourceIdx >= 0) {
      newLayers[sourceIdx] = { ...newLayers[sourceIdx], locked: true };
    }

    newLayers.splice(insertIdx, 0, groupLayer, ...maskLayers);

    // Update document with new layers
    store.setDocument({
      ...doc,
      layers: newLayers,
      activeLayerId: maskLayers[0]?.id ?? doc.activeLayerId
    });

    // Set cutout image data on each mask layer via canvas ref
    const canvas = canvasRef.current;
    if (canvas) {
      for (let i = 0; i < maskLayers.length; i++) {
        const mask = result.masks[i];
        if (mask.maskDataUrl) {
          canvas.setLayerData(maskLayers[i].id, mask.maskDataUrl, {
            x: mask.bounds.x,
            y: mask.bounds.y,
            width: mask.bounds.width,
            height: mask.bounds.height
          });
        }
      }
    }

    setResult(null);
    setStatus("idle");
  }, [result, canvasRef, pushHistory]);

  // ─── Discard ────────────────────────────────────────────────────────────

  const discardResult = useCallback(() => {
    setResult(null);
    setStatus("idle");
  }, []);

  return {
    status,
    modelInfo,
    result,
    checkModel,
    runSegmentation,
    cancelSegmentation,
    applyResult,
    discardResult
  };
}
