/**
 * Sketch Document Serialization
 *
 * Handles converting between SketchDocument and canvas elements,
 * as well as flattened image/mask export.
 */

import {
  SketchDocument,
  Layer,
  isLayerCompositeVisible,
  normalizeSketchDocument,
  SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
} from "../types";
import { blendModeToComposite } from "../drawingUtils";

const SERIALIZED_LAYER_DATA_PREFIX = "ntlayer:";

export type LayerRasterBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SerializedLayerData = {
  version: 1;
  image: string | null;
  bounds: LayerRasterBounds;
};

function getDefaultBounds(width: number, height: number): LayerRasterBounds {
  return { x: 0, y: 0, width, height };
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
  const payload: SerializedLayerData = {
    version: 1,
    image,
    bounds
  };
  return `${SERIALIZED_LAYER_DATA_PREFIX}${window.btoa(JSON.stringify(payload))}`;
}

export function deserializeLayerData(
  data: string | null | undefined,
  fallbackWidth: number,
  fallbackHeight: number
): {
  image: string | null;
  bounds: LayerRasterBounds;
} {
  const fallbackBounds = getDefaultBounds(fallbackWidth, fallbackHeight);
  if (!data) {
    return { image: null, bounds: fallbackBounds };
  }
  if (!data.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    return { image: data, bounds: fallbackBounds };
  }
  try {
    const decoded = JSON.parse(
      window.atob(data.slice(SERIALIZED_LAYER_DATA_PREFIX.length))
    ) as SerializedLayerData;
    return {
      image: decoded.image ?? null,
      bounds: decoded.bounds ?? fallbackBounds
    };
  } catch {
    return { image: data, bounds: fallbackBounds };
  }
}

/**
 * Serialize a SketchDocument to a JSON string
 */
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

/**
 * Deserialize a JSON string into a SketchDocument.
 * Returns a default document if parsing fails.
 */
export function deserializeDocument(
  json: string | null | undefined
): SketchDocument | null {
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as SketchDocument;
    if (
      parsed &&
      typeof parsed.version === "number" &&
      Array.isArray(parsed.layers)
    ) {
      return normalizeSketchDocument(parsed);
    }
    return null;
  } catch {
    // JSON parse failed, return null
    return null;
  }
}

/**
 * Load a base64 data URL into an HTMLCanvasElement.
 */
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
  layer: Layer
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
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode ?? "normal");
  ctx.drawImage(
    layerCanvas,
    (layer.transform?.x ?? 0) + bounds.x,
    (layer.transform?.y ?? 0) + bounds.y
  );
  ctx.restore();
}

/**
 * Flatten all visible raster layers into a single canvas.
 * Mask layers are excluded from the flattened image.
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

  // Fill background
  ctx.fillStyle = doc.canvas.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Composite visible non-mask layers bottom to top
  for (const layer of doc.layers) {
    if (!layer.data || layer.type === "mask") {
      continue;
    }
    if (!isLayerCompositeVisible(doc.layers, layer, null)) {
      continue;
    }
    await drawLayerToContext(ctx, doc, layer);
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
 * Export a canvas as a data URL (PNG).
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/**
 * Export a canvas as a Blob (PNG).
 */
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

/**
 * Load an external image URL into a layer data string (base64 data URL).
 */
export function loadImageToLayerData(
  imageUrl: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      // Scale image to fit canvas while maintaining aspect ratio
      const scale = Math.min(
        canvasWidth / img.width,
        canvasHeight / img.height
      );
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (canvasWidth - scaledWidth) / 2;
      const y = (canvasHeight - scaledHeight) / 2;
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      resolve(
        serializeLayerData(canvas.toDataURL("image/png"), {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight
        })
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

/**
 * Result type for loadImageWithDimensions.
 */
export interface ImageLoadResult {
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
