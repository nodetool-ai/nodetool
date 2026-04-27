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
  Point,
  PushHistoryOptions
} from "../types";
import {
  createDefaultGroupLayer,
  createDefaultLayer,
  generateLayerId
} from "../types";
import { useSketchStore } from "../state";
import { exportSelectedRasterLayer } from "../serialization";
import {
  getDefaultSamModelId,
  getSamService,
  generateSegmentationRunId,
  generateCutoutDataUrl,
  drawMaskBoundsOverlay,
  drawMaskImageOverlay
} from "../sam";
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
  /** Run Local SAM3 split on the selected raster layer. */
  splitSelectedLayer: () => Promise<void>;
  /** Cancel a running segmentation. */
  cancelSegmentation: () => void;
  /** Apply the previewed masks → create layer group with cutout layers. */
  applyResult: () => void;
  /** Discard the current segmentation result. */
  discardResult: () => void;
  /**
   * Draw mask preview overlay on the given canvas context.
   * Call this from the render loop when status === "previewing".
   */
  drawMaskPreview: (
    ctx: CanvasRenderingContext2D,
    zoom: number,
    pan: Point
  ) => void;
}

export function useSegmentation({
  canvasRef,
  pushHistory
}: UseSegmentationParams): UseSegmentationReturn {
  const [status, setStatus] = useState<SegmentationStatus>("idle");
  const [modelInfo, setModelInfo] = useState<SamModelInfo | null>(null);
  const [result, setResult] = useState<SegmentationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyMasksToDocument = useCallback((params: {
    sourceLayerId: string;
    runId: string;
    modelId: string;
    masks: SegmentationMask[];
    sourceImageDataUrl?: string;
    sourceContentBoundsOffset?: { x: number; y: number };
    sourceTransformOverride?: Layer["transform"];
    preserveSourceLayer?: boolean;
    historyLabel: string;
  }) => {
    const {
      sourceLayerId,
      runId,
      modelId,
      masks,
      sourceImageDataUrl,
      sourceContentBoundsOffset,
      sourceTransformOverride,
      preserveSourceLayer = false,
      historyLabel
    } = params;

    if (masks.length === 0) {
      return;
    }

    const store = useSketchStore.getState();
    const doc = store.document;
    const settings = doc.toolSettings.segment;

    const groupLayer = createDefaultGroupLayer("Segmented Objects");
    const maskLayers: Layer[] = masks.map((mask, index) => {
      const layer = createDefaultLayer(
        mask.label || `Object ${index + 1}`,
        settings.outputCutouts ? "raster" : "mask",
        doc.canvas.width,
        doc.canvas.height
      );
      layer.id = generateLayerId();
      layer.parentId = groupLayer.id;
      layer.contentBounds = sourceContentBoundsOffset
        ? {
            x: sourceContentBoundsOffset.x + mask.bounds.x,
            y: sourceContentBoundsOffset.y + mask.bounds.y,
            width: mask.bounds.width,
            height: mask.bounds.height
          }
        : { ...mask.bounds };
      layer.transform = sourceTransformOverride
        ? { ...sourceTransformOverride }
        : { x: 0, y: 0 };
      layer.segmentationMeta = {
        segmentationRunId: runId,
        sourceLayerId,
        modelId,
        confidence: mask.confidence,
        maskIndex: index
      };
      return layer;
    });

    const sourceIdx = doc.layers.findIndex((layer) => layer.id === sourceLayerId);
    const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : doc.layers.length;
    const newLayers = [...doc.layers];

    if (!preserveSourceLayer) {
      if (settings.sourceLayerAction === "hide" && sourceIdx >= 0) {
        newLayers[sourceIdx] = { ...newLayers[sourceIdx], visible: false };
      } else if (settings.sourceLayerAction === "lock" && sourceIdx >= 0) {
        newLayers[sourceIdx] = { ...newLayers[sourceIdx], locked: true };
      }
    }

    newLayers.splice(insertIdx, 0, groupLayer, ...maskLayers);

    store.setDocument({
      ...doc,
      layers: newLayers,
      activeLayerId: maskLayers[0]?.id ?? doc.activeLayerId
    });

    const canvas = canvasRef.current;
    if (canvas && settings.outputCutouts) {
      // Split-selected-layer calls pass pre-exported source pixels so off-canvas
      // content is preserved. Preview/apply flows fall back to the current
      // runtime layer data for existing prompt-based segmentation behavior.
      const sourceData = sourceImageDataUrl ?? canvas.getLayerData(sourceLayerId);
      if (sourceData) {
        for (let index = 0; index < maskLayers.length; index += 1) {
          const mask = masks[index];
          const layer = maskLayers[index];
          if (!mask.maskDataUrl) {
            continue;
          }

          canvas.setLayerData(layer.id, mask.maskDataUrl, layer.contentBounds);
          store.updateLayerData(layer.id, mask.maskDataUrl);

          void generateCutoutDataUrl(
            sourceData,
            mask.maskDataUrl,
            mask.bounds,
            settings.maskFeather
          )
            .then((cutout) => {
              if (!cutout) {
                return;
              }
              canvas.setLayerData(layer.id, cutout, layer.contentBounds);
              store.updateLayerData(layer.id, cutout);
            })
            .catch((err) => {
              console.warn("[useSegmentation] Cutout generation failed:", err);
            });
        }
      }
    } else if (canvas) {
      for (let index = 0; index < maskLayers.length; index += 1) {
        const mask = masks[index];
        const layer = maskLayers[index];
        if (!mask.maskDataUrl) {
          continue;
        }
        canvas.setLayerData(layer.id, mask.maskDataUrl, layer.contentBounds);
        store.updateLayerData(layer.id, mask.maskDataUrl);
      }
    }

    pushHistory(historyLabel);
  }, [canvasRef, pushHistory]);

  // ─── Check model availability ───────────────────────────────────────────

  const checkModel = useCallback(async () => {
    setStatus("checking-model");
    try {
      const backend = useSketchStore.getState().toolSettings.segment.backend;
      const service = getSamService(backend);
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
        const backend = doc.toolSettings.segment.backend;
        const service = getSamService(backend);
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
          modelId: response.modelId ?? getDefaultSamModelId(backend)
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

  const splitSelectedLayer = useCallback(async () => {
    const store = useSketchStore.getState();
    const doc = store.document;
    const selectedLayerIds =
      store.selectedLayerIds.length > 0
        ? [...store.selectedLayerIds]
        : [doc.activeLayerId];

    if (selectedLayerIds.length !== 1) {
      return;
    }

    const sourceLayerId = selectedLayerIds[0];
    const sourceLayer = doc.layers.find((layer) => layer.id === sourceLayerId);
    if (!sourceLayer || sourceLayer.type !== "raster") {
      return;
    }

    const exportedLayer = exportSelectedRasterLayer(doc, sourceLayerId);
    if (!exportedLayer) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("inferring");

    try {
      const backend = doc.toolSettings.segment.backend;
      const service = getSamService(backend);
      const response = await service.runSegmentation(
        {
          imageDataUrl: exportedLayer.imageDataUrl,
          pointPrompts: [],
          boxPrompt: null,
          settings: doc.toolSettings.segment
        },
        controller.signal
      );

      if (controller.signal.aborted) {
        return;
      }

      if (response.masks.length === 0) {
        setStatus("idle");
        return;
      }

      applyMasksToDocument({
        sourceLayerId,
        runId: generateSegmentationRunId(),
        modelId: response.modelId ?? getDefaultSamModelId(backend),
        masks: response.masks,
        sourceImageDataUrl: exportedLayer.imageDataUrl,
        sourceContentBoundsOffset: {
          x: exportedLayer.sourceMetadata.contentBounds.x,
          y: exportedLayer.sourceMetadata.contentBounds.y
        },
        sourceTransformOverride: exportedLayer.sourceMetadata.layerTransform,
        preserveSourceLayer: true,
        historyLabel: "Split Selected Layer"
      });
      setResult(null);
      setStatus("idle");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      console.error("[useSegmentation] Split selected layer failed:", err);
      setStatus("error");
    }
  }, [applyMasksToDocument]);

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

    applyMasksToDocument({
      sourceLayerId: result.sourceLayerId,
      runId: result.runId,
      modelId: result.modelId,
      masks: result.masks,
      historyLabel: "Segment Objects"
    });

    setResult(null);
    setStatus("idle");
  }, [applyMasksToDocument, result]);

  // ─── Discard ────────────────────────────────────────────────────────────

  const discardResult = useCallback(() => {
    setResult(null);
    setStatus("idle");
  }, []);

  // ─── Mask Preview Overlay ───────────────────────────────────────────────

  const drawMaskPreview = useCallback(
    (ctx: CanvasRenderingContext2D, zoom: number, _pan: Point) => {
      if (!result || result.masks.length === 0) {
        return;
      }

      // The overlay canvas is already in document-pixel space (CSS handles
      // zoom/pan), so we draw directly without transform.
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Try to draw full mask image overlays; falls back to bounds
      // if mask data URLs are not available.
      const hasMaskData = result.masks.some((m) => !!m.maskDataUrl);
      if (hasMaskData) {
        // drawMaskImageOverlay is async — fire-and-forget with signal safety
        void drawMaskImageOverlay(ctx, result.masks, zoom).catch(() => {
          // Fallback to bounding boxes if image loading fails
          drawMaskBoundsOverlay(ctx, result.masks, zoom);
        });
      } else {
        drawMaskBoundsOverlay(ctx, result.masks, zoom);
      }
    },
    [result]
  );

  return {
    status,
    modelInfo,
    result,
    checkModel,
    runSegmentation,
    splitSelectedLayer,
    cancelSegmentation,
    applyResult,
    discardResult,
    drawMaskPreview
  };
}
