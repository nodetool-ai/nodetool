import type { Canvas, Image } from "@napi-rs/canvas";
import { loadCanvas } from "@nodetool-ai/runtime";
import { drawMask, type Canvas2DLayer, type Canvas2DPrecomposite, type Canvas2DAdjustment, type MaskContext2D } from "@nodetool-ai/timeline/scene";
import type { FrameLayer, FrameLayerPixels } from "@nodetool-ai/timeline/render";

type Source = Canvas | Image;

/** Acquire the optional native renderer only when a preview is requested. */
export async function createSharedPreviewCompositor(width: number, height: number, referenceWidth: number, referenceHeight: number) {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const { HeadlessFrameCompositor } = await import("@nodetool-ai/timeline/render");
  const { createCanvas } = await loadCanvas();
  const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height);
  compositor.setReferenceSize(referenceWidth, referenceHeight);
  const pixels = (source: Source): FrameLayerPixels => {
    const canvas = createCanvas(source.width, source.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    return { rgba: new Uint8Array(ctx.getImageData(0, 0, source.width, source.height).data), width: source.width, height: source.height };
  };
  const maskPixels = (mask: NonNullable<Canvas2DLayer<Source>["shapeMask"]>, w: number, h: number): FrameLayerPixels => {
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
    dispose: (): void => compositor.dispose(),
    async draw(canvas: Canvas, layers: Canvas2DLayer<Source>[], groups: Canvas2DPrecomposite[], adjustments: Canvas2DAdjustment[]) {
      const rgba = await compositor.renderFrame(layers.map(layerPixels), groups, {}, adjustments.map((adjustment) => ({
        ...adjustment,
        id: adjustment.clipId ?? "preview-adjustment",
        shapeMask: adjustment.mask ? maskPixels(adjustment.mask, width, height) : undefined
      })));
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(width, height);
      image.data.set(rgba);
      ctx.putImageData(image, 0, 0);
      return { skipped: [], degraded: [] };
    }
  };
}
