import type { Canvas, Image } from "@napi-rs/canvas";
import { loadCanvas } from "@nodetool-ai/runtime";
import { drawMask, type Canvas2DLayer, type Canvas2DPrecomposite, type Canvas2DAdjustment, type MaskContext2D } from "@nodetool-ai/timeline/scene";
import type { FrameLayer, FrameLayerPixels } from "@nodetool-ai/timeline/render";

import { createRenderChild, MAX_RENDER_BYTES } from "./render-child-client.js";

type Source = Canvas | Image;

/** Acquire the optional native renderer only when a preview is requested. */
export async function createSharedPreviewCompositor(width: number, height: number, referenceWidth: number, referenceHeight: number, signal?: AbortSignal) {
  const { createCanvas } = await loadCanvas();
  if (![width, height, referenceWidth, referenceHeight].every((value) => Number.isSafeInteger(value) && value > 0) || width * height * 4 > MAX_RENDER_BYTES) throw new Error("Timeline output exceeds the 64 MiB transfer limit");
  const compositor = await createRenderChild(signal);
  let frameBytes = 0;
  const pixels = (source: Source): FrameLayerPixels => {
    frameBytes += source.width * source.height * 4;
    if (frameBytes > MAX_RENDER_BYTES) throw new Error("Timeline sources exceed the 64 MiB transfer limit");
    const canvas = "getContext" in source ? source : createCanvas(source.width, source.height);
    const ctx = canvas.getContext("2d");
    if (canvas !== source) ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, source.width, source.height).data;
    return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: source.width, height: source.height };
  };
  const maskPixels = (mask: NonNullable<Canvas2DLayer<Source>["shapeMask"]>, w: number, h: number): FrameLayerPixels => {
    if (frameBytes + w * h * 4 > MAX_RENDER_BYTES) throw new Error("Timeline mask exceeds the 64 MiB transfer limit");
    const canvas = createCanvas(w, h);
    // SAFETY: Skia provides the subset of Canvas2D used by the shared mask rasterizer.
    drawMask(canvas.getContext("2d") as unknown as MaskContext2D, mask, w, h);
    return pixels(canvas);
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
    dispose: (): Promise<void> => compositor.dispose(),
    async draw(canvas: Canvas, layers: Canvas2DLayer<Source>[], groups: Canvas2DPrecomposite[], adjustments: Canvas2DAdjustment[]) {
      signal?.throwIfAborted();
      frameBytes = 0;
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
