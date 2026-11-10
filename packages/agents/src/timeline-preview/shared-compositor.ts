import type { Canvas, Image } from "@napi-rs/canvas";
import { loadCanvas } from "@nodetool-ai/runtime";
import { drawMask, type Canvas2DLayer, type Canvas2DPrecomposite, type Canvas2DAdjustment, type MaskContext2D, type Canvas2DFrameReport } from "@nodetool-ai/timeline/scene";
import type { FrameLayer, FrameLayerPixels } from "@nodetool-ai/timeline/render";

import { createRenderChild, MAX_RENDER_BYTES, type RenderChild } from "./render-child-client.js";

type Source = Canvas | Image;
interface SharedPreviewReport extends Canvas2DFrameReport<Source> {
  effectsNotApplied: string[];
}
interface SharedPreviewCompositor {
  dispose(): Promise<void>;
  draw(canvas: Canvas, layers: Canvas2DLayer<Source>[], groups: Canvas2DPrecomposite[], adjustments: Canvas2DAdjustment[]): Promise<SharedPreviewReport>;
}

/** Acquire the optional native renderer only when a preview is requested. */
export async function createSharedPreviewCompositor(width: number, height: number, referenceWidth: number, referenceHeight: number, signal?: AbortSignal, renderChild?: RenderChild): Promise<SharedPreviewCompositor> {
  const { createCanvas } = await loadCanvas();
  if (![width, height, referenceWidth, referenceHeight].every((value) => Number.isSafeInteger(value) && value > 0) || width * height * 4 > MAX_RENDER_BYTES) throw new Error("Timeline output exceeds the 64 MiB transfer limit");
  const compositor = renderChild ?? await createRenderChild(signal);
  let frameBytes = 0;
  // Every text and shape layer is a full-frame raster, so a busy frame can
  // pass the transfer limit. Such a frame sends all its sources at one
  // smaller scale instead of failing; the renderer samples each source over
  // the same geometry, so only sharpness changes.
  let sourceScale = 1;
  const scaled = (size: number): number => Math.max(1, Math.round(size * sourceScale));
  const pixels = (source: Source): FrameLayerPixels => {
    const w = scaled(source.width), h = scaled(source.height);
    frameBytes += w * h * 4;
    if (frameBytes > MAX_RENDER_BYTES) throw new Error("Timeline sources exceed the 64 MiB transfer limit");
    const canvas = "getContext" in source && w === source.width && h === source.height ? source : createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (canvas !== source) ctx.drawImage(source, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: w, height: h };
  };
  const maskPixels = (mask: NonNullable<Canvas2DLayer<Source>["shapeMask"]>, fullW: number, fullH: number): FrameLayerPixels | undefined => {
    const w = scaled(fullW), h = scaled(fullH);
    if (frameBytes + w * h * 4 > MAX_RENDER_BYTES) throw new Error("Timeline mask exceeds the 64 MiB transfer limit");
    const canvas = createCanvas(w, h);
    // SAFETY: Skia provides the subset of Canvas2D used by the shared mask rasterizer.
    if (!drawMask(canvas.getContext("2d") as unknown as MaskContext2D, mask, w, h)) {
      return undefined;
    }
    frameBytes += w * h * 4;
    const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: w, height: h };
  };
  const layerPixels = (layer: Canvas2DLayer<Source>): FrameLayer => ({
    ...layer,
    id: layer.clipId ?? "preview-layer",
    source: pixels(layer.source),
    shapeMask: layer.shapeMask ? maskPixels(layer.shapeMask, layer.sourceWidth, layer.sourceHeight) : undefined,
    temporalSources: layer.temporalSources ? { before: pixels(layer.temporalSources.before), after: pixels(layer.temporalSources.after) } : undefined,
    matte: layer.matte ? { ...layer.matte, layer: layerPixels(layer.matte.layer) } : undefined
  });
  return {
    dispose: async (): Promise<void> => {
      if (!renderChild) {
        await compositor.dispose();
      }
    },
    async draw(canvas: Canvas, layers: Canvas2DLayer<Source>[], groups: Canvas2DPrecomposite[], adjustments: Canvas2DAdjustment[]): Promise<SharedPreviewReport> {
      signal?.throwIfAborted();
      frameBytes = 0;
      const area = (source: Source): number => source.width * source.height * 4;
      const layerBytes = (layer: Canvas2DLayer<Source>): number =>
        area(layer.source) +
        (layer.shapeMask ? layer.sourceWidth * layer.sourceHeight * 4 : 0) +
        (layer.temporalSources ? area(layer.temporalSources.before) + area(layer.temporalSources.after) : 0) +
        (layer.matte ? layerBytes(layer.matte.layer) : 0);
      const total = layers.reduce((sum, layer) => sum + layerBytes(layer), 0) +
        adjustments.reduce((sum, adjustment) => sum + (adjustment.mask ? width * height * 4 : 0), 0);
      // Leave headroom for the request's other fields and rounding.
      const budget = MAX_RENDER_BYTES * 0.9;
      sourceScale = total > budget ? Math.sqrt(budget / total) : 1;
      const result = await compositor.render({ width, height, referenceWidth, referenceHeight, layers: layers.map(layerPixels), groups, adjustments: adjustments.map((adjustment) => ({
        ...adjustment,
        id: adjustment.clipId ?? "preview-adjustment",
        shapeMask: adjustment.mask ? maskPixels(adjustment.mask, width, height) : undefined
      })) });
      const rgba = result.pixels;
      if (rgba.length !== width * height * 4) throw new Error("Timeline renderer returned the wrong frame size");
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(width, height);
      image.data.set(rgba);
      ctx.putImageData(image, 0, 0);
      const skipped = new Set(result.skippedLayerIds);
      return { effectsNotApplied: result.effectsNotApplied, skipped: layers.filter(layer => skipped.has(layer.clipId ?? "preview-layer")), degraded: [] };
    }
  };
}
