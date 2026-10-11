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
 *   2. decodes each video source at its precise timestamp,
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
import { computeModel3DBakeHash } from "@nodetool-ai/timeline";
import type {
  MediaTrack,
  TimelineClip,
  TimelineTempo,
  TimelineCamera2D,
  TimelineTrack
} from "@nodetool-ai/timeline";

import type { CompositeLayer } from "../preview/gpu/types";
import {
  accumulateBlurSample,
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  expandTemporalClips,
  motionBlurSampleTimes,
  layerShutterTime,
  resolveAnimatedLayerProps,
  resolveFrameMotionBlur,
  resolveTextStaggerContext,
  seedBlurAccumulation
} from "@nodetool-ai/timeline/render";
import type {
  ActiveLayer,
  AnimatedLayerProps,
  FrameSourceWindow,
  MotionBlurOptions,
  RasterWindow
} from "@nodetool-ai/timeline/render";
import {
  buildCompositeLayer,
  buildCompositeAdjustments,
  buildCompositePrecomposites,
  rasterWindowMargin,
  type ResolvedCompositeSource
} from "../preview/compositeLayers";
import { Model3DLayerSource } from "../preview/Model3DLayerSource";
import {
  logPreviewFailure,
  previewFailureText,
  type PreviewFailure
} from "../preview/previewFailure";
import {
  alphaBakesToProbe,
  guardBakeHash,
  probeAlphaBake,
  type BakeUndecodable
} from "../preview/bakeDecoding";
import { CaptionRasterizer } from "../preview/captionRender";
import { TextRasterizer } from "../preview/textRender";
import { ensureBundledFontsLoaded, ensureGoogleFontsLoaded } from "../preview/fontLoading";
import { textMeasurer } from "../preview/textMeasure";
import { ShapeRasterizer } from "../preview/shapeRender";
import { BitmapFrameScope } from "../preview/BitmapFrameScope";
import { OffscreenVideoPool } from "./OffscreenVideoPool";
import { renderTimelineAudio } from "./renderAudio";

// mediabunny and the WebGPU compositor are imported dynamically inside
// `renderTimeline` so they (and their top-level WebGPU/WebCodecs references)
// are only loaded in the browser when an export actually runs — never at
// module-eval time, which keeps the editor importable under jsdom.

/** Containers the browser exporter can write. */
const BROWSER_EXPORT_FORMATS = ["mp4", "webm", "png_sequence"] as const;

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
  mediaTracks?: MediaTrack[];
  camera2d?: TimelineCamera2D | null;
  /** Sequence resolution in pixels. */
  width: number;
  height: number;
  fps: number;
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  /** Resolve an asset id to a playable URL (or undefined when unavailable). */
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  /** Tempo the midi clips are read against. Defaults to `DEFAULT_TEMPO`. */
  tempo?: TimelineTempo;
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
  /**
   * The encoded file. A `png_sequence` zip comes back as a `Blob` assembled
   * from per-frame parts, so the whole archive is never one contiguous buffer.
   */
  bytes: Uint8Array | Blob;
  mimeType: string;
  /** File extension the bytes should be saved under, without the dot. */
  extension: string;
  /**
   * Bakes this browser could not play, drawn from their live 3D layer
   * instead (§R6). Empty on almost every render; an entry means the file
   * holds the proxy rather than the baked picture.
   */
  degradations: BakeUndecodable[];
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
 * Incremental stored (uncompressed) zip writer for a PNG sequence.
 *
 * Stored, because a PNG is already deflate-compressed and a second pass costs
 * seconds per frame for nothing. Each frame is handed in as it is rendered and
 * the archive bytes go straight into Blob parts, so the caller can drop the
 * frame immediately and the finished zip is never concatenated into one
 * contiguous buffer.
 */
async function createPngZipWriter(): Promise<{
  addFrame: (index: number, bytes: Uint8Array) => void;
  finish: (manifest: PngSequenceManifest) => Blob;
}> {
  const { Zip, ZipPassThrough } = await import("fflate");
  const parts: Blob[] = [];
  let pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else if (data.length > 0) pending.push(data);
  });
  const flush = (): void => {
    if (pending.length > 0) {
      parts.push(new Blob(pending as BlobPart[]));
      pending = [];
    }
  };
  const push = (name: string, bytes: Uint8Array): void => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
    flush();
    if (failure) throw failure;
  };
  return {
    addFrame: (index, bytes) => {
      push(`frame_${String(index + 1).padStart(6, "0")}.png`, bytes);
    },
    finish: (manifest) => {
      push(
        "manifest.json",
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
      );
      zip.end();
      flush();
      if (failure) throw failure;
      return new Blob(parts, { type: "application/zip" });
    }
  };
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
  await ensureGoogleFontsLoaded(clips);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const hasMotionBlur = clips.some((clip) => (clip.motionBlur?.samplesPerFrame ?? 1) > 1) || (opts.motionBlur?.samplesPerFrame ?? 1) > 1;
  /**
   * Where the shutter window is summed, and what the encoder then reads.
   *
   * The compositor owns `canvas` — a WebGPU swap chain on the GPU backend —
   * so a blurred frame cannot accumulate on it. With blur off there is no
   * second canvas at all and the encoder reads the compositor's own, exactly
   * as it did before.
   */
  const blurCanvas =
    hasMotionBlur ? document.createElement("canvas") : null;
  if (blurCanvas) {
    blurCanvas.width = width;
    blurCanvas.height = height;
  }
  const blurCtx = blurCanvas?.getContext("2d") ?? null;
  const frameCanvas = blurCanvas ?? canvas;
  const blurGeometry = { canvasWidth: width, canvasHeight: height };

  // A WebGPU device loss or validation error leaves the canvas frozen or
  // blank, so the frame loop fails the export on the first one rather than
  // encoding the remaining frames from a dead device.
  let gpuFailure: PreviewFailure | null = null;
  const { compositor, backend, init } = await createCompositor(canvas, (failure) => {
    logPreviewFailure(failure);
    gpuFailure ??= failure;
  });
  const throwIfGpuFailed = (): void => {
    if (gpuFailure) {
      throw new Error(`Export renderer failed: ${previewFailureText(gpuFailure)}`, {
        cause: gpuFailure.error
      });
    }
  };
  const videoPool = new OffscreenVideoPool();
  // The export's own session pool: an export can run while the editor previews,
  // and two pools of two contexts is what the cap is sized for. Disposed with
  // everything else in the `finally` below.
  const model3dSource = new Model3DLayerSource({ resolveUrl: resolveCached });
  // Text and shapes rasterize only where they draw, placed through
  // `sourceWindow`, as the preview does. The WebGPU compositor reads windows;
  // Canvas 2D does not.
  const windowedRasters = backend === "webgpu";
  const frameWindow = (window: RasterWindow | undefined): FrameSourceWindow | undefined =>
    window && { x: window.x, y: window.y, frameWidth: width, frameHeight: height };
  const captionRasterizer = new CaptionRasterizer();
  const textRasterizer = new TextRasterizer();
  const shapeRasterizer = new ShapeRasterizer();
  const loadImage = makeImageLoader();
  /** The muxer once built, so the `finally` can cancel it if it never finalized. */
  let activeMuxer: { state: string; cancel: () => Promise<void> } | null = null;

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
    activeMuxer = muxer;

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
          // The video holds `totalFrames` whole frames, so the soundtrack is
          // cut to that length rather than the unrounded timeline length.
          durationMs: (totalFrames * 1000) / fps,
          resolveUrl: resolveCached,
          tempo: opts.tempo,
          signal
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

    /** Streaming zip, built only on the `png_sequence` path. */
    const pngZip = isSequence ? await createPngZipWriter() : null;

    // Video/overlay clips release their pooled source as soon as
    // their fixed time range has fully passed. Each clip is a single
    // contiguous span, so a released clip can never be seeked again — this
    // caps live media elements at the overlap width instead of the whole
    // export's clip count. The scene decodes repeater and echo copies under
    // their own ids, and a baked 3D clip plays its bake as a video, so both
    // are released the same way.
    const videoClipsByEnd = expandTemporalClips(clips)
      .filter(
        (c) =>
          c.mediaType === "video" ||
          c.mediaType === "overlay" ||
          (c.mediaType === "model3d" && c.model3dStyle?.bake !== undefined)
      )
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
    /**
     * A `model3d` clip plays its Blender bake as a video layer while the bake
     * still matches the live document, so the export resolves the same hash
     * the inspector and the validator do (design §D6).
     */
    const liveBakeHash = (clip: TimelineClip): string =>
      computeModel3DBakeHash(clip, {
        fps,
        width: opts.width,
        height: opts.height
      });

    // An alpha bake this browser cannot decode is checked once, before the
    // first frame: a file is written here, so a bake that turns out to be an
    // opaque box has to be swapped for the live layer everywhere rather than
    // part way through (§R6).
    const degradations: BakeUndecodable[] = [];
    for (const bake of alphaBakesToProbe(clips, liveBakeHash)) {
      const url = await resolveCached(bake.assetId);
      if (!url) continue;
      const reason = await probeAlphaBake(url, signal);
      if (reason) degradations.push({ ...bake, reason });
    }
    const model3dBakeHash = guardBakeHash(liveBakeHash, degradations);

    const frameDurationSec = 1 / fps;
    const frameMs = 1000 / fps;

    /**
     * Composite one instant onto the compositor's canvas.
     *
     * One call is a whole frame with motion blur off, and one sample of the
     * shutter window with it on — the same resolve, seek and composite either
     * way, so a blurred export is N of the export it would otherwise have been.
     */
    const composeAt = async (timeMs: number, frameTimeMs = timeMs, sampleIndex = 0, sampleCount = 1): Promise<void> => {
      const bitmapFrame = new BitmapFrameScope();
      try {
        const { layers, precomposites, adjustments } = computeActiveLayersWithHorizon(
          tracks,
          clips,
          timeMs,
          {
            // Group transforms live in the same space the animations sample in.
            canvas: animCanvas,
            animationCache: animCache,
            model3dBakeHash,
            mediaTracks: opts.mediaTracks,
            camera2d: opts.camera2d,
            tempo: opts.tempo,
            layerTimeMs: (clip) => layerShutterTime(clip, frameTimeMs, sampleIndex, sampleCount, frameMs, opts.motionBlur)
          }
        );

        /**
         * The pixels one layer draws. Video decoding is the slow part, so every
         * layer of a frame resolves concurrently before scene-order mapping.
         */
        const sourceFor = async (
          layer: ActiveLayer,
          anim: AnimatedLayerProps
        ): Promise<ResolvedCompositeSource | null> => {
          const layerTimeMs = layerShutterTime(layer.clip, frameTimeMs, sampleIndex, sampleCount, frameMs, opts.motionBlur);
          if (layer.kind === "caption" && layer.caption) {
            const bitmap = captionRasterizer.rasterize(
              layer.caption,
              width,
              height,
              bitmapFrame
            );
            return bitmap ? { source: bitmap, untransformed: true } : null;
          }
          if (layer.kind === "text" && anim.textStyle) {
            // Staggered per-word motion is drawn into the raster itself,
            // through the same rasterizer the live preview uses.
            const stagger = resolveTextStaggerContext(
              layer.clip,
              layerTimeMs,
              animCanvas,
              animCache,
              opts.tempo
            );
            const bitmap = textRasterizer.rasterize(
              anim.textStyle,
              width,
              height,
              stagger,
              bitmapFrame,
              windowedRasters ? rasterWindowMargin(layer, anim) : undefined
            );
            return bitmap
              ? { source: bitmap, window: frameWindow(textRasterizer.windowOf(bitmap)) }
              : null;
          }
          if (layer.kind === "shape") {
            // The animated style carries a driven trim range; without it a trim
            // animation would rasterize its first frame and hold.
            const shapeStyle = anim.shapeStyle ?? layer.shapeStyle;
            if (!shapeStyle) return null;
            const bitmap = shapeRasterizer.rasterize(
              shapeStyle,
              width,
              height,
              bitmapFrame,
              windowedRasters ? rasterWindowMargin(layer, anim) : undefined
            );
            return bitmap
              ? { source: bitmap, window: frameWindow(shapeRasterizer.windowOf(bitmap)) }
              : null;
          }

          if (layer.kind === "model3d") {
            // Awaited rather than polled: a frame is written to the file once, so
            // a session that is still loading must not become a missing model.
            const session = await model3dSource.load(layer);
            if (!session) return null;
            const canvas3d = model3dSource.frame(layer, anim, { width, height });
            return canvas3d ? { source: canvas3d } : null;
          }

          if (!layer.assetId) return null;
          const url = await resolveCached(layer.assetId);
          if (!url) return null;

          if (layer.kind === "video") {
            // A baked 3D clip's video starts at its own first frame however the
            // clip is trimmed or retimed, so the scene model hands the seek time
            // down rather than letting the source mapping recompute it (§D6).
            const decoded = await videoPool.seek(
              layer.clipId,
              url,
              layer.bakeSourceTimeSec ?? clipSourceTimeSec(layer.clip, layerTimeMs),
              signal
            );
            const width = decoded instanceof HTMLVideoElement
              ? decoded.videoWidth
              : decoded.width;
            return width === 0 ? null : { source: decoded };
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
            const layerTimeMs = layerShutterTime(layer.clip, frameTimeMs, sampleIndex, sampleCount, frameMs, opts.motionBlur);
            // Rasterizing a layer can depend on its sampled props (a shape's trim
            // range), and this prefetch runs before `buildCompositeLayer` samples
            // them, so it samples them itself. The compile cache makes the second
            // call a lookup.
            const source = await sourceFor(
              layer,
              resolveAnimatedLayerProps(layer, layerTimeMs, animCanvas, animCache, {
                mediaTracks: opts.mediaTracks ?? [],
                clips,
                tempo: opts.tempo
              })
            );
            if (source) sources.set(layer, source);
          })
        );

        const composite: CompositeLayer[] = [];
        for (const layer of layers) {
          const layerTimeMs = layerShutterTime(layer.clip, frameTimeMs, sampleIndex, sampleCount, frameMs, opts.motionBlur);
          const built = buildCompositeLayer(layer, {
            atMs: layerTimeMs,
            canvas: animCanvas,
            animationCache: animCache,
            tracking: { mediaTracks: opts.mediaTracks ?? [], clips, tempo: opts.tempo },
            resolveSource: (target) => sources.get(target) ?? null
          });
          if (built) composite.push(built);
        }

        compositor.setLayers(
          composite,
          buildCompositePrecomposites(precomposites),
          buildCompositeAdjustments(adjustments)
        );
        compositor.render();
        await compositor.flush();
        if (window.__nodetoolTimelinePerf) {
          canvas.dataset.textBitmapCacheBytes = String(textRasterizer.residentBytes);
          canvas.dataset.shapeBitmapCacheBytes = String(shapeRasterizer.residentBytes);
        }
      } finally {
        bitmapFrame.release();
      }
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

      const blur = resolveFrameMotionBlur(clips, opts.motionBlur, timeMs, frameMs, tracks);
      const sampleTimes = motionBlurSampleTimes(
        timeMs,
        frameMs,
        blur
      );
      if (!blurCtx || sampleTimes.length === 1) {
        await composeAt(timeMs);
        if (blurCtx) {
          blurCtx.setTransform(1, 0, 0, 1, 0, 0);
          blurCtx.globalCompositeOperation = "copy";
          blurCtx.globalAlpha = 1;
          blurCtx.drawImage(canvas, 0, 0);
          blurCtx.globalCompositeOperation = "source-over";
        }
      } else {
        seedBlurAccumulation(blurCtx, blurGeometry);
        for (const [sampleIndex, sampleMs] of sampleTimes.entries()) {
          throwIfAborted(signal);
          await composeAt(sampleMs, timeMs, sampleIndex, sampleTimes.length);
          accumulateBlurSample(blurCtx, canvas, blur.weight, blurGeometry);
        }
      }
      throwIfGpuFailed();

      if (videoSource) {
        await videoSource.add(frame * frameDurationSec, frameDurationSec);
      } else if (pngZip) {
        pngZip.addFrame(frame, await canvasPng(frameCanvas));
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
      const bytes = pngZip!.finish({
        format: "png_sequence",
        fps,
        width,
        height,
        count: totalFrames,
        pattern: "frame_%06d.png"
      });
      return {
        bytes,
        mimeType: "application/zip",
        extension: "zip",
        degradations
      };
    }

    await muxer.finalize();

    const buffer = muxer.target.buffer;
    if (!buffer) {
      throw new Error("Encoding produced no output");
    }
    return {
      bytes: new Uint8Array(buffer),
      mimeType: format === "webm" ? "video/webm" : "video/mp4",
      extension: format,
      degradations
    };
  } finally {
    // Aborted or failed after `start()`: the encoder and its hardware session
    // are still open until the output is cancelled.
    if (activeMuxer && activeMuxer.state === "started") {
      await activeMuxer.cancel().catch(() => undefined);
    }
    compositor.dispose();
    videoPool.dispose();
    model3dSource.dispose();
    captionRasterizer.dispose();
    textRasterizer.dispose();
    shapeRasterizer.dispose();
  }
}
