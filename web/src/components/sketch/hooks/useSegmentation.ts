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
  PushHistoryOptions,
  SketchDocument
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
  DEFAULT_SAM_MODEL_ID,
  getSegmentationService,
  generateSegmentationRunId,
  generateCutoutDataUrl,
  toAlphaMaskDataUrl,
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  projectSegmentationMasksToDocumentSpace,
  rasterizeSegmentationToDocumentSpace
} from "../sam";
import type { SamModelInfo } from "../sam";

interface UseSegmentationParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
}

/** Said when a run completes and the model found nothing to isolate. */
const EMPTY_RESULT_NOTICE =
  "The model returned no masks. Try another prompt, a lower confidence, or a different model.";

export interface UseSegmentationReturn {
  /** Current segmentation workflow status. */
  status: SegmentationStatus;
  /** Model availability info. */
  modelInfo: SamModelInfo | null;
  /** Latest segmentation result (masks). */
  result: SegmentationResult | null;
  /** What went wrong, when status is "error". */
  errorMessage: string | null;
  /** Check model availability. */
  checkModel: () => Promise<void>;
  /** Run segmentation on the active layer with the collected prompts. */
  runSegmentation: (
    points: SegmentPointPrompt[],
    box: SegmentBoxPrompt | null
  ) => Promise<void>;
  /** Split the selected raster layer into its objects. */
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Fail with what actually went wrong. The provider's own message names the
   * model, the credential or the malformed argument; a generic "segmentation
   * failed" sends the user looking in the wrong place.
   */
  const fail = useCallback((context: string, error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[useSegmentation] ${context}:`, error);
    setErrorMessage(detail || context);
    setStatus("error");
  }, []);

  /**
   * Export a layer's pixels, preferring the runtime canvas over `layer.data`.
   * A layer imported from an asset renders from its `imageReference` and keeps
   * `layer.data === null`, so the document alone cannot export it.
   */
  const exportLayerPixels = useCallback(
    (doc: SketchDocument, layerId: string) =>
      exportSelectedRasterLayer(
        doc,
        layerId,
        canvasRef.current?.getLayerData(layerId) ?? undefined
      ),
    [canvasRef]
  );

  const applyMasksToDocument = useCallback(async (params: {
    sourceLayerId: string;
    runId: string;
    modelId: string;
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
    // `store.toolSettings` is the live slice the panels write to; the copy on
    // the document is the last saved snapshot, so reading it here ran every
    // segmentation with the shipped defaults and dropped the typed concept.
    const settings = store.toolSettings.segment;
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
          : // A mask layer holds the silhouette, so the model's opaque
            // white-on-black PNG becomes alpha here too — stored raw it is a
            // full-canvas black rectangle covering the layers below.
            await toAlphaMaskDataUrl(mask.maskDataUrl);

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

  const checkModel = useCallback(async () => {
    setStatus("checking-model");
    try {
      const segment = useSketchStore.getState().toolSettings.segment;
      const info = await getSegmentationService().checkModelAvailability(
        segment.model
      );
      setModelInfo(info);
      setErrorMessage(null);
      setStatus("idle");
    } catch (err) {
      fail("Could not check the model", err);
    }
  }, [fail]);

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

      const exportedLayer = exportLayerPixels(doc, activeLayer.id);
      if (!exportedLayer) {
        fail(
          "Segmentation needs pixels",
          new Error("The selected layer has no image data to segment.")
        );
        return;
      }

      // Cancel any existing request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setErrorMessage(null);
      setStatus("inferring");

      try {
        const response = await getSegmentationService().runSegmentation(
          {
            imageDataUrl: exportedLayer.imageDataUrl,
            pointPrompts: points,
            boxPrompt: box,
            settings: store.toolSettings.segment,
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
          modelId: response.modelId ?? DEFAULT_SAM_MODEL_ID,
          nodeType: response.nodeType,
          sourceMetadata: responseSourceMetadata
        };

        setResult(segResult);
        if (segResult.masks.length === 0) {
          // A run that finds nothing used to return to idle in silence, which
          // is indistinguishable from a run that never happened.
          setErrorMessage(EMPTY_RESULT_NOTICE);
          setStatus("idle");
          return;
        }
        setStatus("previewing");
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("idle");
          return;
        }
        fail("Inference failed", err);
      }
    },
    [exportLayerPixels]
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

    const exportedLayer = exportLayerPixels(doc, sourceLayerId);
    if (!exportedLayer) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("inferring");

    try {
      const response = await getSegmentationService().runSegmentation(
          {
            imageDataUrl: exportedLayer.imageDataUrl,
            pointPrompts: [],
            boxPrompt: null,
            settings: store.toolSettings.segment,
            sourceMetadata: exportedLayer.sourceMetadata
          },
          controller.signal
        );

      if (controller.signal.aborted) {
        return;
      }

      if (response.masks.length === 0) {
        setErrorMessage(EMPTY_RESULT_NOTICE);
        setStatus("idle");
        return;
      }

      setStatus("applying");
      await applyMasksToDocument({
        sourceLayerId,
        runId: generateSegmentationRunId(),
        modelId: response.modelId ?? DEFAULT_SAM_MODEL_ID,
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
      fail("Split selected layer failed", err);
    }
  }, [applyMasksToDocument, exportLayerPixels]);

  const cancelSegmentation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

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
        nodeType: result.nodeType,
        masks: result.masks,
        sourceMetadata: result.sourceMetadata,
        historyLabel: "Segment Objects"
      });

      setResult(null);
      setStatus("idle");
    } catch (err) {
      fail("Applying the masks failed", err);
    }
  }, [applyMasksToDocument, result]);

  const discardResult = useCallback(() => {
    setResult(null);
    setStatus("idle");
  }, []);

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
    errorMessage,
    checkModel,
    runSegmentation,
    splitSelectedLayer,
    cancelSegmentation,
    applyResult,
    discardResult,
    drawMaskPreview
  };
}
