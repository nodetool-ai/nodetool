/**
 * The per-layer draw rules of the sketch compositor.
 *
 * The editor's Canvas2D runtime composites through these, and so does the
 * headless renderer (`document.ts`), so a layer's visibility, opacity,
 * placement, transform and effects come out the same in both hosts.
 */

import type {
  RenderBounds,
  RenderContext2D,
  RenderImageFit,
  RenderLayerEffect,
  RenderLayerTransform,
  RenderPoint,
  RenderQuad
} from "./types.js";

/** Maximum group nesting walked, so a parent cycle in corrupt data ends. */
const MAX_LAYER_DEPTH = 20;

interface StackLayer {
  id: string;
  type: string;
  visible: boolean;
  opacity: number;
  parentId?: string | null;
}

function parentOf<T extends StackLayer>(
  layers: readonly T[],
  layer: T,
  layerMap: ReadonlyMap<string, T> | undefined
): T | undefined {
  const parentId = layer.parentId;
  if (!parentId) {
    return undefined;
  }
  return layerMap
    ? layerMap.get(parentId)
    : layers.find((candidate) => candidate.id === parentId);
}

/**
 * Whether a layer is drawn in the flat composite: it and every ancestor group
 * are visible. Hiding a group hides its descendants without changing their
 * own `visible` flags. An isolated layer is always drawn, so solo view shows
 * a hidden layer's pixels.
 */
export function isLayerCompositeVisible<T extends StackLayer>(
  layers: readonly T[],
  layer: T,
  isolatedLayerId: string | null | undefined,
  layerMap?: ReadonlyMap<string, T>
): boolean {
  if (isolatedLayerId && layer.id === isolatedLayerId) {
    return true;
  }
  if (!layer.visible) {
    return false;
  }
  let current: T = layer;
  let depth = 0;
  while (current.parentId) {
    if (depth++ > MAX_LAYER_DEPTH) {
      break;
    }
    const parent = parentOf(layers, current, layerMap);
    if (!parent || !parent.visible) {
      return false;
    }
    current = parent;
  }
  return true;
}

/**
 * Product of every ancestor group's opacity, multiplied into the layer's own
 * when it is composited. An isolated layer is not dimmed by its folders.
 */
export function getAncestorGroupOpacityProduct<T extends StackLayer>(
  layers: readonly T[],
  layer: T,
  isolatedLayerId: string | null | undefined,
  layerMap?: ReadonlyMap<string, T>
): number {
  if (isolatedLayerId && layer.id === isolatedLayerId) {
    return 1;
  }
  let product = 1;
  let current: T = layer;
  let depth = 0;
  while (current.parentId && depth++ <= MAX_LAYER_DEPTH) {
    const parent = parentOf(layers, current, layerMap);
    if (!parent) {
      break;
    }
    if (parent.type === "group") {
      product *= parent.opacity;
    }
    current = parent;
  }
  return product;
}

function quadExtents(quad: RenderQuad) {
  return {
    x: Math.min(quad[0].x, quad[1].x, quad[2].x, quad[3].x),
    y: Math.min(quad[0].y, quad[1].y, quad[2].y, quad[3].y)
  };
}

/** Document-space top-left where a layer's raster is drawn. */
export function computeCompositeOffset(
  transform: RenderLayerTransform,
  rasterBounds: RenderBounds
): RenderPoint {
  switch (transform.kind) {
    case "affine":
      return {
        x: transform.x + rasterBounds.x,
        y: transform.y + rasterBounds.y
      };
    case "quad":
      return quadExtents(transform.quad);
  }
}

/**
 * Where to draw a `srcW`×`srcH` image inside a `dstW`×`dstH` layer so it
 * honors an image reference's fit. With no fit the image keeps its own size
 * at the origin, as a layer's own serialized raster does.
 */
export function fitImageRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: RenderImageFit | undefined
): RenderBounds {
  if (!fit || srcW <= 0 || srcH <= 0) {
    return { x: 0, y: 0, width: srcW, height: srcH };
  }
  if (fit === "fill") {
    return { x: 0, y: 0, width: dstW, height: dstH };
  }
  const pick = fit === "contain" ? Math.min : Math.max;
  const scale = pick(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
}

type Triangle = readonly [RenderPoint, RenderPoint, RenderPoint];

function triangleTransform(
  src: Triangle,
  dst: Triangle
): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(det) <= 1e-6) {
    return null;
  }
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

function drawImageTriangle(
  ctx: RenderContext2D,
  source: unknown,
  src: Triangle,
  dst: Triangle
): void {
  const transform = triangleTransform(src, dst);
  if (!transform) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst[0].x, dst[0].y);
  ctx.lineTo(dst[1].x, dst[1].y);
  ctx.lineTo(dst[2].x, dst[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(...transform);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

/** Draw `source` warped onto a document-space quad as two affine triangles. */
export function drawImageToQuad(
  ctx: RenderContext2D,
  source: { width: number; height: number },
  quad: RenderQuad
): void {
  const tl = { x: 0, y: 0 };
  const tr = { x: source.width, y: 0 };
  const br = { x: source.width, y: source.height };
  const bl = { x: 0, y: source.height };
  drawImageTriangle(ctx, source, [tl, tr, br], [quad[0], quad[1], quad[2]]);
  drawImageTriangle(ctx, source, [tl, br, bl], [quad[0], quad[2], quad[3]]);
}

/**
 * Draw a layer raster into `ctx` at its composite offset, applying the layer
 * transform. `drawable` is what is actually sampled at `source`'s size: a
 * vector layer passes its decoded SVG so a scaled draw redraws the geometry
 * instead of magnifying the buffer.
 */
export function drawWithTransform(
  ctx: RenderContext2D,
  source: { width: number; height: number },
  compositeOffset: RenderPoint,
  transform: RenderLayerTransform,
  drawable: unknown = source
): void {
  switch (transform.kind) {
    case "quad":
      drawImageToQuad(ctx, source, transform.quad);
      return;
    case "affine": {
      const { scaleX, scaleY, rotation } = transform;
      if (scaleX !== 1 || scaleY !== 1 || rotation !== 0) {
        ctx.translate(
          compositeOffset.x + source.width / 2,
          compositeOffset.y + source.height / 2
        );
        ctx.rotate(rotation);
        ctx.scale(scaleX, scaleY);
        if (drawable === source) {
          ctx.drawImage(source, -source.width / 2, -source.height / 2);
        } else {
          ctx.drawImage(
            drawable,
            -source.width / 2,
            -source.height / 2,
            source.width,
            source.height
          );
        }
      } else if (drawable === source) {
        ctx.drawImage(source, compositeOffset.x, compositeOffset.y);
      } else {
        ctx.drawImage(
          drawable,
          compositeOffset.x,
          compositeOffset.y,
          source.width,
          source.height
        );
      }
      return;
    }
  }
}

/** Whether any effect in the stack is switched on. */
export function hasEnabledEffects(
  effects: readonly RenderLayerEffect[] | null | undefined
): boolean {
  return !!effects && effects.some((effect) => effect.enabled);
}

/**
 * The CSS filter chain that evaluates a layer's effect stack, or null when no
 * enabled effect changes anything.
 */
export function layerEffectsFilter(
  effects: readonly RenderLayerEffect[] | null | undefined
): string | null {
  if (!effects) {
    return null;
  }
  const parts: string[] = [];
  for (const effect of effects) {
    if (!effect.enabled) {
      continue;
    }
    switch (effect.type) {
      case "brightness_contrast": {
        const { brightness, contrast } = effect.params;
        if (brightness !== 0) {
          parts.push(`brightness(${1 + brightness})`);
        }
        if (contrast !== 0) {
          parts.push(`contrast(${1 + contrast})`);
        }
        break;
      }
      case "hue_saturation": {
        const { hueDegrees, saturation, lightness } = effect.params;
        if (hueDegrees !== 0) {
          parts.push(`hue-rotate(${hueDegrees}deg)`);
        }
        if (saturation !== 0) {
          parts.push(`saturate(${1 + saturation})`);
        }
        if (lightness !== 0) {
          parts.push(`brightness(${1 + lightness})`);
        }
        break;
      }
      case "exposure": {
        const { exposureStops } = effect.params;
        if (exposureStops !== 0) {
          parts.push(`brightness(${Math.pow(2, exposureStops)})`);
        }
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
