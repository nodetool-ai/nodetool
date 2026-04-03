/**
 * cloneRendering.ts
 *
 * Clone stamp rendering: paints source pixels to the destination canvas
 * with a radial gradient opacity mask. Handles transparent source correctly
 * using premultiplied-alpha blending.
 */

import type { Point, CloneStampSettings } from "../types";

// ─── Module-level cache ─────────────────────────────────────────────────────

const cloneMaskCache = new Map<string, Uint8ClampedArray>();

// ─── Clone Stamp Stroke ──────────────────────────────────────────────────────

export function drawCloneStampStroke(
  from: Point,
  to: Point,
  settings: CloneStampSettings,
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  offset: Point
): void {
  const r = settings.size / 2;
  const opacity = settings.opacity;
  const hardness = settings.hardness;
  const diameter = Math.ceil(settings.size);
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) {
    return;
  }

  const getCloneMaskData = (): Uint8ClampedArray => {
    const cacheKey = [
      diameter,
      Math.round(hardness * 1000),
      Math.round(opacity * 1000)
    ].join(":");
    const cached = cloneMaskCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const maskCanvas = window.document.createElement("canvas");
    maskCanvas.width = diameter;
    maskCanvas.height = diameter;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) {
      return new Uint8ClampedArray(diameter * diameter * 4);
    }
    const innerStop = Math.max(0, hardness);
    const grad = maskCtx.createRadialGradient(
      diameter / 2, diameter / 2, 0,
      diameter / 2, diameter / 2, diameter / 2
    );
    grad.addColorStop(0, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(innerStop, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = grad;
    maskCtx.fillRect(0, 0, diameter, diameter);
    const maskData = new Uint8ClampedArray(
      maskCtx.getImageData(0, 0, diameter, diameter).data
    );
    cloneMaskCache.set(cacheKey, maskData);
    return maskData;
  };

  const maskData = getCloneMaskData();

  const stampPoint = (point: Point) => {
    // Source coordinates = paint point + offset
    const sx = point.x + offset.x;
    const sy = point.y + offset.y;

    const px = Math.round(point.x - r);
    const py = Math.round(point.y - r);
    const srcPx = Math.round(sx - r);
    const srcPy = Math.round(sy - r);

    // Skip if source region is completely outside the canvas
    if (
      srcPx + diameter < 0 ||
      srcPx >= sourceCanvas.width ||
      srcPy + diameter < 0 ||
      srcPy >= sourceCanvas.height
    ) {
      return;
    }

    // Pixel-level lerp: result = dst*(1-t) + src*t  (premultiplied alpha)
    // This correctly copies source transparency — transparent source erases destination.
    const srcData  = srcCtx.getImageData(srcPx, srcPy, diameter, diameter).data;
    const dstID    = ctx.getImageData(px, py, diameter, diameter);
    const dstData  = dstID.data;

    for (let i = 0; i < dstData.length; i += 4) {
      const t = maskData[i + 3] / 255; // blend factor from gradient
      if (t <= 0) {
        continue;
      }

      const srcA = srcData[i + 3] / 255;
      const dstA = dstData[i + 3] / 255;
      const outA = srcA * t + dstA * (1 - t);

      dstData[i + 3] = Math.round(outA * 255);

      if (outA > 0) {
        // Un-premultiply source and destination, then lerp
        const sR = (srcData[i]     / 255) * srcA;
        const sG = (srcData[i + 1] / 255) * srcA;
        const sB = (srcData[i + 2] / 255) * srcA;
        const dR = (dstData[i]     / 255) * dstA;
        const dG = (dstData[i + 1] / 255) * dstA;
        const dB = (dstData[i + 2] / 255) * dstA;
        dstData[i]     = Math.round(((sR * t + dR * (1 - t)) / outA) * 255);
        dstData[i + 1] = Math.round(((sG * t + dG * (1 - t)) / outA) * 255);
        dstData[i + 2] = Math.round(((sB * t + dB * (1 - t)) / outA) * 255);
      }
    }

    ctx.putImageData(dstID, px, py);
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(1.5, settings.size * 0.25);
  const steps = Math.max(1, Math.ceil(distance / spacing));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    stampPoint({
      x: from.x + dx * t,
      y: from.y + dy * t
    });
  }
}
