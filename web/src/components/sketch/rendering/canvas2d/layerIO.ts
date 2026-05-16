/**
 * layerIO – Layer serialization, deserialization, and content detection.
 *
 * Pure functions that encode/decode layer raster data for persistence
 * (undo history, clipboard, server round-trips) and detect non-transparent
 * pixel bounds for compact PNG encoding.
 */

import type { LayerContentBounds } from "../../types";
import { getCanvasRasterBounds } from "../../transform/geometry/layerGeometry";

// ─── Constants & helper types ────────────────────────────────────────────────

export const SERIALIZED_LAYER_DATA_PREFIX = "ntlayer:";

export type SerializedLayerData = {
  version: 1;
  image: string | null;
  bounds: LayerContentBounds;
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function getDefaultRasterBounds(
  bounds: LayerContentBounds
): LayerContentBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  };
}

export function serializeLayerData(
  image: string | null,
  bounds: LayerContentBounds
): string {
  const payload: SerializedLayerData = {
    version: 1,
    image,
    bounds: getDefaultRasterBounds(bounds)
  };
  return `${SERIALIZED_LAYER_DATA_PREFIX}${window.btoa(JSON.stringify(payload))}`;
}

export function deserializeLayerData(
  data: string | null,
  fallbackBounds: LayerContentBounds
): {
  image: string | null;
  bounds: LayerContentBounds;
} {
  if (!data) {
    return { image: null, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
  if (!data.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    return { image: data, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
  try {
    const payload = JSON.parse(
      window.atob(data.slice(SERIALIZED_LAYER_DATA_PREFIX.length))
    ) as Partial<SerializedLayerData>;
    return {
      image: typeof payload.image === "string" ? payload.image : null,
      bounds: getDefaultRasterBounds({
        x: payload.bounds?.x ?? fallbackBounds.x,
        y: payload.bounds?.y ?? fallbackBounds.y,
        width: payload.bounds?.width ?? fallbackBounds.width,
        height: payload.bounds?.height ?? fallbackBounds.height
      })
    };
  } catch {
    // Malformed serialized layer data — return empty raster with default bounds
    return { image: null, bounds: getDefaultRasterBounds(fallbackBounds) };
  }
}

// ─── Content detection ───────────────────────────────────────────────────────

/**
 * Find the bounding rect of all non-transparent pixels in the canvas.
 *
 * To keep this fast regardless of canvas size, we draw the layer into a
 * small proxy canvas (max PROXY_MAX × PROXY_MAX) and scan that instead.
 * The result is scaled back to full-canvas coordinates and padded by one
 * proxy pixel (= one scale-factor worth of real pixels) so no visible
 * content is ever excluded. Returns null if the canvas is empty.
 */
export function findContentRect(
  canvas: HTMLCanvasElement
): { x: number; y: number; width: number; height: number } | null {
  if (canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const PROXY_MAX = 128;
  const scaleX = canvas.width / PROXY_MAX;
  const scaleY = canvas.height / PROXY_MAX;
  const pw = Math.min(canvas.width, PROXY_MAX);
  const ph = Math.min(canvas.height, PROXY_MAX);

  const proxy = window.document.createElement("canvas");
  proxy.width = pw;
  proxy.height = ph;
  const proxyCtx = proxy.getContext("2d", { willReadFrequently: true });
  if (!proxyCtx) {
    return null;
  }
  proxyCtx.drawImage(canvas, 0, 0, pw, ph);

  const imageData = proxyCtx.getImageData(0, 0, pw, ph);
  const data = imageData.data;

  let minX = pw,
    minY = ph,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < ph; y++) {
    const rowBase = y * pw;
    for (let x = 0; x < pw; x++) {
      if (data[(rowBase + x) * 4 + 3] !== 0) {
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }

  if (maxX < 0) {
    return null; // all transparent
  }

  // Scale back to full-canvas coordinates, padded by one proxy-pixel each
  // side to account for sub-pixel content the downscale may have blurred.
  const padX = Math.ceil(scaleX);
  const padY = Math.ceil(scaleY);
  const fx = Math.max(0, Math.floor(minX * scaleX) - padX);
  const fy = Math.max(0, Math.floor(minY * scaleY) - padY);
  const fx2 = Math.min(canvas.width, Math.ceil((maxX + 1) * scaleX) + padX);
  const fy2 = Math.min(canvas.height, Math.ceil((maxY + 1) * scaleY) + padY);
  return { x: fx, y: fy, width: fx2 - fx, height: fy2 - fy };
}

// ─── Layer data readback ─────────────────────────────────────────────────────

/**
 * Read back layer raster data as a serialized string, using compact encoding
 * when the non-transparent content is significantly smaller than the full canvas.
 */
export function getLayerDataFromCanvas(
  canvas: HTMLCanvasElement
): string | null {
  const fullBounds = getCanvasRasterBounds(canvas) ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  };

  // Find the actual non-transparent content rect so we store a compact,
  // content-sized PNG instead of the full (often doc-sized) canvas.
  const contentRect = findContentRect(canvas);
  if (!contentRect) {
    // Empty layer — store a 1×1 null image at the canvas origin.
    return serializeLayerData(null, {
      x: fullBounds.x,
      y: fullBounds.y,
      width: 1,
      height: 1
    });
  }

  const contentBounds = {
    x: fullBounds.x + contentRect.x,
    y: fullBounds.y + contentRect.y,
    width: contentRect.width,
    height: contentRect.height
  };

  // Only crop when it meaningfully reduces the encoded area (>10% reduction).
  const originalArea = canvas.width * canvas.height;
  const contentArea = contentRect.width * contentRect.height;
  if (contentArea >= originalArea * 0.9) {
    return serializeLayerData(canvas.toDataURL("image/png"), fullBounds);
  }

  // Encode only the content region.
  const cropped = window.document.createElement("canvas");
  cropped.width = contentRect.width;
  cropped.height = contentRect.height;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) {
    return serializeLayerData(canvas.toDataURL("image/png"), fullBounds);
  }
  croppedCtx.drawImage(canvas, -contentRect.x, -contentRect.y);
  return serializeLayerData(cropped.toDataURL("image/png"), contentBounds);
}
