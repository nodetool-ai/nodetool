import type { LayerContentBounds, SegmentationMask, SegmentationSourceMetadata } from "../types";
import { createDefaultDocument, createDefaultLayer } from "../types";
import { setCanvasRasterBounds } from "../painting/layerBounds";
import { dataUrlToCanvas, deserializeLayerData } from "../serialization";
import { reconcileLayerToDocumentSpace } from "../rendering/canvas2d/reconcile";

export interface DocumentSpaceSegmentationRaster {
  data: string;
  bounds: LayerContentBounds;
  imageDataUrl: string | null;
}

export async function rasterizeSegmentationToDocumentSpace(
  rasterSource: string,
  sourceMetadata: SegmentationSourceMetadata
): Promise<DocumentSpaceSegmentationRaster> {
  const sourceCanvas = await dataUrlToCanvas(
    rasterSource,
    sourceMetadata.contentBounds.width,
    sourceMetadata.contentBounds.height
  );

  setCanvasRasterBounds(sourceCanvas, sourceMetadata.contentBounds);

  const layer = createDefaultLayer(
    "Segmentation Raster",
    "raster",
    sourceCanvas.width,
    sourceCanvas.height
  );
  layer.id = "segmentation-raster";
  layer.transform = { ...sourceMetadata.layerTransform };
  layer.contentBounds = { ...sourceMetadata.contentBounds };

  const doc = createDefaultDocument(
    sourceMetadata.canvasSize.width,
    sourceMetadata.canvasSize.height
  );
  doc.layers = [layer];
  doc.activeLayerId = layer.id;

  const serialized = reconcileLayerToDocumentSpace(
    layer.id,
    doc,
    new Map([[layer.id, sourceCanvas]])
  );

  if (!serialized) {
    throw new Error("Failed to rasterize segmentation result in document space");
  }

  const decoded = deserializeLayerData(
    serialized,
    sourceMetadata.canvasSize.width,
    sourceMetadata.canvasSize.height
  );

  return {
    data: serialized,
    bounds: decoded.bounds,
    imageDataUrl: decoded.image
  };
}

export async function projectSegmentationMasksToDocumentSpace(
  masks: ReadonlyArray<SegmentationMask>
): Promise<Array<{
  maskDataUrl: string;
  bounds: LayerContentBounds;
  label?: string;
}>> {
  const projectedMasks = await Promise.all(
    masks.map(async (mask) => {
      if (!mask.sourceMetadata || !mask.maskDataUrl) {
        return {
          maskDataUrl: mask.maskDataUrl,
          bounds: mask.bounds,
          label: mask.label
        };
      }

      const projected = await rasterizeSegmentationToDocumentSpace(
        mask.maskDataUrl,
        mask.sourceMetadata
      );

      return {
        maskDataUrl: projected.imageDataUrl ?? "",
        bounds: projected.bounds,
        label: mask.label
      };
    })
  );

  return projectedMasks;
}
