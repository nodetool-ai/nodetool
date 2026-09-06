/**
 * Composite a timeline at chosen timecodes, headlessly.
 *
 * The question this answers is the one an agent editing a timeline could not
 * ask before: *what does the cut actually look like at 2.4s?* Structural
 * validation says the clips are wired correctly and `get_clip_frames` shows one
 * clip's source media, but neither shows the frame — the picture under the
 * title, the title's animation mid-flight, the transition halfway through, the
 * track order that decides what covers what.
 *
 * It resolves the scene the same way every other render surface does
 * (`computeActiveLayers` → `resolveAnimatedLayerProps`), rasterizes the
 * text/shape/caption layers through the shared drawing rules, decodes the media
 * layers with Mediabunny, and composites on `@napi-rs/canvas` through the
 * shared Canvas 2D rules. So it needs no GPU, no ffmpeg and no browser, and it
 * runs anywhere the agent runs.
 *
 * What it is not: the GPU compositor. Color and blur adjustments map onto the
 * canvas filter; chroma key, vignette and sharpen have no Canvas 2D equivalent
 * and are reported in `effects_not_applied` rather than silently dropped.
 */

import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import type {
  ActiveLayer,
  AnimatedLayerProps,
  Canvas2DLayer,
  Canvas2DPrecomposite,
  Canvas2DDegradationReason,
  CompositeContext2D,
  CompositeSurface,
  DroppedLayerReason,
  MotionBlurOptions,
  RasterContext2D
} from "@nodetool-ai/timeline/scene";
import {
  accumulateBlurSample,
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  drawTimelineFrame,
  hasActiveAnimation,
  measureTextWith,
  motionBlurSampleTimes,
  resolveAnimatedLayerProps,
  resolveMotionBlur,
  resolveTextStaggerContext,
  seedBlurAccumulation,
  shutterWindowIsStatic,
  trackZ,
  unsupportedEffectTypes
} from "@nodetool-ai/timeline/scene";

import { forEachVideoFrame } from "../analysis/media-decode.js";
import {
  DEFAULT_PREVIEW_WIDTH,
  MAX_PREVIEW_WIDTH
} from "../capabilities/timelines.specs.js";
import { PreviewRasterizer } from "./rasterize.js";

/**
 * Reads of one asset allowed per render pass. See `bytesFor` for why a failed
 * read is retried at all, and why the retries are bounded.
 */
const MAX_ASSET_READ_ATTEMPTS = 3;

/** The message behind a thrown value, for a layer's `skipped` reason. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || "it failed with no message";
}

/** Anything `drawImage` accepts here: a rasterized surface or a decoded image. */
type PreviewSource = Canvas | Awaited<ReturnType<typeof loadImage>>;

export interface RenderTimelineFramesOptions {
  sequence: TimelineSequence;
  /** Absolute timeline positions to composite, in milliseconds. */
  timesMs: readonly number[];
  /** Output frame width in pixels; height follows the sequence aspect. */
  width?: number;
  /** Resolve a clip's asset id to its encoded bytes, or null when unavailable. */
  loadAsset: (assetId: string) => Promise<Uint8Array | null>;
  /**
   * Average N sub-frame instants into every frame instead of sampling one (D10).
   * Absent or one sample is blur off, which is what every caller that does not
   * ask about it gets. The frame interval the shutter opens inside comes from
   * the sequence's own fps.
   */
  motionBlur?: MotionBlurOptions;
}

/** What one layer contributed to a frame, for the report beside the pixels. */
export interface PreviewLayerReport {
  clip_id: string;
  clip_name: string;
  kind: ActiveLayer["kind"];
  track_index: number;
  /** Composite order: higher covers lower. */
  z_index: number;
  /** Final opacity — clip opacity × transition ramp × animation. */
  opacity: number;
  blend_mode: string;
  /** Present when an animation or a wipe transition is masking the layer. */
  wipe?: { direction: string; progress: number };
  /**
   * Present while a cut is in flight over this layer. Which side of it the
   * layer is on is what an agent otherwise cannot see in the pixels: a frame
   * mid-push is two half-frames, and the report says which is arriving.
   */
  transition?: { type: string; role: string; progress: number };
  /** Present when a shape mask is cutting the layer. */
  mask?: { kind: string };
  /**
   * Present when a track matte is driving the layer's alpha. The source clip
   * draws nothing of its own, so naming it here is the only way to see in the
   * report that it is on the timeline at all.
   */
  matte?: { source_clip_id: string; mode: string; invert: boolean };
  /** The text a text or caption layer drew. */
  text?: string;
  /** Why the layer contributed no pixels, when it didn't. */
  skipped?: string;
}

/**
 * One way the Canvas 2D compositor drew this frame differently from the GPU
 * render, where the difference is not an effect type `effects_not_applied`
 * could name — a feathered mask drawn hard, a matte skipped, a group's blend
 * lost, a second drop shadow not cast, a brightness applied as a multiply.
 */
export interface PreviewDegradation {
  /** The clip it happened to, when the layer carried one. */
  clip_id?: string;
  clip_name?: string;
  reason: Canvas2DDegradationReason;
}

/** A clip that was active at the frame's time and still did not draw. */
export interface PreviewDroppedLayer {
  clip_id: string;
  clip_name: string;
  /** Why the scene model refused it. */
  reason: DroppedLayerReason;
}

export interface PreviewFrame {
  time_ms: number;
  /** PNG bytes of the composited frame. */
  png: Uint8Array;
  width: number;
  height: number;
  layers: PreviewLayerReport[];
  /**
   * Clips the scene model left out of this frame. Empty on almost every
   * frame; non-empty means the picture is missing a layer the document asks
   * for, which is otherwise invisible in the pixels.
   */
  dropped: PreviewDroppedLayer[];
  /**
   * How this frame differs from the GPU render beyond the effects it could not
   * draw. Empty on almost every frame; an entry means the picture is a
   * degraded version of the one an export would produce.
   */
  degraded: PreviewDegradation[];
}

export interface RenderTimelineFramesResult {
  frames: PreviewFrame[];
  /** Effect types present on the timeline that Canvas 2D cannot draw. */
  effectsNotApplied: string[];
}

/** Frame geometry: the output size, and the sequence size the layout is in. */
function frameSize(
  sequence: TimelineSequence,
  requested: number | undefined
): { width: number; height: number } {
  const seqW = Math.max(1, sequence.width || 1920);
  const seqH = Math.max(1, sequence.height || 1080);
  const width = Math.min(
    MAX_PREVIEW_WIDTH,
    Math.max(16, Math.round(requested ?? DEFAULT_PREVIEW_WIDTH))
  );
  return { width, height: Math.max(1, Math.round((width * seqH) / seqW)) };
}

/**
 * Decode one video frame at the source time the clip is showing at `timeMs`.
 *
 * `clipSourceTimeSec` is the same mapping the preview seeks with, so trims,
 * speed changes and offsets land on the frame the editor shows.
 */
async function decodeVideoFrameAt(
  bytes: Uint8Array,
  clip: TimelineClip,
  timeMs: number
): Promise<{ canvas: Canvas; width: number; height: number } | null> {
  const sourceSec = Math.max(0, clipSourceTimeSec(clip, timeMs));
  let out: { canvas: Canvas; width: number; height: number } | null = null;
  await forEachVideoFrame(bytes, [sourceSec], (frame) => {
    const canvas = createCanvas(frame.width, frame.height);
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(frame.width, frame.height);
    image.data.set(frame.rgba);
    ctx.putImageData(image, 0, 0);
    out = { canvas, width: frame.width, height: frame.height };
  });
  return out;
}

/** The text a layer draws, for the report. */
function layerText(layer: ActiveLayer): string | undefined {
  if (layer.kind === "text") return layer.textStyle?.text;
  if (layer.kind === "caption" && layer.caption) {
    return layer.caption.words.map((w) => w.text).join(" ");
  }
  return undefined;
}

/** A clip's authored name, for a report that only holds its id. */
function clipName(sequence: TimelineSequence, clipId: string): string {
  return sequence.clips.find((clip) => clip.id === clipId)?.name ?? clipId;
}

/**
 * Composite `timesMs` and return the PNG of each, plus what each layer
 * contributed. Asset bytes are loaded once per asset across all timecodes.
 */
export async function renderTimelineFrames(
  options: RenderTimelineFramesOptions
): Promise<RenderTimelineFramesResult> {
  const { sequence, loadAsset } = options;
  const { width, height } = frameSize(sequence, options.width);
  // Animation offsets and text sizes are authored against the sequence's own
  // resolution, so that is the space they are sampled in; the frame is drawn
  // smaller and the transform math is told the reference size.
  const animationCanvas = {
    width: Math.max(1, sequence.width || 1920),
    height: Math.max(1, sequence.height || 1080),
    // A `"line"` stagger is counted against the wrapped line count, so the
    // count measures through the same kind of context the rasterizer draws on.
    measureText: measureTextWith(
      // SAFETY: `RasterContext2D` is the subset of the 2D canvas API the
      // measurement uses, and a skia context provides all of it.
      createCanvas(1, 1).getContext("2d") as unknown as RasterContext2D
    )
  };
  const geometry = {
    canvasWidth: width,
    canvasHeight: height,
    refWidth: animationCanvas.width,
    refHeight: animationCanvas.height
  };

  const rasterizer = new PreviewRasterizer(width, height);
  const animCache = createAnimationCompileCache();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CompositeContext2D<
    PreviewSource
  >;

  const asSurface = (canvasFor: Canvas): CompositeSurface<PreviewSource> => ({
    // SAFETY: `CompositeContext2D` is the subset of the 2D canvas API the
    // compositing rules use, and a skia context provides all of it.
    ctx: canvasFor.getContext("2d") as unknown as CompositeContext2D<
      PreviewSource
    >,
    surface: canvasFor
  });

  let scratch: Canvas | null = null;
  const scratchFor = (
    w: number,
    h: number
  ): CompositeSurface<PreviewSource> | null => {
    const surface =
      scratch && scratch.width === w && scratch.height === h
        ? scratch
        : createCanvas(w, h);
    scratch = surface;
    return asSurface(surface);
  };

  /**
   * Precomposite surfaces, pooled across frames and handed out one at a time
   * within a frame: a nested group holds its surface until the group above has
   * drawn it, so they cannot share the way the wipe scratch does.
   */
  const precompositePool: Canvas[] = [];
  let precompositesTaken = 0;
  const precompositeSurfaceFor = (
    w: number,
    h: number
  ): CompositeSurface<PreviewSource> | null => {
    const index = precompositesTaken++;
    let surface = precompositePool[index];
    if (!surface || surface.width !== w || surface.height !== h) {
      surface = createCanvas(w, h);
      precompositePool[index] = surface;
    }
    return asSurface(surface);
  };

  /**
   * Coverage scratch for a feathered shape mask, and the pair a matted layer
   * composes on. Both come from the precomposite pool because it is the one
   * that hands out a *distinct* surface per call within a frame — a feathered
   * mask and the layer it cuts are live at the same moment, so they cannot
   * share the single reused wipe scratch.
   */
  const maskSurfaceFor = precompositeSurfaceFor;
  const matteSurfaceFor = precompositeSurfaceFor;

  /**
   * Encoded asset bytes, shared by every frame in the pass — but only a
   * *successful* read is kept. A failed one is dropped so a later frame reads
   * the asset again: one transient failure used to decide the whole pass, and
   * every frame after it came out missing that layer while the asset itself
   * was healthy.
   *
   * Retries are bounded rather than unbounded because a pass draws
   * `timesMs.length` frames (times the motion-blur samples), and every frame
   * reads every media layer. Three attempts gives a blip two more chances
   * while costing an asset that is really gone a handful of reads instead of
   * one per sampled instant.
   */
  const assetBytes = new Map<string, Promise<Uint8Array | null>>();
  const assetReadAttempts = new Map<string, number>();
  /** Why the last read of an asset failed, for the layer's `skipped` reason. */
  const assetReadErrors = new Map<string, string>();
  const bytesFor = (assetId: string): Promise<Uint8Array | null> => {
    const cached = assetBytes.get(assetId);
    if (cached) return cached;
    if ((assetReadAttempts.get(assetId) ?? 0) >= MAX_ASSET_READ_ATTEMPTS) {
      return Promise.resolve(null);
    }
    assetReadAttempts.set(assetId, (assetReadAttempts.get(assetId) ?? 0) + 1);
    const pending = loadAsset(assetId).then(
      (bytes) => {
        if (bytes && bytes.byteLength > 0) {
          assetReadErrors.delete(assetId);
          return bytes;
        }
        assetBytes.delete(assetId);
        assetReadErrors.set(
          assetId,
          bytes ? "the read returned no bytes" : "no bytes were available"
        );
        return null;
      },
      (error: unknown) => {
        assetBytes.delete(assetId);
        assetReadErrors.set(assetId, describeError(error));
        return null;
      }
    );
    assetBytes.set(assetId, pending);
    return pending;
  };
  const decodedImages = new Map<string, PreviewSource | null>();
  /** Why an asset's bytes would not decode, for the layer's `skipped` reason. */
  const decodeErrors = new Map<string, string>();

  const frames: PreviewFrame[] = [];
  const effectsNotApplied = new Set<string>();

  const blur = resolveMotionBlur(options.motionBlur);
  const frameMs = 1000 / Math.max(1, sequence.fps || 30);
  /**
   * Where the shutter window is summed. Allocated only for a blurred render:
   * with blur off the main canvas is the frame, exactly as it was before.
   */
  const blurAccumulator =
    blur.samplesPerFrame > 1 ? createCanvas(width, height) : null;
  const blurCtx = blurAccumulator
    ? // SAFETY: `CompositeContext2D` is the subset of the 2D canvas API the
      // accumulation uses, and a skia context provides all of it.
      (blurAccumulator.getContext("2d") as unknown as CompositeContext2D<
        PreviewSource
      >)
    : null;

  /**
   * Draw one instant onto the main canvas and say what each layer contributed.
   *
   * One call is a whole frame with blur off, and one sample of the shutter
   * window with it on — the picture is the same work either way, which is what
   * keeps a blurred preview from drifting from an unblurred one.
   */
  const composeAt = async (
    timeMs: number
  ): Promise<{
    reports: PreviewLayerReport[];
    dropped: PreviewDroppedLayer[];
    degraded: PreviewDegradation[];
  }> => {
    const {
      layers: active,
      precomposites,
      droppedLayers
    } = computeActiveLayersWithHorizon(
      sequence.tracks,
      sequence.clips,
      timeMs,
      // Group transforms are authored against the sequence resolution, the
      // same space the animations are sampled in.
      { canvas: animationCanvas, animationCache: animCache }
    );
    const drawPrecomposites: Canvas2DPrecomposite[] = precomposites.map(
      (group) => ({
        id: group.clipId,
        zIndex: trackZ(group.trackIndex),
        opacity: group.opacity,
        blendMode: group.blendMode,
        effects: group.effects,
        precomposeGroupId: group.precomposeGroupId
      })
    );
    // A group's effects run on its composed surface, so they are named here
    // beside the layers' own — otherwise a group effect this path cannot draw
    // would go unreported (I7).
    for (const type of unsupportedEffectTypes([
      ...active,
      ...drawPrecomposites
    ])) {
      effectsNotApplied.add(type);
    }
    precompositesTaken = 0;

    const drawLayers: Canvas2DLayer<PreviewSource>[] = [];
    const reports: PreviewLayerReport[] = [];
    /** Which report each drawn layer belongs to, matched by identity. */
    const reportFor = new Map<Canvas2DLayer<PreviewSource>, PreviewLayerReport>();

    /**
     * The pixels a layer draws, and whether it composites frame-sized and
     * untransformed (a caption does). A string is the reason it draws nothing.
     */
    type LayerSource =
      | {
          source: PreviewSource;
          width: number;
          height: number;
          untransformed?: boolean;
        }
      | { skipped: string };

    const sourceForLayer = async (
      layer: ActiveLayer,
      anim: AnimatedLayerProps
    ): Promise<LayerSource> => {
      if (layer.kind === "caption" && layer.caption) {
        const raster = rasterizer.caption(layer.caption);
        if (!raster) return { skipped: "nothing to draw" };
        return {
          source: raster,
          width: raster.width,
          height: raster.height,
          untransformed: true
        };
      }
      if (layer.kind === "text" && layer.textStyle) {
        const stagger = resolveTextStaggerContext(
          layer.clip,
          timeMs,
          animationCanvas,
          animCache
        );
        const raster = rasterizer.text(layer.textStyle, stagger);
        if (!raster) return { skipped: "nothing to draw" };
        return { source: raster, width: raster.width, height: raster.height };
      }
      if (layer.kind === "shape") {
        // The animated style carries a driven trim range; without it a trim
        // animation would rasterize its first frame and hold.
        const shapeStyle = anim.shapeStyle ?? layer.shapeStyle;
        if (!shapeStyle) return { skipped: "nothing to draw" };
        const raster = rasterizer.shape(shapeStyle);
        if (!raster) return { skipped: "nothing to draw" };
        return { source: raster, width: raster.width, height: raster.height };
      }

      if (!layer.assetId) {
        return {
          skipped:
            layer.clip.status === "draft"
              ? "clip has no rendered media yet (status: draft)"
              : `clip has no asset to draw (status: ${layer.clip.status})`
        };
      }

      // Bound once: the decode's failure callback closes over it, which would
      // otherwise lose the narrowing the guard above established.
      const assetId = layer.assetId;
      const bytes = await bytesFor(assetId);
      if (!bytes || bytes.byteLength === 0) {
        const reason =
          assetReadErrors.get(assetId) ?? "no bytes were available";
        return { skipped: `asset ${assetId} could not be read: ${reason}` };
      }

      if (layer.kind === "video") {
        const frame = await decodeVideoFrameAt(bytes, layer.clip, timeMs);
        if (!frame) {
          return {
            skipped: `no decodable frame at ${Math.round(
              clipSourceTimeSec(layer.clip, timeMs) * 1000
            )}ms into the source`
          };
        }
        return {
          source: frame.canvas,
          width: frame.width,
          height: frame.height
        };
      }

      // Unlike a read, a decode is a pure function of bytes this pass already
      // holds, so a failure here is cached: retrying it would fail the same
      // way on every frame. Its reason is kept for the same report.
      let image = decodedImages.get(assetId);
      if (image === undefined) {
        image = await loadImage(Buffer.from(bytes)).catch((error: unknown) => {
          decodeErrors.set(assetId, describeError(error));
          return null;
        });
        decodedImages.set(assetId, image);
      }
      if (!image) {
        const reason = decodeErrors.get(assetId);
        return {
          skipped: reason
            ? `asset ${assetId} is not a decodable image: ${reason}`
            : `asset ${assetId} is not a decodable image`
        };
      }
      return { source: image, width: image.width, height: image.height };
    };

    /**
     * An active layer as something the Canvas 2D rules can draw, or the reason
     * it draws nothing. `resolved` is the caller's own animation sample, since
     * the report already needed it; a matte source has none and takes its own.
     */
    const toDrawLayer = async (
      layer: ActiveLayer,
      sampled?: AnimatedLayerProps
    ): Promise<Canvas2DLayer<PreviewSource> | string> => {
      const anim =
        sampled ??
        resolveAnimatedLayerProps(layer, timeMs, animationCanvas, animCache);
      const resolved = await sourceForLayer(layer, anim);
      if ("skipped" in resolved) return resolved.skipped;
      const drawn: Canvas2DLayer<PreviewSource> = {
        clipId: layer.clipId,
        source: resolved.source,
        sourceWidth: resolved.width,
        sourceHeight: resolved.height,
        opacity: anim.opacity,
        blendMode: layer.blendMode,
        zIndex: trackZ(layer.trackIndex),
        precomposeGroupId: layer.precomposeGroupId,
        mask: anim.mask
      };
      if (resolved.untransformed) {
        // Captions are drawn at frame resolution and composite untransformed —
        // by the clip's transform, by its group's, and by its effects. The
        // cut's opacity is already in `opacity`; leaving the record off keeps
        // its geometry — and a dip's one solid — off a layer that composites
        // untransformed anyway.
        return drawn;
      }
      drawn.transform = anim.transform;
      drawn.parentMatrix = layer.parentMatrix;
      drawn.borderRadius = layer.borderRadius;
      drawn.shapeMask = layer.shapeMask;
      drawn.effects = anim.effects ?? layer.effects;
      drawn.trackEffects = layer.trackEffects;
      drawn.transition = layer.transition;
      if (layer.matte) {
        // A matte source is not in `active` — the scene model held it back —
        // so it is decoded and placed here and nowhere else.
        const matteLayer = await toDrawLayer(layer.matte.layer);
        if (typeof matteLayer !== "string") {
          drawn.matte = {
            mode: layer.matte.mode,
            invert: layer.matte.invert,
            layer: matteLayer
          };
        }
      }
      return drawn;
    };

    for (const layer of active) {
      const anim = resolveAnimatedLayerProps(
        layer,
        timeMs,
        animationCanvas,
        animCache
      );
      const zIndex = trackZ(layer.trackIndex);
      const report: PreviewLayerReport = {
        clip_id: layer.clipId,
        clip_name: layer.clip.name,
        kind: layer.kind,
        track_index: layer.trackIndex,
        z_index: zIndex,
        opacity: Number(anim.opacity.toFixed(3)),
        blend_mode: String(layer.blendMode),
        text: layerText(layer)
      };
      const wipeMask = anim.mask ?? layer.transition?.mask;
      if (wipeMask) {
        report.wipe = {
          direction: wipeMask.direction,
          progress: Number(wipeMask.progress.toFixed(3))
        };
      }
      if (layer.transition) {
        report.transition = {
          type: layer.transition.type,
          role: layer.transition.role,
          progress: Number(layer.transition.progress.toFixed(3))
        };
      }
      if (layer.shapeMask) report.mask = { kind: layer.shapeMask.kind };
      if (layer.matte) {
        report.matte = {
          source_clip_id: layer.matte.layer.clipId,
          mode: layer.matte.mode,
          invert: layer.matte.invert
        };
      }
      reports.push(report);

      const drawn = await toDrawLayer(layer, anim);
      if (typeof drawn === "string") {
        report.skipped = drawn;
        continue;
      }
      drawLayers.push(drawn);
      reportFor.set(drawn, report);
    }


    const drawReport = drawTimelineFrame(ctx, drawLayers, geometry, {
      maskScratch: scratchFor,
      precomposites: drawPrecomposites,
      precompositeSurface: precompositeSurfaceFor,
      maskSurface: maskSurfaceFor,
      matteSurface: matteSurfaceFor
    });
    for (const layer of drawReport.skipped) {
      const report = reportFor.get(layer);
      if (report) report.skipped = "source could not be drawn";
    }

    return {
      // Top of the stack first: the reader's question is what is on top.
      reports: reports.sort((a, b) => b.z_index - a.z_index),
      dropped: droppedLayers.map((dropped) => ({
        clip_id: dropped.clipId,
        clip_name: clipName(sequence, dropped.clipId),
        reason: dropped.reason
      })),
      degraded: drawReport.degraded.map((entry) => ({
        clip_id: entry.clipId,
        clip_name: entry.clipId ? clipName(sequence, entry.clipId) : undefined,
        reason: entry.reason
      }))
    };
  };

  /**
   * True when the shutter window holds one picture. Resolving the layer set
   * decodes nothing, so the check costs a fraction of the N decodes and N
   * composites it saves on a still frame.
   */
  const shutterIsStatic = (timeMs: number): boolean => {
    if (blur.samplesPerFrame <= 1) return false;
    const { layers } = computeActiveLayersWithHorizon(
      sequence.tracks,
      sequence.clips,
      timeMs,
      { canvas: animationCanvas, animationCache: animCache }
    );
    return shutterWindowIsStatic(
      layers,
      hasActiveAnimation(layers, timeMs, animationCanvas, animCache, sequence.clips)
    );
  };

  for (const timeMs of options.timesMs) {
    const sampleTimes = shutterIsStatic(timeMs)
      ? [timeMs]
      : motionBlurSampleTimes(timeMs, frameMs, options.motionBlur);
    let composed: Awaited<ReturnType<typeof composeAt>>;
    if (!blurCtx || !blurAccumulator || sampleTimes.length === 1) {
      composed = await composeAt(timeMs);
    } else {
      seedBlurAccumulation(blurCtx, geometry);
      // The report describes the first instant of the shutter window, since no
      // single set of numbers describes a picture that is N instants averaged.
      composed = await composeAt(sampleTimes[0]);
      accumulateBlurSample(blurCtx, canvas, blur.weight, geometry);
      for (const sampleMs of sampleTimes.slice(1)) {
        await composeAt(sampleMs);
        accumulateBlurSample(blurCtx, canvas, blur.weight, geometry);
      }
    }

    frames.push({
      time_ms: timeMs,
      png: new Uint8Array((blurAccumulator ?? canvas).toBuffer("image/png")),
      width,
      height,
      layers: composed.reports,
      dropped: composed.dropped,
      degraded: composed.degraded
    });
  }

  return { frames, effectsNotApplied: [...effectsNotApplied].sort() };
}
