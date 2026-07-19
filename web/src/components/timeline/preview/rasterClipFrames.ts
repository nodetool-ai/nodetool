import type { TimelineClip } from "@nodetool-ai/timeline";

import { Canvas2DCompositor } from "./gpu/canvas2dCompositor";
import {
  createAnimationCompileCache,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext
} from "./sceneModel";
import { ShapeRasterizer } from "./shapeRender";
import { TextRasterizer } from "./textRender";

export interface RasterClipFrame {
  width: number;
  height: number;
  dataUrl: string;
}

export async function renderRasterClipFrames(
  clip: TimelineClip,
  timelineTimes: number[],
  outputWidth: number,
  sequenceWidth: number,
  sequenceHeight: number
): Promise<RasterClipFrame[]> {
  if (clip.mediaType !== "text" && clip.mediaType !== "shape") {
    throw new Error(`Cannot rasterize ${clip.mediaType} clip "${clip.name}".`);
  }

  const outputHeight = Math.max(
    1,
    Math.round((outputWidth * sequenceHeight) / sequenceWidth)
  );
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const compositor = new Canvas2DCompositor();
  const init = await compositor.init(canvas);
  if (!init.ok) {
    throw new Error(
      init.reason ?? "Could not initialize raster frame renderer."
    );
  }
  compositor.resize(outputWidth, outputHeight);
  compositor.setReferenceSize(sequenceWidth, sequenceHeight);

  const textRasterizer = new TextRasterizer();
  const shapeRasterizer = new ShapeRasterizer();
  const source =
    clip.mediaType === "text" && clip.textStyle
      ? textRasterizer.rasterize(clip.textStyle, sequenceWidth, sequenceHeight)
      : clip.mediaType === "shape" && clip.shapeStyle
        ? shapeRasterizer.rasterize(
            clip.shapeStyle,
            sequenceWidth,
            sequenceHeight
          )
        : null;

  if (!source) {
    compositor.dispose();
    textRasterizer.dispose();
    shapeRasterizer.dispose();
    throw new Error(`Clip "${clip.name}" has no renderable style.`);
  }

  const animationCache = createAnimationCompileCache();
  try {
    return timelineTimes.map((timelineTimeMs) => {
      const animated = resolveAnimatedLayerProps(
        {
          clip,
          transform: clip.transform,
          opacity: clip.opacity ?? 1
        },
        timelineTimeMs,
        { width: sequenceWidth, height: sequenceHeight },
        animationCache
      );
      // A staggered text clip re-rasterizes per requested time so the agent
      // sees the per-word motion mid-window, same draw path as preview/export.
      let frameSource = source;
      if (clip.mediaType === "text" && clip.textStyle) {
        const stagger = resolveTextStaggerContext(
          clip,
          timelineTimeMs,
          { width: sequenceWidth, height: sequenceHeight },
          animationCache
        );
        if (stagger) {
          frameSource =
            textRasterizer.rasterize(
              clip.textStyle,
              sequenceWidth,
              sequenceHeight,
              stagger
            ) ?? source;
        }
      }
      compositor.setLayers([
        {
          id: clip.id,
          source: frameSource,
          opacity: animated.opacity,
          blendMode: clip.blendMode ?? "normal",
          zIndex: 0,
          transform: animated.transform,
          borderRadius: clip.borderRadius,
          effects: clip.effects
        }
      ]);
      compositor.render();
      return {
        width: outputWidth,
        height: outputHeight,
        dataUrl: canvas.toDataURL("image/jpeg", 0.8)
      };
    });
  } finally {
    compositor.dispose();
    textRasterizer.dispose();
    shapeRasterizer.dispose();
  }
}
