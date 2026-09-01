/**
 * Sketch Document Serialization
 *
 * Handles converting between SketchDocument and canvas elements,
 * as well as flattened image/mask export.
 */

import {
  SketchDocument,
  Layer,
  SegmentationSourceMetadata,
  cloneTransform,
  getAncestorGroupOpacityProduct,
  isAffineTransform,
  isLayerCompositeVisible,
  normalizeSketchDocument,
  SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
} from "../types";
import { blendModeToComposite } from "../drawingUtils";
import {
  decodeSketchLayerData,
  encodeSketchLayerData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { isNumber } from "../../../utils/typePredicates";

export type LayerRasterBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExportedRasterLayerSourceMetadata = SegmentationSourceMetadata;

interface ExportedRasterLayerData {
  imageDataUrl: string;
  byteLength: number;
  sourceMetadata: ExportedRasterLayerSourceMetadata;
}

function getDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return dataUrl.length;
  }
  const base64Payload = dataUrl.slice(commaIndex + 1);
  const padding =
    base64Payload.endsWith("==") ? 2 : base64Payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding);
}

function shouldStripSerializedLayerData(layer: Layer): boolean {
  if (!layer.imageReference?.uri) {
    return false;
  }

  return (
    layer.locked ||
    layer.exposedAsInput === true ||
    layer.name === SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
  );
}

export function serializeLayerData(
  image: string | null,
  bounds: LayerRasterBounds
): string {
  return encodeSketchLayerData(image, bounds);
}

export function deserializeLayerData(
  data: string | null | undefined,
  fallbackWidth: number,
  fallbackHeight: number
) {
  return decodeSketchLayerData(data, fallbackWidth, fallbackHeight);
}

export function serializeDocument(doc: SketchDocument): string {
  return JSON.stringify({
    ...doc,
    layers: doc.layers.map((layer) =>
      shouldStripSerializedLayerData(layer)
        ? {
            ...layer,
            data: null
          }
        : layer
    )
  });
}

export function deserializeDocument(
  json: string | null | undefined
): SketchDocument | null {
  if (!json) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      isNumber(parsed.version) &&
      "layers" in parsed &&
      Array.isArray(parsed.layers)
    ) {
      return normalizeSketchDocument(parsed as SketchDocument);
    }
    return null;
  } catch {
    // JSON parse failed, return null
    return null;
  }
}

export function dataUrlToCanvas(
  dataUrl: string,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to load image data"));
    img.src = dataUrl;
  });
}

async function layerDataToCanvas(
  data: string,
  fallbackWidth: number,
  fallbackHeight: number
): Promise<{
  canvas: HTMLCanvasElement;
  bounds: LayerRasterBounds;
}> {
  const decoded = deserializeLayerData(data, fallbackWidth, fallbackHeight);
  const canvas = decoded.image
    ? await dataUrlToCanvas(
        decoded.image,
        decoded.bounds.width,
        decoded.bounds.height
      )
    : document.createElement("canvas");

  if (!decoded.image) {
    canvas.width = decoded.bounds.width;
    canvas.height = decoded.bounds.height;
  }

  return {
    canvas,
    bounds: decoded.bounds
  };
}

export function getLayerDataImageUrl(
  data: string | null | undefined
): string | null {
  return deserializeLayerData(data, 1, 1).image;
}

async function drawLayerToContext(
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  layer: Layer,
  applyAncestorGroupOpacity = false
): Promise<void> {
  if (!layer.data) {
    return;
  }
  const { canvas: layerCanvas, bounds } = await layerDataToCanvas(
    layer.data,
    doc.canvas.width,
    doc.canvas.height
  );
  ctx.save();
  const ancestorOpacity = applyAncestorGroupOpacity
    ? getAncestorGroupOpacityProduct(doc.layers, layer, null)
    : 1;
  ctx.globalAlpha = layer.opacity * ancestorOpacity;
  ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode ?? "normal");
  const tx = isAffineTransform(layer.transform) ? layer.transform.x : 0;
  const ty = isAffineTransform(layer.transform) ? layer.transform.y : 0;
  ctx.drawImage(layerCanvas, tx + bounds.x, ty + bounds.y);
  ctx.restore();
}

/**
 * Flatten all visible raster layers into a single canvas.
 * Mask and group rows are excluded; the base is transparent (checkerboard in UI),
 * matching runtime flatten/export behavior (including ancestor group opacity).
 */
export async function flattenDocument(
  doc: SketchDocument
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const layer of doc.layers) {
    if (!layer.data || layer.type === "mask" || layer.type === "group") {
      continue;
    }
    if (!isLayerCompositeVisible(doc.layers, layer, null)) {
      continue;
    }
    await drawLayerToContext(ctx, doc, layer, true);
  }

  return canvas;
}

/**
 * Export the mask layer as a canvas (white on black).
 * Returns null if no mask layer exists.
 */
export async function exportMask(
  doc: SketchDocument
): Promise<HTMLCanvasElement | null> {
  const maskLayer = doc.layers.find(
    (l) => l.id === doc.maskLayerId && l.data
  );
  if (!maskLayer || !maskLayer.data) {
    return null;
  }
  if (!isLayerCompositeVisible(doc.layers, maskLayer, null)) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  await drawLayerToContext(ctx, doc, maskLayer);
  return canvas;
}

export async function exportLayer(
  doc: SketchDocument,
  layerId: string
): Promise<HTMLCanvasElement | null> {
  const layer = doc.layers.find((entry) => entry.id === layerId);
  if (!layer || !layer.data) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  await drawLayerToContext(ctx, doc, layer);
  return canvas;
}

/**
 * Export a raster layer as a PNG data URL plus the metadata that maps its
 * pixels back into document space.
 *
 * `liveData` is the layer's serialized data read straight from the runtime
 * canvas. Pass it whenever a runtime is available: a layer imported from an
 * asset carries only an `imageReference` and has `layer.data === null` until
 * something paints on it, so the document alone cannot export those pixels.
 */
export function exportSelectedRasterLayer(
  doc: SketchDocument,
  layerId: string,
  liveData?: string | null
): ExportedRasterLayerData | null {
  const layer = doc.layers.find((entry) => entry.id === layerId);
  if (!layer || layer.type !== "raster") {
    return null;
  }
  const data = liveData ?? layer.data;
  if (!data) {
    return null;
  }

  const decoded = deserializeLayerData(
    data,
    doc.canvas.width,
    doc.canvas.height
  );
  if (!decoded.image) {
    return null;
  }

  const contentBounds = {
    x: decoded.bounds.x,
    y: decoded.bounds.y,
    width: decoded.bounds.width,
    height: decoded.bounds.height
  };

  return {
    imageDataUrl: decoded.image,
    byteLength: getDataUrlByteLength(decoded.image),
    sourceMetadata: {
      layerId: layer.id,
      layerTransform: cloneTransform(layer.transform),
      contentBounds,
      canvasSize: {
        width: doc.canvas.width,
        height: doc.canvas.height
      },
      documentOrigin: {
        x: (isAffineTransform(layer.transform) ? layer.transform.x : 0) + contentBounds.x,
        y: (isAffineTransform(layer.transform) ? layer.transform.y : 0) + contentBounds.y
      }
    }
  };
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to create blob from canvas"));
      }
    }, "image/png");
  });
}

interface ImageLoadResult {
  data: string;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Load an external image and return the layer data along with the
 * natural image dimensions. Uses the image's own dimensions as the
 * canvas size so no scaling/centering is needed.
 */
export function loadImageWithDimensions(
  imageUrl: string
): Promise<ImageLoadResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({
        data: serializeLayerData(canvas.toDataURL("image/png"), {
          x: 0,
          y: 0,
          width: img.naturalWidth,
          height: img.naturalHeight
        }),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}
