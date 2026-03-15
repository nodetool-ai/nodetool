/**
 * Sketch Document Serialization
 *
 * Handles converting between SketchDocument and canvas elements,
 * as well as flattened image/mask export.
 */

import {
  SketchDocument
} from "../types";

/**
 * Serialize a SketchDocument to a JSON string
 */
export function serializeDocument(doc: SketchDocument): string {
  return JSON.stringify(doc);
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
      // Version migration could go here in the future
      return parsed;
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
    if (!layer.visible || !layer.data || layer.type === "mask") {
      continue;
    }
    ctx.globalAlpha = layer.opacity;
    const layerCanvas = await dataUrlToCanvas(
      layer.data,
      doc.canvas.width,
      doc.canvas.height
    );
    ctx.drawImage(layerCanvas, 0, 0);
  }
  ctx.globalAlpha = 1;

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

  return dataUrlToCanvas(maskLayer.data, doc.canvas.width, doc.canvas.height);
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
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}
