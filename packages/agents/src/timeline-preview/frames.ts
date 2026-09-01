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
  Canvas2DLayer,
  CompositeContext2D,
  DroppedLayerReason,
  MaskScratch
} from "@nodetool-ai/timeline/scene";
import {
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  drawTimelineFrame,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  trackZ,
  unsupportedEffectTypes
} from "@nodetool-ai/timeline/scene";

import { forEachVideoFrame } from "../analysis/media-decode.js";
import {
  DEFAULT_PREVIEW_WIDTH,
  MAX_PREVIEW_WIDTH
} from "../capabilities/timelines.specs.js";
import { PreviewRasterizer } from "./rasterize.js";

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
  /** Present when an animation is masking the layer mid-wipe. */
  wipe?: { direction: string; progress: number };
  /** The text a text or caption layer drew. */
  text?: string;
  /** Why the layer contributed no pixels, when it didn't. */
  skipped?: string;
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
    height: Math.max(1, sequence.height || 1080)
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

  let scratch: Canvas | null = null;
  const scratchFor = (
    w: number,
    h: number
  ): MaskScratch<PreviewSource> | null => {
    const surface =
      scratch && scratch.width === w && scratch.height === h
        ? scratch
        : createCanvas(w, h);
    scratch = surface;
    return {
      ctx: surface.getContext("2d") as unknown as CompositeContext2D<
        PreviewSource
      >,
      surface
    };
  };

  const assetBytes = new Map<string, Promise<Uint8Array | null>>();
  const bytesFor = (assetId: string): Promise<Uint8Array | null> => {
    let pending = assetBytes.get(assetId);
    if (!pending) {
      pending = loadAsset(assetId).catch(() => null);
      assetBytes.set(assetId, pending);
    }
    return pending;
  };
  const decodedImages = new Map<string, PreviewSource | null>();

  const frames: PreviewFrame[] = [];
  const effectsNotApplied = new Set<string>();

  for (const timeMs of options.timesMs) {
    const { layers: active, droppedLayers } = computeActiveLayersWithHorizon(
      sequence.tracks,
      sequence.clips,
      timeMs
    );
    for (const type of unsupportedEffectTypes(active)) {
      effectsNotApplied.add(type);
    }

    const drawLayers: Canvas2DLayer<PreviewSource>[] = [];
    const reports: PreviewLayerReport[] = [];
    /** Which report each drawn layer belongs to, matched by identity. */
    const reportFor = new Map<Canvas2DLayer<PreviewSource>, PreviewLayerReport>();

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
      if (anim.mask) {
        report.wipe = {
          direction: anim.mask.direction,
          progress: Number(anim.mask.progress.toFixed(3))
        };
      }
      reports.push(report);

      const common = {
        opacity: anim.opacity,
        blendMode: layer.blendMode,
        zIndex,
        transform: anim.transform,
        mask: anim.mask,
        borderRadius: layer.borderRadius,
        effects: anim.effects ?? layer.effects,
        trackEffects: layer.trackEffects
      };

      const addLayer = (
        source: PreviewSource,
        sourceWidth: number,
        sourceHeight: number,
        overrides?: Partial<Canvas2DLayer<PreviewSource>>
      ) => {
        const drawn: Canvas2DLayer<PreviewSource> = {
          ...common,
          ...overrides,
          source,
          sourceWidth,
          sourceHeight
        };
        drawLayers.push(drawn);
        reportFor.set(drawn, report);
      };

      const addRaster = (source: Canvas | null, untransformed = false) => {
        if (!source) {
          report.skipped = "nothing to draw";
          return;
        }
        addLayer(
          source,
          source.width,
          source.height,
          // Captions are drawn at frame resolution and composite untransformed.
          untransformed
            ? {
                transform: undefined,
                borderRadius: undefined,
                effects: undefined,
                trackEffects: undefined
              }
            : undefined
        );
      };

      if (layer.kind === "caption" && layer.caption) {
        addRaster(rasterizer.caption(layer.caption), true);
        continue;
      }
      if (layer.kind === "text" && layer.textStyle) {
        const stagger = resolveTextStaggerContext(
          layer.clip,
          timeMs,
          animationCanvas,
          animCache
        );
        addRaster(rasterizer.text(layer.textStyle, stagger));
        continue;
      }
      if (layer.kind === "shape" && layer.shapeStyle) {
        addRaster(rasterizer.shape(layer.shapeStyle));
        continue;
      }

      if (!layer.assetId) {
        report.skipped =
          layer.clip.status === "draft"
            ? "clip has no rendered media yet (status: draft)"
            : `clip has no asset to draw (status: ${layer.clip.status})`;
        continue;
      }

      const bytes = await bytesFor(layer.assetId);
      if (!bytes || bytes.byteLength === 0) {
        report.skipped = `asset ${layer.assetId} could not be read`;
        continue;
      }

      if (layer.kind === "video") {
        const frame = await decodeVideoFrameAt(bytes, layer.clip, timeMs);
        if (!frame) {
          report.skipped = `no decodable frame at ${Math.round(
            clipSourceTimeSec(layer.clip, timeMs) * 1000
          )}ms into the source`;
          continue;
        }
        addLayer(frame.canvas, frame.width, frame.height);
        continue;
      }

      let image = decodedImages.get(layer.assetId);
      if (image === undefined) {
        image = await loadImage(Buffer.from(bytes)).catch(() => null);
        decodedImages.set(layer.assetId, image);
      }
      if (!image) {
        report.skipped = `asset ${layer.assetId} is not a decodable image`;
        continue;
      }
      addLayer(image, image.width, image.height);
    }

    for (const layer of drawTimelineFrame(
      ctx,
      drawLayers,
      geometry,
      scratchFor
    )) {
      const report = reportFor.get(layer);
      if (report) report.skipped = "source could not be drawn";
    }

    frames.push({
      time_ms: timeMs,
      png: new Uint8Array(canvas.toBuffer("image/png")),
      width,
      height,
      // Top of the stack first: the reader's question is what is on top.
      layers: reports.sort((a, b) => b.z_index - a.z_index),
      dropped: droppedLayers.map((dropped) => ({
        clip_id: dropped.clipId,
        clip_name: clipName(sequence, dropped.clipId),
        reason: dropped.reason
      }))
    });
  }

  return { frames, effectsNotApplied: [...effectsNotApplied].sort() };
}
