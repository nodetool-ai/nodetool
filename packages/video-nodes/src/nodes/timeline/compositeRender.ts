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
import { hasTimeRemap } from "@nodetool-ai/timeline";
import {
  HeadlessFrameCompositor,
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  hasActiveAnimation,
  measureTextWith,
  motionBlurSampleTimes,
  shutterWindowIsStatic,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  trackZ
} from "@nodetool-ai/timeline/render";
import { createCanvas } from "@napi-rs/canvas";

import {
  decodeImageRgba,
  fitWithin,
  openFrameEncoder,
  openSourceFrameStream,
  openVideoFrameStream,
  probeVideoSize,
  type FrameEncoder,
  type RawImage
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

/** One clip's decoded frame at a timeline instant, with a cache key for it. */
interface ClipFrame {
  rgba: Uint8Array;
  /** Identifies these pixels to the compositor's texture cache. */
  version: string;
}

/**
 * Per-clip decode state, opened on first use and closed when the clip ends.
 *
 * `frameAt` takes a timeline time rather than a frame index because a clip's
 * source position is not always linear in it: a `timeRemap` makes it a curve,
 * which the source-addressed stream serves and the index-addressed one cannot.
 */
interface ClipVideoSource {
  width: number;
  height: number;
  frameAt(timeMs: number): Promise<ClipFrame | null>;
  close(): void;
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
  ): Promise<ClipVideoSource | null> => {
    const existing = videoSources.get(clip.id);
    if (existing) return existing;
    const file = await pathFor(assetId);
    if (!file) return null;
    const size = await probeVideoSize(file);
    if (!size) return null;
    const decodeSize = fitWithin(size, canvas);
    // `clipSourceTimeSec` at the clip's own start is its in point — or, for a
    // remapped clip, its curve's first source position — expressed the same way
    // the preview seeks, so the first decoded frame is the frame the preview
    // shows at the cut.
    const startSec = clipSourceTimeSec(clip, clip.startMs);
    const endMs = clip.startMs + clip.durationMs;
    let source: ClipVideoSource;
    if (hasTimeRemap(clip)) {
      // A curve can hold, revisit or reverse through the source, which a
      // forward-only stream cannot serve; this one reopens ffmpeg to seek back.
      const stream = openSourceFrameStream({
        filePath: file,
        size: decodeSize,
        fps,
        startSec
      });
      source = {
        width: stream.width,
        height: stream.height,
        endMs,
        async frameAt(timeMs: number): Promise<ClipFrame | null> {
          const sourceSec = clipSourceTimeSec(clip, timeMs);
          const rgba = await stream.frameAtSourceSec(sourceSec);
          if (!rgba) return null;
          // Keyed on the source instant, not the timeline one: a hold shows the
          // same pixels at many timeline frames and should upload once.
          return { rgba, version: `${clip.id}@${Math.round(sourceSec * fps)}` };
        },
        close: () => stream.close()
      };
    } else {
      const stream = openVideoFrameStream({
        filePath: file,
        size: decodeSize,
        fps,
        startSec,
        speed: clip.speedBaked ? 1 : Math.max(0.0001, clip.speedMultiplier ?? 1)
      });
      source = {
        width: stream.width,
        height: stream.height,
        endMs,
        async frameAt(timeMs: number): Promise<ClipFrame | null> {
          const index = Math.max(
            0,
            Math.round(((timeMs - clip.startMs) * fps) / 1000)
          );
          const rgba = await stream.frameAt(index);
          if (!rgba) return null;
          return { rgba, version: `${clip.id}:${index}` };
        },
        close: () => stream.close()
      };
    }
    videoSources.set(clip.id, source);
    return source;
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
          const decoded = await stream.frameAt(timeMs);
          if (!decoded) return null;
          return finish({
            ...common,
            id: id("v"),
            source: {
              rgba: decoded.rgba,
              width: stream.width,
              height: stream.height,
              version: decoded.version
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

    /**
     * True when the shutter window holds one picture, so N samples would
     * average N copies of it.
     *
     * Resolving the layer set is cheap — it decodes nothing — and it answers
     * the question that N decodes and N composites would otherwise pay for. A
     * held title at 8 samples is the case: 8× the render for the frame it
     * already had.
     */
    const staticAt = (timeMs: number): boolean => {
      if (motionBlur.samplesPerFrame <= 1) return false;
      const { layers } = computeActiveLayersWithHorizon(
        sequence.tracks,
        sequence.clips,
        timeMs,
        { canvas, animationCache: animCache }
      );
      return shutterWindowIsStatic(
        layers,
        hasActiveAnimation(layers, timeMs, canvas, animCache)
      );
    };

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) throw abortError();
      const timeMs = (frame * 1000) / fps;

      for (const [clipId, source] of videoSources) {
        if (source.endMs < timeMs) {
          source.close();
          videoSources.delete(clipId);
        }
      }

      const samples: FrameSample[] = [];
      // Sequential, not concurrent: a clip's frames come off one forward-only
      // ffmpeg stream, so two samples decoding at once would race for it.
      const sampleTimes = staticAt(timeMs)
        ? [timeMs]
        : motionBlurSampleTimes(timeMs, frameMs, motionBlur);
      for (const sampleMs of sampleTimes) {
        // Per sample, not per frame: with 32 samples a cancelled render would
        // otherwise finish 32 composites and decodes before it noticed.
        if (signal?.aborted) throw abortError();
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
    for (const source of videoSources.values()) source.close();
    compositor.dispose();
  }
}
