/**
 * renderTimeline — offline, frame-by-frame export of a timeline to an MP4.
 *
 * The renderer drives the *same* {@link WebGPUCompositor} and the *same*
 * {@link computeActiveLayers} scene description as the live preview, so the
 * exported video is 1:1 with what playback showed. Instead of a real-time rAF
 * loop it:
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
  trackZ
} from "../preview/sceneModel";
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
 * `AbortError` if `signal` is aborted, or an `Error` if WebGPU is unavailable.
 */
export async function renderTimeline(
  opts: RenderTimelineOptions
): Promise<RenderResult> {
  const {
    tracks,
    clips,
    fps,
    durationMs,
    resolveUrl,
    signal,
    onProgress
  } = opts;

  if (fps <= 0) throw new Error("fps must be positive");
  if (durationMs <= 0) throw new Error("durationMs must be positive");

  // H.264/HEVC require even dimensions; clamp to keep the encoder happy.
  const width = Math.max(2, Math.floor(opts.width / 2) * 2);
  const height = Math.max(2, Math.floor(opts.height / 2) * 2);
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

  // Resolve each asset url at most once across the whole render.
  const urlCache = new Map<string, string | undefined>();
  const resolveCached = async (
    assetId: string
  ): Promise<string | undefined> => {
    if (urlCache.has(assetId)) return urlCache.get(assetId);
    const url = await resolveUrl(assetId);
    urlCache.set(assetId, url);
    return url;
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
    { WebGPUCompositor }
  ] = await Promise.all([
    import("mediabunny"),
    import("../preview/gpu/compositor")
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const compositor = new WebGPUCompositor();
  const videoPool = new OffscreenVideoPool();
  const loadImage = makeImageLoader();

  try {
    const init = await compositor.init(canvas);
    if (!init.ok) {
      throw new Error(init.reason ?? "WebGPU compositor unavailable");
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

    const frameDurationSec = 1 / fps;
    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      const timeMs = (frame * 1000) / fps;

      const layers = computeActiveLayers(tracks, clips, timeMs);
      const composite: CompositeLayer[] = [];

      for (const layer of layers) {
        if (!layer.assetId) continue;
        const url = await resolveCached(layer.assetId);
        if (!url) continue;

        if (layer.kind === "video") {
          const el = await videoPool.seek(
            url,
            clipSourceTimeSec(layer.clip, timeMs)
          );
          if (el.videoWidth === 0) continue;
          composite.push({
            id: `v:${layer.clipId}`,
            source: el,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            zIndex: trackZ(layer.trackIndex),
            transform: layer.transform,
            borderRadius: layer.borderRadius,
            effects: layer.effects,
            trackEffects: layer.trackEffects
          });
        } else {
          const img = await loadImage(url);
          if (!img) continue;
          composite.push({
            id: `i:${layer.clipId}`,
            source: img,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            zIndex: trackZ(layer.trackIndex),
            transform: layer.transform,
            borderRadius: layer.borderRadius,
            effects: layer.effects,
            trackEffects: layer.trackEffects
          });
        }
      }

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

    onProgress?.({ phase: "finalizing", frame: totalFrames, totalFrames, ratio: 1 });
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error("Encoding produced no output");
    }
    return { bytes: new Uint8Array(buffer), mimeType: "video/mp4" };
  } finally {
    compositor.dispose();
    videoPool.dispose();
  }
}
