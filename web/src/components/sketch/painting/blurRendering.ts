/**
 * blurRendering.ts
 *
 * Blur stroke rendering using separable box blur with a radial brush
 * influence mask. Operates in premultiplied-alpha space for correct
 * blending of semi-transparent regions.
 */

import type { Point, BlurSettings } from "../types";
import type { DirtyRectTracker, BlurTempCanvases } from "../rendering/canvasUtils";
import { stampAlongStroke, expandDirtyRectFromPoints } from "./strokeRendering";

// ─── Scratch buffers & caches ───────────────────────────────────────────────

type BlurScratchBuffers = {
  capacity: number;
  influence: Float32Array;
  alpha: Float32Array;
  premultR: Float32Array;
  premultG: Float32Array;
  premultB: Float32Array;
  blurredA: Float32Array;
  blurredR: Float32Array;
  blurredG: Float32Array;
  blurredB: Float32Array;
  tempA: Float32Array;
  tempB: Float32Array;
  output: Uint8ClampedArray;
};

const blurScratch: BlurScratchBuffers = {
  capacity: 0,
  influence: new Float32Array(0),
  alpha: new Float32Array(0),
  premultR: new Float32Array(0),
  premultG: new Float32Array(0),
  premultB: new Float32Array(0),
  blurredA: new Float32Array(0),
  blurredR: new Float32Array(0),
  blurredG: new Float32Array(0),
  blurredB: new Float32Array(0),
  tempA: new Float32Array(0),
  tempB: new Float32Array(0),
  output: new Uint8ClampedArray(0)
};

const blurBrushMaskCache = new Map<string, Float32Array>();
const blurOutputImageDataCache = new Map<string, ImageData>();

// ─── Private helpers ────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getBlurBrushMask(radius: number): {
  diameter: number;
  radius: number;
  data: Float32Array;
} {
  const safeRadius = Math.max(1, radius);
  const diameter = Math.max(1, Math.ceil(safeRadius * 2));
  const cacheKey = `${diameter}`;
  const cached = blurBrushMaskCache.get(cacheKey);
  if (cached) {
    return { diameter, radius: safeRadius, data: cached };
  }
  const center = diameter / 2;
  const innerRadius = safeRadius * 0.2;
  const data = new Float32Array(diameter * diameter);
  for (let y = 0; y < diameter; y++) {
    for (let x = 0; x < diameter; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const dist = Math.hypot(dx, dy);
      if (dist >= safeRadius) {
        continue;
      }
      data[y * diameter + x] =
        dist <= innerRadius ? 1 : 1 - smoothstep(innerRadius, safeRadius, dist);
    }
  }
  blurBrushMaskCache.set(cacheKey, data);
  return { diameter, radius: safeRadius, data };
}

function ensureBlurScratchCapacity(pixelCount: number): BlurScratchBuffers {
  if (blurScratch.capacity >= pixelCount) {
    return blurScratch;
  }
  blurScratch.capacity = pixelCount;
  blurScratch.influence = new Float32Array(pixelCount);
  blurScratch.alpha = new Float32Array(pixelCount);
  blurScratch.premultR = new Float32Array(pixelCount);
  blurScratch.premultG = new Float32Array(pixelCount);
  blurScratch.premultB = new Float32Array(pixelCount);
  blurScratch.blurredA = new Float32Array(pixelCount);
  blurScratch.blurredR = new Float32Array(pixelCount);
  blurScratch.blurredG = new Float32Array(pixelCount);
  blurScratch.blurredB = new Float32Array(pixelCount);
  blurScratch.tempA = new Float32Array(pixelCount);
  blurScratch.tempB = new Float32Array(pixelCount);
  blurScratch.output = new Uint8ClampedArray(pixelCount * 4);
  return blurScratch;
}

function boxBlurHorizontalInto(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const sampleX = Math.max(0, Math.min(width - 1, i));
      sum += source[rowOffset + sampleX];
    }
    target[rowOffset] = sum / windowSize;
    for (let x = 1; x < width; x++) {
      const addX = Math.min(width - 1, x + radius);
      const removeX = Math.max(0, x - radius - 1);
      sum += source[rowOffset + addX] - source[rowOffset + removeX];
      target[rowOffset + x] = sum / windowSize;
    }
  }
}

function boxBlurVerticalInto(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const windowSize = radius * 2 + 1;
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const sampleY = Math.max(0, Math.min(height - 1, i));
      sum += source[sampleY * width + x];
    }
    target[x] = sum / windowSize;
    for (let y = 1; y < height; y++) {
      const addY = Math.min(height - 1, y + radius);
      const removeY = Math.max(0, y - radius - 1);
      sum += source[addY * width + x] - source[removeY * width + x];
      target[y * width + x] = sum / windowSize;
    }
  }
}

function applySeparableBoxBlurInto(
  source: Float32Array,
  target: Float32Array,
  tempA: Float32Array,
  tempB: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes: number
): void {
  if (radius <= 0 || passes <= 0) {
    target.set(source.subarray(0, width * height));
    return;
  }
  let currentSource = source;
  let horizontalTarget = tempA;
  for (let pass = 0; pass < passes; pass++) {
    boxBlurHorizontalInto(currentSource, horizontalTarget, width, height, radius);
    const verticalTarget = pass === passes - 1 ? target : tempB;
    boxBlurVerticalInto(horizontalTarget, verticalTarget, width, height, radius);
    currentSource = verticalTarget;
    horizontalTarget = horizontalTarget === tempA ? tempB : tempA;
  }
}

function getBlurOutputImageData(width: number, height: number): ImageData {
  const cacheKey = `${width}x${height}`;
  const cached = blurOutputImageDataCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const created = new ImageData(width, height);
  blurOutputImageDataCache.set(cacheKey, created);
  return created;
}

function getEffectiveBlurSettings(strength: number): {
  radius: number;
  blend: number;
  passes: number;
} {
  const normalized = Math.max(0, Math.min(1, (strength - 1) / 19));
  const radius = Math.max(1, 1 + Math.round(Math.pow(normalized, 1.5) * 7));
  const blend = 0.18 + normalized * 0.58;
  const passes = radius >= 7 ? 2 : 1;
  return { radius, blend, passes };
}

// ─── Blur Stroke ─────────────────────────────────────────────────────────────

export function drawBlurStroke(
  from: Point,
  to: Point,
  settings: BlurSettings,
  layerCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  dirtyRect: DirtyRectTracker,
  _blurTempCanvases: BlurTempCanvases
): void {
  const targetCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetCtx) {
    return;
  }

  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) {
    return;
  }
  const brushRadius = Math.max(1, settings.size / 2);
  const effectiveBlur = getEffectiveBlurSettings(settings.strength);
  const blurRadius = effectiveBlur.radius;
  if (blurRadius <= 0) {
    expandDirtyRectFromPoints(dirtyRect, from, to, Math.max(2, brushRadius + 2));
    return;
  }
  const patchPad = Math.ceil(brushRadius + blurRadius * 2);
  const minX = Math.min(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxX = Math.max(from.x, to.x);
  const maxY = Math.max(from.y, to.y);
  const sx = Math.max(0, Math.floor(minX - patchPad));
  const sy = Math.max(0, Math.floor(minY - patchPad));
  const ex = Math.min(layerCanvas.width, Math.ceil(maxX + patchPad));
  const ey = Math.min(layerCanvas.height, Math.ceil(maxY + patchPad));
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw <= 0 || sh <= 0) {
    return;
  }

  const sourceImage = sourceCtx.getImageData(sx, sy, sw, sh);
  const sourceData = sourceImage.data;
  const pixelCount = sw * sh;
  const scratch = ensureBlurScratchCapacity(pixelCount);
  const influence = scratch.influence.subarray(0, pixelCount);
  influence.fill(0);
  const blurBrushMask = getBlurBrushMask(brushRadius);

  const stampInfluence = (cx: number, cy: number) => {
    const startX = Math.max(0, Math.floor(cx - blurBrushMask.radius));
    const startY = Math.max(0, Math.floor(cy - blurBrushMask.radius));
    const endX = Math.min(sw, Math.ceil(cx + blurBrushMask.radius));
    const endY = Math.min(sh, Math.ceil(cy + blurBrushMask.radius));
    for (let y = startY; y < endY; y++) {
      const maskY = Math.floor(y - (cy - blurBrushMask.radius));
      for (let x = startX; x < endX; x++) {
        const maskX = Math.floor(x - (cx - blurBrushMask.radius));
        if (
          maskX < 0 ||
          maskY < 0 ||
          maskX >= blurBrushMask.diameter ||
          maskY >= blurBrushMask.diameter
        ) {
          continue;
        }
        const maskValue =
          blurBrushMask.data[maskY * blurBrushMask.diameter + maskX];
        if (maskValue <= 0) {
          continue;
        }
        const index = y * sw + x;
        influence[index] = Math.max(influence[index], maskValue);
      }
    }
  };

  const localFrom = { x: from.x - sx, y: from.y - sy };
  const localTo = { x: to.x - sx, y: to.y - sy };
  const spacing = Math.max(1.25, settings.size * 0.18);
  stampAlongStroke(localFrom, localTo, spacing, stampInfluence);
  const alpha = scratch.alpha.subarray(0, pixelCount);
  const premultR = scratch.premultR.subarray(0, pixelCount);
  const premultG = scratch.premultG.subarray(0, pixelCount);
  const premultB = scratch.premultB.subarray(0, pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const dataIndex = i * 4;
    const a = sourceData[dataIndex + 3] / 255;
    alpha[i] = a;
    premultR[i] = (sourceData[dataIndex] / 255) * a;
    premultG[i] = (sourceData[dataIndex + 1] / 255) * a;
    premultB[i] = (sourceData[dataIndex + 2] / 255) * a;
  }
  const blurredA = scratch.blurredA.subarray(0, pixelCount);
  const blurredR = scratch.blurredR.subarray(0, pixelCount);
  const blurredG = scratch.blurredG.subarray(0, pixelCount);
  const blurredB = scratch.blurredB.subarray(0, pixelCount);
  const tempA = scratch.tempA.subarray(0, pixelCount);
  const tempB = scratch.tempB.subarray(0, pixelCount);
  applySeparableBoxBlurInto(
    alpha,
    blurredA,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultR,
    blurredR,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultG,
    blurredG,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultB,
    blurredB,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );

  const output = scratch.output.subarray(0, sourceData.length);
  output.set(sourceData);
  for (let i = 0; i < pixelCount; i++) {
    const t = influence[i] * effectiveBlur.blend;
    if (t <= 0) {
      continue;
    }
    const dataIndex = i * 4;
    const originalA = alpha[i];
    const originalR = premultR[i];
    const originalG = premultG[i];
    const originalB = premultB[i];
    const outA = originalA + (blurredA[i] - originalA) * t;
    const outR = originalR + (blurredR[i] - originalR) * t;
    const outG = originalG + (blurredG[i] - originalG) * t;
    const outB = originalB + (blurredB[i] - originalB) * t;

    output[dataIndex + 3] = Math.round(Math.max(0, Math.min(1, outA)) * 255);
    if (outA > 1e-6) {
      output[dataIndex] = Math.round(
        Math.max(0, Math.min(1, outR / outA)) * 255
      );
      output[dataIndex + 1] = Math.round(
        Math.max(0, Math.min(1, outG / outA)) * 255
      );
      output[dataIndex + 2] = Math.round(
        Math.max(0, Math.min(1, outB / outA)) * 255
      );
    } else {
      output[dataIndex] = 0;
      output[dataIndex + 1] = 0;
      output[dataIndex + 2] = 0;
    }
  }
  const outputImageData = getBlurOutputImageData(sw, sh);
  outputImageData.data.set(output);
  targetCtx.putImageData(outputImageData, sx, sy);
  expandDirtyRectFromPoints(
    dirtyRect,
    from,
    to,
    Math.max(2, brushRadius + blurRadius + 2)
  );
}
