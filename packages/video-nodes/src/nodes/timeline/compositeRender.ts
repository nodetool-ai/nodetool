/**
 * Frame-by-frame render of a timeline sequence, server-side.
 *
 * This is the editor's export path with the browser taken out: the same
 * {@link computeActiveLayersWithHorizon} scene description, the same animation
 * sampling, the same placement math, and the same GPU compositor
 * ({@link HeadlessFrameCompositor}) — so a workflow render and the preview the
 * user watched are the same picture. Only the boundaries differ: ffmpeg decodes
 * clip media into RGBA and encodes the composited frames, in place of
 * `<video>`/WebCodecs.
 */

import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import type {
  FrameLayer,
  FramePrecomposite,
  FrameSample,
  RasterContext2D
} from "@nodetool-ai/timeline/render";
import {
  HeadlessFrameCompositor,
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  measureTextWith,
  motionBlurSampleTimes,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  trackZ
} from "@nodetool-ai/timeline/render";
import { createCanvas } from "@napi-rs/canvas";

import {
  decodeImageRgba,
  fitWithin,
  openFrameEncoder,
  openVideoFrameStream,
  probeVideoSize,
  type FrameEncoder,
  type RawImage,
  type VideoFrameStream
} from "./rawFrames.js";
import { openPngSequenceEncoder } from "./pngSequence.js";
import {
  resolveTimelineOutput,
  type ResolvedTimelineOutput
} from "./outputFormats.js";
import { NodeRasterizer } from "./rasterizers.js";

interface CompositeRenderOptions {
  sequence: TimelineSequence;
  /** Sequence resolution and rate the frames are composited at. */
  width: number;
  height: number;
  fps: number;
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  /** Resolve a clip's asset to a readable local file, or null if unavailable. */
  resolveAssetPath: (assetId: string) => Promise<string | null>;
  /** Destination file — a video container, or the PNG sequence's zip. */
  outPath: string;
  /**
   * Container, encoder and alpha, resolved by `resolveTimelineOutput`. Absent
   * means today's default: H.264 in MP4 over an opaque ground.
   */
  output?: ResolvedTimelineOutput;
  onProgress?: (frame: number, totalFrames: number) => void;
  /**
   * Run cancellation. Checked once per frame, so a cancelled render stops
   * within one frame's work instead of encoding the whole timeline first.
   */
  signal?: AbortSignal;
}

interface CompositeRenderResult {
  totalFrames: number;
  /** Clips whose media could not be decoded, by name — reported, not fatal. */
  skippedClips: string[];
}

/** The GPU device is acquired lazily; this is what "no GPU here" looks like. */
export class CompositorUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "The timeline compositor needs a WebGPU device and none is available: " +
        (cause instanceof Error ? cause.message : String(cause))
    );
    this.name = "CompositorUnavailableError";
    this.cause = cause;
  }
}

/** The rejection a cancelled render throws, named the way callers test for. */
function abortError(): Error {
  return new DOMException("Timeline render cancelled", "AbortError");
}

async function acquireDevice(): Promise<GPUDevice> {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    return await getNodeGPUDevice();
  } catch (error) {
    throw new CompositorUnavailableError(error);
  }
}

/** Per-clip decode state, opened on first use and closed when the clip ends. */
interface ClipVideoSource {
  stream: VideoFrameStream;
  /** Frames already consumed — a stream only moves forward. */
  endMs: number;
}

export async function renderTimelineComposited(
  opts: CompositeRenderOptions
): Promise<CompositeRenderResult> {
  const { sequence, fps, durationMs, resolveAssetPath, outPath, signal } = opts;
  const output = opts.output ?? resolveTimelineOutput({ format: "mp4" });
  // H.264 and the yuv420p family require even dimensions.
  const width = Math.max(2, Math.floor(opts.width / 2) * 2);
  const height = Math.max(2, Math.floor(opts.height / 2) * 2);
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frameMs = 1000 / fps;
  // Resolved with the format rather than passed separately, so one object
  // carries every render choice. N samples cost N× this render — every layer
  // is decoded, rasterized and composited once per sample.
  const motionBlur = output.motionBlur;
  const canvas = {
    width,
    height,
    // A `"line"` stagger is counted against the wrapped line count, so the
    // count measures through the same kind of context the rasterizer draws on.
    // SAFETY: `RasterContext2D` is the subset of the 2D canvas API the
    // measurement uses, and a skia context provides all of it.
    measureText: measureTextWith(
      createCanvas(1, 1).getContext("2d") as unknown as RasterContext2D
    )
  };

  if (signal?.aborted) throw abortError();
  const device = await acquireDevice();
  const compositor = new HeadlessFrameCompositor(device, width, height);
  const rasterizer = new NodeRasterizer(width, height);
  const encoder: FrameEncoder =
    output.format === "png_sequence"
      ? openPngSequenceEncoder({
          outPath,
          width,
          height,
          fps,
          alpha: output.alpha
        })
      : openFrameEncoder({
          outPath,
          width,
          height,
          fps,
          encoderArgs: output.encoderArgs
        });
  const animCache = createAnimationCompileCache();

  const videoSources = new Map<string, ClipVideoSource>();
  const images = new Map<string, RawImage | null>();
  const assetPaths = new Map<string, Promise<string | null>>();
  const skippedClips = new Set<string>();

  const pathFor = (assetId: string): Promise<string | null> => {
    let pending = assetPaths.get(assetId);
    if (!pending) {
      pending = resolveAssetPath(assetId);
      assetPaths.set(assetId, pending);
    }
    return pending;
  };

  const imageFor = async (assetId: string): Promise<RawImage | null> => {
    if (images.has(assetId)) return images.get(assetId) ?? null;
    const file = await pathFor(assetId);
    let decoded: RawImage | null = null;
    if (file) {
      const size = await probeVideoSize(file);
      if (size) decoded = await decodeImageRgba(file, fitWithin(size, canvas));
    }
    images.set(assetId, decoded);
    return decoded;
  };

  const videoFor = async (
    clip: TimelineClip,
    assetId: string
  ): Promise<VideoFrameStream | null> => {
    const existing = videoSources.get(clip.id);
    if (existing) return existing.stream;
    const file = await pathFor(assetId);
    if (!file) return null;
    const size = await probeVideoSize(file);
    if (!size) return null;
    const stream = openVideoFrameStream({
      filePath: file,
      size: fitWithin(size, canvas),
      fps,
      // `clipSourceTimeSec` at the clip's own start is its in point, expressed
      // the same way the preview seeks — so the first decoded frame is the
      // frame the preview shows at the cut.
      startSec: clipSourceTimeSec(clip, clip.startMs),
      speed: clip.speedBaked ? 1 : Math.max(0.0001, clip.speedMultiplier ?? 1)
    });
    videoSources.set(clip.id, {
      stream,
      endMs: clip.startMs + clip.durationMs
    });
    return stream;
  };

  try {
    /**
     * The scene at one instant, as something the compositor can composite.
     *
     * One call is a whole frame with motion blur off, and one sample of the
     * shutter window with it on — the layers are resolved the same way either
     * way, so a blurred render is N of the render it would otherwise have been.
     */
    const sampleAt = async (timeMs: number): Promise<FrameSample> => {
      const layers: FrameLayer[] = [];
      const { layers: active, precomposites } = computeActiveLayersWithHorizon(
        sequence.tracks,
        sequence.clips,
        timeMs,
        { canvas, animationCache: animCache }
      );
      /**
       * A resolved layer as something the compositor can upload: its pixels,
       * its own shape mask rasterized at that size, and — for a matted layer —
       * the matte source resolved the same way.
       *
       * A matte source is not in `active`; the scene model held it back so it
       * never draws itself, which is why it is decoded here and nowhere else.
       */
      const frameLayerFor = async (
        layer: (typeof active)[number],
        idPrefix = ""
      ): Promise<FrameLayer | null> => {
        const anim = resolveAnimatedLayerProps(layer, timeMs, canvas, animCache);
        const common = {
          opacity: anim.opacity,
          blendMode: layer.blendMode,
          zIndex: trackZ(layer.trackIndex),
          transform: anim.transform,
          parentMatrix: layer.parentMatrix,
          precomposeGroupId: layer.precomposeGroupId,
          mask: anim.mask,
          borderRadius: layer.borderRadius,
          effects: anim.effects ?? layer.effects,
          trackEffects: layer.trackEffects,
          transition: layer.transition
        };

        /** Attach the layer's own shape mask, rasterized at its source size. */
        const finish = (built: FrameLayer): FrameLayer => {
          const shape = layer.shapeMask;
          if (!shape) return built;
          const raster = rasterizer.mask(
            shape,
            built.source.width,
            built.source.height
          );
          if (raster) built.shapeMask = raster;
          return built;
        };

        const id = (kind: string): string =>
          `${idPrefix}${kind}:${layer.clipId}`;

        if (layer.kind === "caption" && layer.caption) {
          const raster = rasterizer.caption(layer.caption);
          if (!raster) return null;
          return finish({
            ...common,
            id: id("c"),
            source: raster,
            // Captions are drawn at frame resolution and composite
            // untransformed — by the clip's transform and by its group's.
            transform: undefined,
            parentMatrix: undefined,
            borderRadius: undefined,
            effects: undefined,
            trackEffects: undefined,
            // The cut's opacity is already in `opacity`; dropping the record
            // here keeps its geometry — and a dip's one solid — off a layer
            // that composites untransformed anyway.
            transition: undefined
          });
        }

        if (layer.kind === "text" && layer.textStyle) {
          const stagger = resolveTextStaggerContext(
            layer.clip,
            timeMs,
            canvas,
            animCache
          );
          const raster = rasterizer.text(layer.textStyle, stagger);
          if (!raster) return null;
          return finish({ ...common, id: id("t"), source: raster });
        }

        if (layer.kind === "shape") {
          // The animated style carries a driven trim range; without it a trim
          // animation would rasterize its first frame and hold.
          const shapeStyle = anim.shapeStyle ?? layer.shapeStyle;
          if (!shapeStyle) return null;
          const raster = rasterizer.shape(shapeStyle);
          if (!raster) return null;
          return finish({ ...common, id: id("s"), source: raster });
        }

        if (!layer.assetId) return null;

        if (layer.kind === "video") {
          const stream = await videoFor(layer.clip, layer.assetId);
          if (!stream) {
            skippedClips.add(layer.clip.name);
            return null;
          }
          const index = Math.max(
            0,
            Math.round(((timeMs - layer.clip.startMs) * fps) / 1000)
          );
          const rgba = await stream.frameAt(index);
          if (!rgba) return null;
          return finish({
            ...common,
            id: id("v"),
            source: {
              rgba,
              width: stream.width,
              height: stream.height,
              version: `${layer.clipId}:${index}`
            }
          });
        }

        const image = await imageFor(layer.assetId);
        if (!image) {
          skippedClips.add(layer.clip.name);
          return null;
        }
        return finish({
          ...common,
          id: id("i"),
          source: { ...image, version: layer.assetId }
        });
      };

      for (const layer of active) {
        const built = await frameLayerFor(layer);
        if (!built) continue;
        if (layer.matte) {
          const source = await frameLayerFor(layer.matte.layer, "m:");
          if (source) {
            built.matte = {
              mode: layer.matte.mode,
              invert: layer.matte.invert,
              layer: source
            };
          }
        }
        layers.push(built);
      }

      return {
        layers,
        precomposites: precomposites.map(
          (group): FramePrecomposite => ({
            id: group.clipId,
            zIndex: trackZ(group.trackIndex),
            opacity: group.opacity,
            blendMode: group.blendMode,
            effects: group.effects,
            precomposeGroupId: group.precomposeGroupId
          })
        )
      };
    };

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) throw abortError();
      const timeMs = (frame * 1000) / fps;

      for (const [clipId, source] of videoSources) {
        if (source.endMs < timeMs) {
          source.stream.close();
          videoSources.delete(clipId);
        }
      }

      const samples: FrameSample[] = [];
      // Sequential, not concurrent: a clip's frames come off one forward-only
      // ffmpeg stream, so two samples decoding at once would race for it.
      const sampleTimes = motionBlurSampleTimes(timeMs, frameMs, motionBlur);
      for (const sampleMs of sampleTimes) {
        samples.push(await sampleAt(sampleMs));
      }

      await encoder.write(
        await compositor.renderFrameSamples(samples, { alpha: output.alpha })
      );
      opts.onProgress?.(frame + 1, totalFrames);
    }

    await encoder.finish();
    return { totalFrames, skippedClips: [...skippedClips] };
  } catch (error) {
    encoder.abort();
    throw error;
  } finally {
    for (const source of videoSources.values()) source.stream.close();
    compositor.dispose();
  }
}
