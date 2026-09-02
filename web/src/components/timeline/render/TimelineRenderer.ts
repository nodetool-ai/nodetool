/**
 * renderTimeline — offline, frame-by-frame export of a timeline.
 *
 * The renderer drives the *same* compositor (WebGPU, or the Canvas2D fallback
 * via {@link createCompositor}) and the *same* scene description as the live
 * preview — resolved once by `@nodetool-ai/timeline` and mapped to layers by
 * `buildCompositeLayer` — so the exported video is 1:1 with what playback
 * showed. Instead of a real-time rAF loop it:
 *
 *   1. steps the playhead in exact `1 / fps` increments,
 *   2. seeks each video element to the precise source frame (waiting for
 *      `seeked`) so decoding is deterministic, not best-effort,
 *   3. composites at full sequence resolution into an offscreen canvas,
 *   4. encodes each frame with WebCodecs (via mediabunny) and muxes to the
 *      container `format` names,
 *   5. mixes the audio tracks down offline (see {@link renderTimelineAudio}).
 *
 * `png_sequence` leaves the muxer out: each composited frame is read off the
 * canvas as a PNG and stored in one zip with a `manifest.json`, which is what
 * the server's own `png_sequence` render writes.
 */

import type {
  AudioBufferSource,
  AudioCodec,
  Quality,
  VideoCodec
} from "mediabunny";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import type { CompositeLayer } from "../preview/gpu/types";
import {
  accumulateBlurSample,
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  motionBlurSampleTimes,
  resolveAnimatedLayerProps,
  resolveMotionBlur,
  resolveTextStaggerContext,
  seedBlurAccumulation
} from "@nodetool-ai/timeline/render";
import type {
  ActiveLayer,
  AnimatedLayerProps,
  MotionBlurOptions
} from "@nodetool-ai/timeline/render";
import {
  buildCompositeLayer,
  buildCompositePrecomposites,
  type ResolvedCompositeSource
} from "../preview/compositeLayers";
import { CaptionRasterizer } from "../preview/captionRender";
import { TextRasterizer } from "../preview/textRender";
import { ensureBundledFontsLoaded } from "../preview/fontLoading";
import { textMeasurer } from "../preview/textMeasure";
import { ShapeRasterizer } from "../preview/shapeRender";
import { OffscreenVideoPool } from "./OffscreenVideoPool";
import { renderTimelineAudio } from "./renderAudio";

// mediabunny and the WebGPU compositor are imported dynamically inside
// `renderTimeline` so they (and their top-level WebGPU/WebCodecs references)
// are only loaded in the browser when an export actually runs — never at
// module-eval time, which keeps the editor importable under jsdom.

/** Containers the browser exporter can write. */
export const BROWSER_EXPORT_FORMATS = ["mp4", "webm", "png_sequence"] as const;

export type BrowserExportFormat = (typeof BROWSER_EXPORT_FORMATS)[number];

export type RenderPhase = "preparing" | "audio" | "video" | "finalizing";

export interface RenderProgress {
  phase: RenderPhase;
  /** Frames encoded so far (video phase). */
  frame: number;
  totalFrames: number;
  /** Overall completion ratio in [0, 1]. */
  ratio: number;
}

interface RenderTimelineOptions {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Sequence resolution in pixels. */
  width: number;
  height: number;
  fps: number;
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  /** Resolve an asset id to a playable URL (or undefined when unavailable). */
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  /**
   * Container to write. Default `"mp4"`. `"webm"` muxes VP9 + Opus;
   * `"png_sequence"` skips the muxer and zips one PNG per frame.
   */
  format?: BrowserExportFormat;
  /** Video codec. Default: the container's own (`"avc"` for mp4, `"vp9"` for webm). */
  videoCodec?: VideoCodec;
  /** Audio codec. Default `"aac"`. */
  audioCodec?: AudioCodec;
  /** Target video bitrate (bits/s) or a {@link Quality}. Default high. */
  videoBitrate?: number | Quality;
  /** Target audio bitrate (bits/s) or a {@link Quality}. Default medium. */
  audioBitrate?: number | Quality;
  /**
   * Composite over a transparent ground and keep the alpha channel. Only
   * `webm` (VP9) and `png_sequence` carry it in the browser; `mp4` does not.
   */
  alpha?: boolean;
  /**
   * Average N sub-frame instants into every frame instead of sampling one
   * (D10). Absent or one sample is blur off. N samples cost N× the render:
   * every layer is seeked, rasterized and composited once per sample.
   */
  motionBlur?: MotionBlurOptions;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderResult {
  bytes: Uint8Array;
  mimeType: string;
  /** File extension the bytes should be saved under, without the dot. */
  extension: string;
}

/** What a `png_sequence` zip carries next to its frames. */
interface PngSequenceManifest {
  format: "png_sequence";
  fps: number;
  width: number;
  height: number;
  count: number;
  pattern: string;
}

/** Read the canvas as PNG bytes — the frame, with whatever it holds. */
async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("The canvas could not be read as a PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Pack the frames into one stored (uncompressed) zip with a manifest.
 *
 * Stored, because a PNG is already deflate-compressed and a second pass costs
 * seconds per frame for nothing. fflate's streaming writer is used so the PNG
 * buffers can be released as they go in rather than being held alongside a
 * second copy inside the archive.
 */
async function zipPngSequence(
  frames: Uint8Array[],
  manifest: PngSequenceManifest
): Promise<Uint8Array> {
  const { Zip, ZipPassThrough } = await import("fflate");
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else if (data.length > 0) chunks.push(data);
  });

  const push = (name: string, bytes: Uint8Array): void => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
  };

  frames.forEach((bytes, i) => {
    push(`frame_${String(i + 1).padStart(6, "0")}.png`, bytes);
  });
  push(
    "manifest.json",
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
  );
  zip.end();
  if (failure) throw failure;

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Render aborted", "AbortError");
  }
}

/** Decode an image once and cache it for reuse across frames. */
function makeImageLoader(): (url: string) => Promise<HTMLImageElement | null> {
  const cache = new Map<string, HTMLImageElement>();
  return async (url: string) => {
    const cached = cache.get(url);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    try {
      await img.decode();
    } catch {
      // Fall through; naturalWidth check below rejects unusable images.
    }
    if (img.naturalWidth > 0) {
      cache.set(url, img);
      return img;
    }
    return null;
  };
}

/**
 * Render the timeline and return the encoded bytes, the MIME type, and the
 * extension they should be saved under. Throws an `AbortError` if `signal` is
 * aborted, or an `Error` if no compositor backend (WebGPU or the Canvas2D
 * fallback) can be initialised.
 */
export async function renderTimeline(
  opts: RenderTimelineOptions
): Promise<RenderResult> {
  const { tracks, clips, fps, durationMs, resolveUrl, signal, onProgress } =
    opts;

  const format: BrowserExportFormat = opts.format ?? "mp4";

  if (fps <= 0) throw new Error("fps must be positive");
  if (durationMs <= 0) throw new Error("durationMs must be positive");
  if (opts.alpha === true && format === "mp4") {
    // The same refusal the server makes: H.264 in MP4 has no alpha plane any
    // player reads, and encoding it opaque would answer a different question.
    throw new Error(
      'The "mp4" format has no alpha channel. Export with transparency as ' +
        "webm or png_sequence."
    );
  }

  // H.264/HEVC require even dimensions; clamp to keep the encoder happy.
  const width = Math.max(2, Math.floor(opts.width / 2) * 2);
  const height = Math.max(2, Math.floor(opts.height / 2) * 2);
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

  // Resolve each asset url at most once across the whole render. Cached by
  // the in-flight promise (not the resolved value) so the per-frame layer
  // resolution below — which now resolves every layer of a frame
  // concurrently — can't kick off a second `resolveUrl` for the same asset
  // before the first one has settled.
  const urlCache = new Map<string, Promise<string | undefined>>();
  const resolveCached = (assetId: string): Promise<string | undefined> => {
    let pending = urlCache.get(assetId);
    if (!pending) {
      pending = resolveUrl(assetId);
      urlCache.set(assetId, pending);
    }
    return pending;
  };

  onProgress?.({ phase: "preparing", frame: 0, totalFrames, ratio: 0 });
  throwIfAborted(signal);

  const [
    {
      BufferTarget,
      CanvasSource,
      Mp4OutputFormat,
      WebMOutputFormat,
      Output,
      QUALITY_HIGH,
      QUALITY_MEDIUM,
      AudioBufferSource: AudioBufferSourceCtor
    },
    { createCompositor }
  ] = await Promise.all([
    import("mediabunny"),
    import("../preview/gpu/createCompositor")
  ]);

  // An export bakes its frames into a file, so a title drawn before its face
  // arrives is wrong for good — the preview's "cache nothing yet" answer is
  // not enough here. Waiting costs one fetch of files the editor has usually
  // loaded already.
  await ensureBundledFontsLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const blur = resolveMotionBlur(opts.motionBlur);
  /**
   * Where the shutter window is summed, and what the encoder then reads.
   *
   * The compositor owns `canvas` — a WebGPU swap chain on the GPU backend —
   * so a blurred frame cannot accumulate on it. With blur off there is no
   * second canvas at all and the encoder reads the compositor's own, exactly
   * as it did before.
   */
  const blurCanvas =
    blur.samplesPerFrame > 1 ? document.createElement("canvas") : null;
  if (blurCanvas) {
    blurCanvas.width = width;
    blurCanvas.height = height;
  }
  const blurCtx = blurCanvas?.getContext("2d") ?? null;
  const frameCanvas = blurCanvas ?? canvas;
  const blurGeometry = { canvasWidth: width, canvasHeight: height };

  const { compositor, init } = await createCompositor(canvas);
  const videoPool = new OffscreenVideoPool();
  const captionRasterizer = new CaptionRasterizer();
  const textRasterizer = new TextRasterizer();
  const shapeRasterizer = new ShapeRasterizer();
  const loadImage = makeImageLoader();

  try {
    if (!init.ok) {
      throw new Error(init.reason ?? "Timeline compositor unavailable");
    }
    compositor.resize(width, height);
    compositor.setAlpha(opts.alpha === true);

    const isSequence = format === "png_sequence";
    // A PNG sequence has no muxer and no soundtrack: the frames are stills.
    const muxer = isSequence
      ? null
      : new Output({
          format:
            format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(),
          target: new BufferTarget()
        });

    const videoSource = muxer
      ? new CanvasSource(frameCanvas, {
          codec: opts.videoCodec ?? (format === "webm" ? "vp9" : "avc"),
          bitrate: opts.videoBitrate ?? QUALITY_HIGH,
          // mediabunny defaults to `discard`, which would drop the channel the
          // transparent compositor just drew. VP9 emits it as packet side
          // data, which WebM carries.
          alpha: opts.alpha === true ? "keep" : "discard"
        })
      : null;
    if (muxer && videoSource) {
      muxer.addVideoTrack(videoSource, { frameRate: fps });
    }

    // Mix the audio down before encoding video so the soundtrack is ready to
    // hand to the muxer in one shot.
    onProgress?.({ phase: "audio", frame: 0, totalFrames, ratio: 0 });
    const audioBuffer = muxer
      ? await renderTimelineAudio({
          clips,
          tracks,
          durationMs,
          resolveUrl: resolveCached
        })
      : null;
    throwIfAborted(signal);

    let audioSource: AudioBufferSource | null = null;
    if (muxer && audioBuffer) {
      audioSource = new AudioBufferSourceCtor({
        // AAC is not a legal WebM track; Opus is what the container carries.
        codec: opts.audioCodec ?? (format === "webm" ? "opus" : "aac"),
        bitrate: opts.audioBitrate ?? QUALITY_MEDIUM
      });
      muxer.addAudioTrack(audioSource);
    }

    await muxer?.start();

    if (audioSource && audioBuffer) {
      await audioSource.add(audioBuffer);
      audioSource.close();
    }

    /** PNG bytes per frame, filled only on the `png_sequence` path. */
    const pngFrames: Uint8Array[] = [];

    // Video/overlay clips release their pooled `<video>` element as soon as
    // their fixed time range has fully passed. Each clip is a single
    // contiguous span, so a released clip can never be seeked again — this
    // caps live media elements at the overlap width instead of the whole
    // export's clip count.
    const videoClipsByEnd = clips
      .filter((c) => c.mediaType === "video" || c.mediaType === "overlay")
      .sort((a, b) => a.startMs + a.durationMs - (b.startMs + b.durationMs));
    let releasePastIndex = 0;

    // Motion-design animations resolve against the sequence resolution (px),
    // matching the live preview. The compile cache lives for the whole render.
    const animCanvas = {
      width: opts.width,
      height: opts.height,
      measureText: textMeasurer()
    };
    const animCache = createAnimationCompileCache();

    const frameDurationSec = 1 / fps;
    const frameMs = 1000 / fps;

    /**
     * Composite one instant onto the compositor's canvas.
     *
     * One call is a whole frame with motion blur off, and one sample of the
     * shutter window with it on — the same resolve, seek and composite either
     * way, so a blurred export is N of the export it would otherwise have been.
     */
    const composeAt = async (timeMs: number): Promise<void> => {
      const { layers, precomposites } = computeActiveLayersWithHorizon(
        tracks,
        clips,
        timeMs,
        {
          // Group transforms live in the same space the animations sample in.
          canvas: animCanvas,
          animationCache: animCache
        }
      );

      /**
       * The pixels one layer draws. A video's are the slow part — the pool has
       * to seek and wait for the decode — so every layer of a frame is resolved
       * concurrently and the mapping runs after, in scene order.
       */
      const sourceFor = async (
        layer: ActiveLayer,
        anim: AnimatedLayerProps
      ): Promise<ResolvedCompositeSource | null> => {
        if (layer.kind === "caption" && layer.caption) {
          const bitmap = captionRasterizer.rasterize(
            layer.caption,
            width,
            height
          );
          return bitmap ? { source: bitmap, untransformed: true } : null;
        }
        if (layer.kind === "text" && layer.textStyle) {
          // Staggered per-word motion is drawn into the raster itself,
          // through the same rasterizer the live preview uses.
          const stagger = resolveTextStaggerContext(
            layer.clip,
            timeMs,
            animCanvas,
            animCache
          );
          const bitmap = textRasterizer.rasterize(
            layer.textStyle,
            width,
            height,
            stagger
          );
          return bitmap ? { source: bitmap } : null;
        }
        if (layer.kind === "shape") {
          // The animated style carries a driven trim range; without it a trim
          // animation would rasterize its first frame and hold.
          const shapeStyle = anim.shapeStyle ?? layer.shapeStyle;
          if (!shapeStyle) return null;
          const bitmap = shapeRasterizer.rasterize(shapeStyle, width, height);
          return bitmap ? { source: bitmap } : null;
        }

        if (!layer.assetId) return null;
        const url = await resolveCached(layer.assetId);
        if (!url) return null;

        if (layer.kind === "video") {
          const el = await videoPool.seek(
            layer.clipId,
            url,
            clipSourceTimeSec(layer.clip, timeMs),
            signal
          );
          return el.videoWidth === 0 ? null : { source: el };
        }
        const img = await loadImage(url);
        return img ? { source: img } : null;
      };

      // A matte source is held out of `layers` by the scene model, so it is
      // reached through the layer it mattes and decoded with it.
      const withMatteSources = (layer: ActiveLayer): ActiveLayer[] =>
        layer.matte ? [layer, ...withMatteSources(layer.matte.layer)] : [layer];
      const needed = layers.flatMap(withMatteSources);
      const sources = new Map<ActiveLayer, ResolvedCompositeSource>();
      await Promise.all(
        needed.map(async (layer) => {
          // Rasterizing a layer can depend on its sampled props (a shape's trim
          // range), and this prefetch runs before `buildCompositeLayer` samples
          // them, so it samples them itself. The compile cache makes the second
          // call a lookup.
          const source = await sourceFor(
            layer,
            resolveAnimatedLayerProps(layer, timeMs, animCanvas, animCache)
          );
          if (source) sources.set(layer, source);
        })
      );

      const composite: CompositeLayer[] = [];
      for (const layer of layers) {
        const built = buildCompositeLayer(layer, {
          atMs: timeMs,
          canvas: animCanvas,
          animationCache: animCache,
          resolveSource: (target) => sources.get(target) ?? null
        });
        if (built) composite.push(built);
      }

      compositor.setLayers(
        composite,
        buildCompositePrecomposites(precomposites)
      );
      compositor.render();
      await compositor.flush();
    };

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      const timeMs = (frame * 1000) / fps;

      while (
        releasePastIndex < videoClipsByEnd.length &&
        videoClipsByEnd[releasePastIndex].startMs +
          videoClipsByEnd[releasePastIndex].durationMs <
          timeMs
      ) {
        videoPool.release(videoClipsByEnd[releasePastIndex].id);
        releasePastIndex++;
      }

      const sampleTimes = motionBlurSampleTimes(
        timeMs,
        frameMs,
        opts.motionBlur
      );
      if (!blurCtx || sampleTimes.length === 1) {
        await composeAt(timeMs);
      } else {
        seedBlurAccumulation(blurCtx, blurGeometry);
        for (const sampleMs of sampleTimes) {
          throwIfAborted(signal);
          await composeAt(sampleMs);
          accumulateBlurSample(blurCtx, canvas, blur.weight, blurGeometry);
        }
      }

      if (videoSource) {
        await videoSource.add(frame * frameDurationSec, frameDurationSec);
      } else {
        pngFrames.push(await canvasPng(frameCanvas));
      }

      onProgress?.({
        phase: "video",
        frame: frame + 1,
        totalFrames,
        ratio: (frame + 1) / totalFrames
      });
    }

    videoSource?.close();

    onProgress?.({
      phase: "finalizing",
      frame: totalFrames,
      totalFrames,
      ratio: 1
    });

    if (!muxer) {
      const bytes = await zipPngSequence(pngFrames, {
        format: "png_sequence",
        fps,
        width,
        height,
        count: pngFrames.length,
        pattern: "frame_%06d.png"
      });
      return { bytes, mimeType: "application/zip", extension: "zip" };
    }

    await muxer.finalize();

    const buffer = muxer.target.buffer;
    if (!buffer) {
      throw new Error("Encoding produced no output");
    }
    return {
      bytes: new Uint8Array(buffer),
      mimeType: format === "webm" ? "video/webm" : "video/mp4",
      extension: format
    };
  } finally {
    compositor.dispose();
    videoPool.dispose();
    captionRasterizer.dispose();
    textRasterizer.dispose();
    shapeRasterizer.dispose();
  }
}
