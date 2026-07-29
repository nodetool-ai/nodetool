/**
 * renderTimeline — offline, frame-by-frame export of a timeline to an MP4.
 *
 * The renderer drives the *same* compositor (WebGPU, or the Canvas2D fallback
 * via {@link createCompositor}) and the *same* {@link computeActiveLayers}
 * scene description as the live preview, so the exported video is 1:1 with what
 * playback showed. Instead of a real-time rAF loop it:
 *
 *   1. steps the playhead in exact `1 / fps` increments,
 *   2. seeks each video element to the precise source frame (waiting for
 *      `seeked`) so decoding is deterministic, not best-effort,
 *   3. composites at full sequence resolution into an offscreen canvas,
 *   4. encodes each frame with WebCodecs (via mediabunny) and muxes to MP4,
 *   5. mixes the audio tracks down offline (see {@link renderTimelineAudio}).
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
  clipSourceTimeSec,
  computeActiveLayers,
  createAnimationCompileCache,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  trackZ
} from "../preview/sceneModel";
import { CaptionRasterizer } from "../preview/captionRender";
import { TextRasterizer } from "../preview/textRender";
import { ShapeRasterizer } from "../preview/shapeRender";
import { OffscreenVideoPool } from "./OffscreenVideoPool";
import { renderTimelineAudio } from "./renderAudio";

// mediabunny and the WebGPU compositor are imported dynamically inside
// `renderTimeline` so they (and their top-level WebGPU/WebCodecs references)
// are only loaded in the browser when an export actually runs — never at
// module-eval time, which keeps the editor importable under jsdom.

export type RenderPhase = "preparing" | "audio" | "video" | "finalizing";

export interface RenderProgress {
  phase: RenderPhase;
  /** Frames encoded so far (video phase). */
  frame: number;
  totalFrames: number;
  /** Overall completion ratio in [0, 1]. */
  ratio: number;
}

export interface RenderTimelineOptions {
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
  /** Video codec. Default `"avc"` (H.264). */
  videoCodec?: VideoCodec;
  /** Audio codec. Default `"aac"`. */
  audioCodec?: AudioCodec;
  /** Target video bitrate (bits/s) or a {@link Quality}. Default high. */
  videoBitrate?: number | Quality;
  /** Target audio bitrate (bits/s) or a {@link Quality}. Default medium. */
  audioBitrate?: number | Quality;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderResult {
  bytes: Uint8Array;
  mimeType: string;
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
 * Render the timeline and return the encoded MP4 bytes. Throws an
 * `AbortError` if `signal` is aborted, or an `Error` if no compositor backend
 * (WebGPU or the Canvas2D fallback) can be initialised.
 */
export async function renderTimeline(
  opts: RenderTimelineOptions
): Promise<RenderResult> {
  const { tracks, clips, fps, durationMs, resolveUrl, signal, onProgress } =
    opts;

  if (fps <= 0) throw new Error("fps must be positive");
  if (durationMs <= 0) throw new Error("durationMs must be positive");

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

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

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

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    });

    const videoSource = new CanvasSource(canvas, {
      codec: opts.videoCodec ?? "avc",
      bitrate: opts.videoBitrate ?? QUALITY_HIGH
    });
    output.addVideoTrack(videoSource, { frameRate: fps });

    // Mix the audio down before encoding video so the soundtrack is ready to
    // hand to the muxer in one shot.
    onProgress?.({ phase: "audio", frame: 0, totalFrames, ratio: 0 });
    const audioBuffer = await renderTimelineAudio({
      clips,
      tracks,
      durationMs,
      resolveUrl: resolveCached
    });
    throwIfAborted(signal);

    let audioSource: AudioBufferSource | null = null;
    if (audioBuffer) {
      audioSource = new AudioBufferSourceCtor({
        codec: opts.audioCodec ?? "aac",
        bitrate: opts.audioBitrate ?? QUALITY_MEDIUM
      });
      output.addAudioTrack(audioSource);
    }

    await output.start();

    if (audioSource && audioBuffer) {
      await audioSource.add(audioBuffer);
      audioSource.close();
    }

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
    const animCanvas = { width: opts.width, height: opts.height };
    const animCache = createAnimationCompileCache();

    const frameDurationSec = 1 / fps;
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

      const layers = computeActiveLayers(tracks, clips, timeMs);

      // Resolve every layer's source concurrently — with several overlapping
      // videos this turns N sequential seek round-trips into one. Promise.all
      // preserves input order in its result array regardless of resolution
      // order, so the composite below still assembles in the original
      // (bottom-to-top) layer order.
      const resolved = await Promise.all(
        layers.map(async (layer): Promise<CompositeLayer | null> => {
          // Same per-frame animation resolution as the live compositor, so the
          // exported motion is 1:1 with the preview.
          const anim = resolveAnimatedLayerProps(
            layer,
            timeMs,
            animCanvas,
            animCache
          );
          if (layer.kind === "caption" && layer.caption) {
            const bitmap = captionRasterizer.rasterize(
              layer.caption,
              width,
              height
            );
            if (!bitmap) return null;
            return {
              id: `c:${layer.clipId}`,
              source: bitmap,
              opacity: anim.opacity,
              blendMode: layer.blendMode,
              zIndex: trackZ(layer.trackIndex),
              transform: anim.transform,
              mask: anim.mask
            };
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
            if (!bitmap) return null;
            return {
              id: `t:${layer.clipId}`,
              source: bitmap,
              opacity: anim.opacity,
              blendMode: layer.blendMode,
              zIndex: trackZ(layer.trackIndex),
              transform: anim.transform,
              mask: anim.mask,
              borderRadius: layer.borderRadius,
              effects: anim.effects ?? layer.effects,
              trackEffects: layer.trackEffects
            };
          }

          if (layer.kind === "shape" && layer.shapeStyle) {
            const bitmap = shapeRasterizer.rasterize(
              layer.shapeStyle,
              width,
              height
            );
            if (!bitmap) return null;
            return {
              id: `s:${layer.clipId}`,
              source: bitmap,
              opacity: anim.opacity,
              blendMode: layer.blendMode,
              zIndex: trackZ(layer.trackIndex),
              transform: anim.transform,
              mask: anim.mask,
              borderRadius: layer.borderRadius,
              effects: anim.effects ?? layer.effects,
              trackEffects: layer.trackEffects
            };
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
            if (el.videoWidth === 0) return null;
            return {
              id: `v:${layer.clipId}`,
              source: el,
              opacity: anim.opacity,
              blendMode: layer.blendMode,
              zIndex: trackZ(layer.trackIndex),
              transform: anim.transform,
              mask: anim.mask,
              borderRadius: layer.borderRadius,
              effects: anim.effects ?? layer.effects,
              trackEffects: layer.trackEffects
            };
          }

          const img = await loadImage(url);
          if (!img) return null;
          return {
            id: `i:${layer.clipId}`,
            source: img,
            opacity: anim.opacity,
            blendMode: layer.blendMode,
            zIndex: trackZ(layer.trackIndex),
            transform: anim.transform,
            mask: anim.mask,
            borderRadius: layer.borderRadius,
            effects: anim.effects ?? layer.effects,
            trackEffects: layer.trackEffects
          };
        })
      );
      const composite: CompositeLayer[] = resolved.filter(
        (layer): layer is CompositeLayer => layer !== null
      );

      compositor.setLayers(composite);
      compositor.render();
      await compositor.flush();

      await videoSource.add(frame * frameDurationSec, frameDurationSec);

      onProgress?.({
        phase: "video",
        frame: frame + 1,
        totalFrames,
        ratio: (frame + 1) / totalFrames
      });
    }

    videoSource.close();

    onProgress?.({
      phase: "finalizing",
      frame: totalFrames,
      totalFrames,
      ratio: 1
    });
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error("Encoding produced no output");
    }
    return { bytes: new Uint8Array(buffer), mimeType: "video/mp4" };
  } finally {
    compositor.dispose();
    videoPool.dispose();
    captionRasterizer.dispose();
    textRasterizer.dispose();
    shapeRasterizer.dispose();
  }
}
