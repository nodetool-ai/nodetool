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
  Point,
  PushHistoryOptions
} from "../types";
import {
  createDefaultGroupLayer,
  createDefaultLayer,
  generateLayerId
} from "../types";
import { useSketchStore } from "../state";
import {
  deserializeLayerData,
  exportSelectedRasterLayer
} from "../serialization";
import {
  getDefaultSamModelId,
  getSamService,
  generateSegmentationRunId,
  generateCutoutDataUrl,
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  projectSegmentationMasksToDocumentSpace,
  rasterizeSegmentationToDocumentSpace
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
  applyResult: () => Promise<void>;
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

  const applyMasksToDocument = useCallback(async (params: {
    sourceLayerId: string;
    runId: string;
    modelId: string;
    backendId?: SegmentationResult["backendId"];
    nodeType?: SegmentationResult["nodeType"];
    masks: SegmentationMask[];
    sourceImageDataUrl?: string;
    sourceMetadata?: SegmentationResult["sourceMetadata"];
    preserveSourceLayer?: boolean;
    historyLabel: string;
  }): Promise<void> => {
    const {
      sourceLayerId,
      runId,
      modelId,
      backendId,
      nodeType,
      masks,
      sourceImageDataUrl,
      sourceMetadata,
      preserveSourceLayer = false,
      historyLabel
    } = params;

    if (masks.length === 0) {
      return;
    }

    const store = useSketchStore.getState();
    const doc = store.document;
    const settings = doc.toolSettings.segment;
    const activeSourceMetadata =
      sourceMetadata ?? masks.find((mask) => mask.sourceMetadata)?.sourceMetadata;
    const canvas = canvasRef.current;
    const currentLayerData = sourceImageDataUrl ?? canvas?.getLayerData(sourceLayerId) ?? null;
    const decodedCurrentLayer = deserializeLayerData(
      currentLayerData,
      doc.canvas.width,
      doc.canvas.height
    );
    const currentSourceImageDataUrl = sourceImageDataUrl ?? decodedCurrentLayer.image ?? undefined;

    const groupLayer = createDefaultGroupLayer("Segmented Objects");
    const maskLayerPayloads = await Promise.all(masks.map(async (mask, index) => {
      const layer = createDefaultLayer(
        mask.label || `Object ${index + 1}`,
        "raster",
        doc.canvas.width,
        doc.canvas.height
      );
      layer.id = generateLayerId();
      layer.parentId = groupLayer.id;
      layer.segmentationMeta = {
        segmentationRunId: runId,
        sourceLayerId,
        backendId,
        modelId,
        nodeType,
        confidence: mask.confidence,
        maskIndex: index
      };
      const effectiveSourceMetadata = mask.sourceMetadata ?? activeSourceMetadata;
      const rasterSource =
        settings.outputCutouts && currentSourceImageDataUrl
          ? await generateCutoutDataUrl(
              currentSourceImageDataUrl,
              mask.maskDataUrl,
              mask.bounds,
              settings.maskFeather
            )
          : mask.maskDataUrl;

      if (effectiveSourceMetadata && rasterSource) {
        const documentSpaceRaster = await rasterizeSegmentationToDocumentSpace(
          rasterSource,
          effectiveSourceMetadata
        );
        layer.contentBounds = documentSpaceRaster.bounds;
        return {
          layer,
          data: documentSpaceRaster.data,
          bounds: documentSpaceRaster.bounds
        };
      }

      layer.contentBounds = { ...mask.bounds };
      return {
        layer,
        data: rasterSource ?? mask.maskDataUrl,
        bounds: { ...mask.bounds }
      };
    }));
    const maskLayers = maskLayerPayloads.map((payload) => payload.layer);

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

    if (canvas) {
      for (const payload of maskLayerPayloads) {
        canvas.setLayerData(payload.layer.id, payload.data, payload.bounds);
        store.updateLayerData(payload.layer.id, payload.data);
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

      const exportedLayer = exportSelectedRasterLayer(doc, activeLayer.id);
      if (!exportedLayer) {
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
            imageDataUrl: exportedLayer.imageDataUrl,
            pointPrompts: points,
            boxPrompt: box,
            settings: doc.toolSettings.segment,
            sourceMetadata: exportedLayer.sourceMetadata
          },
          controller.signal
        );

        if (controller.signal.aborted) {
          return;
        }

        const runId = generateSegmentationRunId();
        const responseSourceMetadata =
          response.sourceMetadata ?? exportedLayer.sourceMetadata;
        const responseMasks = response.masks.map((mask) => ({
          ...mask,
          sourceMetadata: mask.sourceMetadata ?? responseSourceMetadata
        }));
        const segResult: SegmentationResult = {
          runId,
          sourceLayerId: doc.activeLayerId,
          masks: responseMasks,
          timestamp: Date.now(),
          modelId: response.modelId ?? getDefaultSamModelId(backend),
          backendId: response.backendId,
          nodeType: response.nodeType,
          sourceMetadata: responseSourceMetadata
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
            settings: doc.toolSettings.segment,
            sourceMetadata: exportedLayer.sourceMetadata
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

      setStatus("applying");
      await applyMasksToDocument({
        sourceLayerId,
        runId: generateSegmentationRunId(),
        modelId: response.modelId ?? getDefaultSamModelId(backend),
        backendId: response.backendId,
        nodeType: response.nodeType,
        masks: response.masks,
        sourceImageDataUrl: exportedLayer.imageDataUrl,
        sourceMetadata: exportedLayer.sourceMetadata,
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

  const applyResult = useCallback(async () => {
    if (!result || result.masks.length === 0) {
      return;
    }

    setStatus("applying");
    try {
      await applyMasksToDocument({
        sourceLayerId: result.sourceLayerId,
        runId: result.runId,
        modelId: result.modelId,
        backendId: result.backendId,
        nodeType: result.nodeType,
        masks: result.masks,
        sourceMetadata: result.sourceMetadata,
        historyLabel: "Segment Objects"
      });

      setResult(null);
      setStatus("idle");
    } catch (err) {
      console.error("[useSegmentation] Apply result failed:", err);
      setStatus("error");
    }
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

      void projectSegmentationMasksToDocumentSpace(result.masks)
        .then((projectedMasks) => {
          const hasMaskData = projectedMasks.some((mask) => !!mask.maskDataUrl);
          if (hasMaskData) {
            return drawMaskImageOverlay(ctx, projectedMasks, zoom).catch(() => {
              drawMaskBoundsOverlay(ctx, projectedMasks, zoom);
            });
          }

          drawMaskBoundsOverlay(ctx, projectedMasks, zoom);
          return Promise.resolve();
        })
        .catch(() => {
          drawMaskBoundsOverlay(ctx, result.masks, zoom);
        });
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
