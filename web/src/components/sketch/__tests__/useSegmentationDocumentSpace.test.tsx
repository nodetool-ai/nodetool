/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSegmentation } from "../hooks/useSegmentation";
import type { SketchCanvasRef } from "../SketchCanvas";
import { useSketchStore } from "../state";
import {
  serializeDocument,
  deserializeDocument,
  serializeLayerData
} from "../serialization";
import { createDefaultDocument, createDefaultLayer } from "../types";
import type { SegmentationSourceMetadata, SegmentationMask } from "../types";
import {
  drawMaskBoundsOverlay,
  drawMaskImageOverlay,
  generateCutoutDataUrl,
  getSamService,
  projectSegmentationMasksToDocumentSpace,
  rasterizeSegmentationToDocumentSpace
} from "../sam";

jest.mock("../sam", () => {
  const actual = jest.requireActual("../sam");
  return {
    ...actual,
    getSamService: jest.fn(),
    generateSegmentationRunId: jest.fn(() => "seg_test"),
    generateCutoutDataUrl: jest.fn(),
    drawMaskBoundsOverlay: jest.fn(),
    drawMaskImageOverlay: jest.fn().mockResolvedValue(undefined),
    projectSegmentationMasksToDocumentSpace: jest.fn(),
    rasterizeSegmentationToDocumentSpace: jest.fn()
  };
});

const getSamServiceMock = jest.mocked(getSamService);
const generateCutoutDataUrlMock = jest.mocked(generateCutoutDataUrl);
const drawMaskBoundsOverlayMock = jest.mocked(drawMaskBoundsOverlay);
const drawMaskImageOverlayMock = jest.mocked(drawMaskImageOverlay);
const projectSegmentationMasksToDocumentSpaceMock = jest.mocked(
  projectSegmentationMasksToDocumentSpace
);
const rasterizeSegmentationToDocumentSpaceMock = jest.mocked(
  rasterizeSegmentationToDocumentSpace
);

function createSourceMetadata(layerId: string): SegmentationSourceMetadata {
  return {
    layerId,
    layerTransform: {
      x: 12,
      y: 18,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    },
    contentBounds: {
      x: -8,
      y: 6,
      width: 40,
      height: 30
    },
    canvasSize: {
      width: 128,
      height: 96
    },
    documentOrigin: {
      x: 4,
      y: 24
    }
  };
}

function createMask(
  sourceMetadata: SegmentationSourceMetadata
): SegmentationMask {
  return {
    id: "mask-1",
    kind: "mask",
    label: "Mask 1",
    maskDataUrl: "data:image/png;base64,mask",
    confidence: 0.9,
    bounds: {
      x: 0,
      y: 0,
      width: 40,
      height: 30
    },
    backendId: "local-sam3",
    modelId: "facebook/sam3",
    nodeType: "huggingface.image_segmentation.MaskGeneration",
    sourceMetadata
  };
}

function createCanvasRef(layerData: string): React.RefObject<SketchCanvasRef | null> {
  return {
    current: {
      getLayerData: jest.fn().mockReturnValue(layerData),
      setLayerData: jest.fn(),
      reconcileLayerToDocumentSpace: jest.fn(),
      trimLayerToBounds: jest.fn(),
      snapshotLayerCanvas: jest.fn(),
      restoreLayerCanvas: jest.fn(),
      flattenToDataUrl: jest.fn(),
      getMaskDataUrl: jest.fn(),
      clearLayer: jest.fn(),
      clearLayerRect: jest.fn(),
      flipLayer: jest.fn(),
      mergeLayerDown: jest.fn(),
      flattenVisible: jest.fn(),
      cropCanvas: jest.fn(),
      applyAdjustments: jest.fn(),
      invertLayerColors: jest.fn(),
      fillLayerWithColor: jest.fn(),
      fillLayerRect: jest.fn(),
      clearLayerBySelectionMask: jest.fn(),
      fillLayerBySelectionMask: jest.fn(),
      nudgeLayer: jest.fn(),
      redrawDisplay: jest.fn(),
      drainPendingStrokeCommit: jest.fn(),
      getOverlayCanvas: jest.fn(),
      getPasteAnchorDocumentPoint: jest.fn(),
      cancelActiveTool: jest.fn()
    } as unknown as SketchCanvasRef
  };
}

describe("useSegmentation document-space apply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("previews document-space masks without mutating the document", async () => {
    const doc = createDefaultDocument(128, 96);
    const sourceLayer = {
      ...doc.layers[0],
      name: "Source",
      transform: {
        x: 12,
        y: 18,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      },
      contentBounds: {
        x: -8,
        y: 6,
        width: 40,
        height: 30
      }
    };
    doc.layers = [sourceLayer];
    doc.activeLayerId = sourceLayer.id;

    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const serializedLayerData = serializeLayerData(
      "data:image/png;base64,source",
      sourceLayer.contentBounds
    );
    const canvasRef = createCanvasRef(serializedLayerData);
    const pushHistory = jest.fn();
    const sourceMetadata = createSourceMetadata(sourceLayer.id);
    const mask = createMask(sourceMetadata);

    getSamServiceMock.mockReturnValue({
      checkModelAvailability: jest.fn(),
      runSegmentation: jest.fn().mockResolvedValue({
        masks: [mask],
        modelId: "facebook/sam3",
        backendId: "local-sam3",
        nodeType: "huggingface.image_segmentation.MaskGeneration",
        sourceMetadata
      })
    } as never);

    projectSegmentationMasksToDocumentSpaceMock.mockResolvedValue([
      {
        maskDataUrl: "data:image/png;base64,projected-mask",
        bounds: { x: 2, y: 3, width: 20, height: 10 },
        label: "Mask 1"
      }
    ]);

    const { result } = renderHook(() =>
      useSegmentation({
        canvasRef,
        pushHistory
      })
    );

    await act(async () => {
      await result.current.runSegmentation([], null);
    });

    const beforeLayers = useSketchStore.getState().document.layers.length;
    const overlayCtx = {
      canvas: { width: 128, height: 96 },
      clearRect: jest.fn()
    } as unknown as CanvasRenderingContext2D;

    await act(async () => {
      result.current.drawMaskPreview(overlayCtx, 1, { x: 0, y: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(projectSegmentationMasksToDocumentSpaceMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "mask-1"
      })
    ]);
    expect(drawMaskImageOverlayMock).toHaveBeenCalled();
    expect(useSketchStore.getState().document.layers).toHaveLength(beforeLayers);
    expect(pushHistory).not.toHaveBeenCalled();
    expect(drawMaskBoundsOverlayMock).not.toHaveBeenCalled();
  });

  it("applies accepted masks as ordinary raster layers with document-space bounds and provenance", async () => {
    const doc = createDefaultDocument(128, 96);
    const sourceLayer = {
      ...doc.layers[0],
      name: "Source",
      transform: {
        x: 12,
        y: 18,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      },
      contentBounds: {
        x: -8,
        y: 6,
        width: 40,
        height: 30
      }
    };
    doc.layers = [sourceLayer];
    doc.activeLayerId = sourceLayer.id;
    doc.toolSettings.segment.outputCutouts = false;

    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const serializedLayerData = serializeLayerData(
      "data:image/png;base64,source",
      sourceLayer.contentBounds
    );
    const canvasRef = createCanvasRef(serializedLayerData);
    const pushHistory = jest.fn();
    const sourceMetadata = createSourceMetadata(sourceLayer.id);
    const mask = createMask(sourceMetadata);
    const bakedData = serializeLayerData("data:image/png;base64,baked", {
      x: 5,
      y: 7,
      width: 20,
      height: 10
    });

    getSamServiceMock.mockReturnValue({
      checkModelAvailability: jest.fn(),
      runSegmentation: jest.fn().mockResolvedValue({
        masks: [mask],
        modelId: "facebook/sam3",
        backendId: "local-sam3",
        nodeType: "huggingface.image_segmentation.MaskGeneration",
        sourceMetadata
      })
    } as never);

    rasterizeSegmentationToDocumentSpaceMock.mockResolvedValue({
      data: bakedData,
      bounds: { x: 5, y: 7, width: 20, height: 10 },
      imageDataUrl: "data:image/png;base64,baked"
    });

    const { result } = renderHook(() =>
      useSegmentation({
        canvasRef,
        pushHistory
      })
    );

    await act(async () => {
      await result.current.runSegmentation([], null);
    });

    await act(async () => {
      await result.current.applyResult();
    });

    const updatedDoc = useSketchStore.getState().document;
    expect(updatedDoc.layers).toHaveLength(3);
    expect(updatedDoc.layers[1]).toMatchObject({
      type: "group",
      name: "Segmented Objects"
    });
    expect(updatedDoc.layers[2]).toMatchObject({
      type: "raster",
      name: "Mask 1",
      contentBounds: { x: 5, y: 7, width: 20, height: 10 },
      transform: expect.objectContaining({ x: 0, y: 0 })
    });
    expect(updatedDoc.layers[2].segmentationMeta).toMatchObject({
      segmentationRunId: "seg_test",
      sourceLayerId: sourceLayer.id,
      backendId: "local-sam3",
      modelId: "facebook/sam3",
      nodeType: "huggingface.image_segmentation.MaskGeneration",
      confidence: 0.9,
      maskIndex: 0
    });
    expect(rasterizeSegmentationToDocumentSpaceMock).toHaveBeenCalledWith(
      "data:image/png;base64,mask",
      sourceMetadata
    );
    expect(canvasRef.current?.setLayerData).toHaveBeenCalledWith(
      updatedDoc.layers[2].id,
      bakedData,
      { x: 5, y: 7, width: 20, height: 10 }
    );
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");

    const roundTrip = deserializeDocument(serializeDocument(updatedDoc));
    expect(roundTrip?.layers[2]).toMatchObject({
      type: "raster",
      contentBounds: { x: 5, y: 7, width: 20, height: 10 }
    });
    expect(roundTrip?.layers[2].segmentationMeta).toMatchObject({
      backendId: "local-sam3",
      nodeType: "huggingface.image_segmentation.MaskGeneration"
    });
  });

  it("uses document-space cutouts for accepted results when cutout output is enabled", async () => {
    const doc = createDefaultDocument(128, 96);
    const sourceLayer = createDefaultLayer("Source", "raster", 128, 96);
    doc.layers = [sourceLayer];
    doc.activeLayerId = sourceLayer.id;
    doc.toolSettings.segment.outputCutouts = true;

    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const serializedLayerData = serializeLayerData(
      "data:image/png;base64,source",
      { x: 0, y: 0, width: 40, height: 30 }
    );
    const canvasRef = createCanvasRef(serializedLayerData);
    const pushHistory = jest.fn();
    const sourceMetadata = createSourceMetadata(sourceLayer.id);
    const mask = createMask(sourceMetadata);

    getSamServiceMock.mockReturnValue({
      checkModelAvailability: jest.fn(),
      runSegmentation: jest.fn().mockResolvedValue({
        masks: [mask],
        modelId: "facebook/sam3",
        backendId: "local-sam3",
        nodeType: "huggingface.image_segmentation.MaskGeneration",
        sourceMetadata
      })
    } as never);

    generateCutoutDataUrlMock.mockResolvedValue("data:image/png;base64,cutout");
    rasterizeSegmentationToDocumentSpaceMock.mockResolvedValue({
      data: serializeLayerData("data:image/png;base64,cutout-baked", {
        x: 1,
        y: 2,
        width: 30,
        height: 20
      }),
      bounds: { x: 1, y: 2, width: 30, height: 20 },
      imageDataUrl: "data:image/png;base64,cutout-baked"
    });

    const { result } = renderHook(() =>
      useSegmentation({
        canvasRef,
        pushHistory
      })
    );

    await act(async () => {
      await result.current.runSegmentation([], null);
    });

    await act(async () => {
      await result.current.applyResult();
    });

    expect(generateCutoutDataUrlMock).toHaveBeenCalledWith(
      "data:image/png;base64,source",
      "data:image/png;base64,mask",
      { x: 0, y: 0, width: 40, height: 30 },
      0
    );
    expect(rasterizeSegmentationToDocumentSpaceMock).toHaveBeenCalledWith(
      "data:image/png;base64,cutout",
      sourceMetadata
    );
  });
});
