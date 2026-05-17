/**
 * Timeline export orchestrator.
 *
 * Pipeline:
 *   1. Render audio offline via OfflineAudioContext (mirrors the live
 *      AudioGraph), if the timeline has audible clips.
 *   2. For each video frame t = i / fps:
 *      a. Take a pure layer snapshot at t.
 *      b. Resolve sources (seek videos, load images) via the media cache.
 *      c. Composite the frame on the offscreen WebGPU canvas.
 *      d. Wrap the canvas in a VideoFrame, encode via VideoEncoder.
 *   3. Push the rendered AudioBuffer through AudioEncoder in 1024-sample
 *      chunks (AAC's frame size).
 *   4. Mux video + audio chunks via mp4-muxer; finalize to a Blob.
 *
 * The whole thing is AbortSignal-aware — every await point checks before
 * proceeding and the encoders are torn down on cancel.
 */

import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import type { CompositeLayer } from "../../../components/timeline/preview/gpu/types";

import { OffscreenCompositor } from "./OffscreenCompositor";
import { OfflineAudioRenderer } from "./OfflineAudioRenderer";
import { ExportMediaCache } from "./mediaCache";
import { snapshotLayers } from "./layerSnapshot";
import type {
  ExportCallbacks,
  ExportCapability,
  ExportOptions,
  ExportProgress,
  ExportResult,
  LayerSpec,
  TimelineSnapshot
} from "./types";

const AAC_FRAME_SIZE = 1024;
const DEFAULT_VIDEO_BITRATE = 8_000_000;
const DEFAULT_AUDIO_BITRATE = 192_000;
const DEFAULT_AUDIO_SAMPLE_RATE = 48_000;

/**
 * Reports whether the browser has the WebCodecs + WebGPU surface required
 * for export. Use this to gate the UI; without it, the dialog should
 * surface a friendly error rather than calling `exportTimeline`.
 */
export function checkExportSupport(): ExportCapability {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Export must run in a browser" };
  }
  if (
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !==
    "function"
  ) {
    return { ok: false, reason: "WebCodecs (VideoEncoder) not supported" };
  }
  if (
    typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder !==
    "function"
  ) {
    return { ok: false, reason: "WebCodecs (AudioEncoder) not supported" };
  }
  if (!("gpu" in navigator)) {
    return { ok: false, reason: "WebGPU not supported" };
  }
  return { ok: true };
}

/** Maps our `LayerSpec` + a resolved source element to a compositor layer. */
const LAYER_Z_BASE = 1000;
function trackZ(uiIndex: number): number {
  return LAYER_Z_BASE - uiIndex;
}

interface ResolvedLayer {
  spec: LayerSpec;
  source: HTMLVideoElement | HTMLImageElement;
}

function toCompositeLayer(resolved: ResolvedLayer): CompositeLayer {
  const { spec, source } = resolved;
  const prefix = source instanceof HTMLVideoElement ? "v" : "i";
  return {
    id: `${prefix}:${spec.clipId}`,
    source,
    opacity: spec.opacity,
    blendMode: spec.blendMode,
    zIndex: trackZ(spec.trackIndex),
    transform: spec.transform,
    borderRadius: spec.borderRadius,
    effects: spec.effects,
    trackEffects: spec.trackEffects
  };
}

export async function exportTimeline(
  snapshot: TimelineSnapshot,
  options: ExportOptions,
  callbacks: ExportCallbacks
): Promise<ExportResult> {
  const support = checkExportSupport();
  if (!support.ok) throw new Error(support.reason ?? "Export not supported");

  const {
    fps,
    width,
    height,
    durationMs,
    videoCodec = "avc",
    audioCodec = "aac",
    videoBitrate = DEFAULT_VIDEO_BITRATE,
    audioBitrate = DEFAULT_AUDIO_BITRATE,
    audioSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
    keyframeInterval = fps * 2
  } = options;
  const { signal, onProgress, resolveAssetUrl } = callbacks;

  if (fps <= 0 || durationMs <= 0 || width <= 0 || height <= 0) {
    throw new Error("Invalid sequence dimensions or duration");
  }

  const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
  // Allocate audio/video shares of the progress bar. Audio is fast (mostly
  // I/O + ctx.startRendering), video dominates.
  const AUDIO_FRACTION = audioCodec === null ? 0 : 0.1;
  const VIDEO_FRACTION = 1 - AUDIO_FRACTION;

  const emit = (
    stage: ExportProgress["stage"],
    framesDone: number,
    framesTotal: number,
    base: number,
    span: number
  ): void => {
    if (!onProgress) return;
    const local = framesTotal > 0 ? framesDone / framesTotal : 0;
    onProgress({
      stage,
      framesDone,
      framesTotal,
      fraction: Math.min(1, base + span * local)
    });
  };
  emit("audio", 0, 1, 0, AUDIO_FRACTION);

  // ── 1. Audio render ────────────────────────────────────────────────────
  let audioBuffer: AudioBuffer | null = null;
  if (audioCodec !== null) {
    const audioRenderer = new OfflineAudioRenderer();
    audioBuffer = await audioRenderer.render(snapshot.tracks, snapshot.clips, {
      durationMs,
      sampleRate: audioSampleRate,
      numberOfChannels: 2,
      resolveAssetUrl,
      signal
    });
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  emit("audio", 1, 1, 0, AUDIO_FRACTION);

  // ── 2. Compositor + media cache setup ──────────────────────────────────
  const compositor = new OffscreenCompositor();
  const compositorInit = await compositor.init(width, height);
  if (!compositorInit.ok) {
    throw new Error(compositorInit.reason);
  }
  const mediaCache = new ExportMediaCache();

  // ── 3. Muxer + encoders ────────────────────────────────────────────────
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoCodec, width, height },
    audio:
      audioBuffer && audioCodec
        ? {
            codec: audioCodec,
            numberOfChannels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate
          }
        : undefined,
    fastStart: "in-memory"
  });

  let firstError: Error | null = null;
  const recordError = (e: Error): void => {
    if (!firstError) firstError = e;
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (e) {
        recordError(e as Error);
      }
    },
    error: (e) => recordError(e)
  });
  videoEncoder.configure({
    codec: pickVideoCodecString(videoCodec, width, height),
    width,
    height,
    bitrate: videoBitrate,
    framerate: fps
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && audioCodec) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addAudioChunk(chunk, meta);
        } catch (e) {
          recordError(e as Error);
        }
      },
      error: (e) => recordError(e)
    });
    audioEncoder.configure({
      codec: audioCodec === "aac" ? "mp4a.40.2" : "opus",
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: audioBitrate
    });
  }

  // ── 4. Encode audio chunks ─────────────────────────────────────────────
  if (audioEncoder && audioBuffer) {
    encodeAudioBuffer(audioEncoder, audioBuffer);
  }

  // ── 5. Encode video frames ─────────────────────────────────────────────
  let framesEncoded = 0;
  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (firstError) throw firstError;

      const timeMs = (i * 1000) / fps;
      const specs = snapshotLayers(snapshot, timeMs);
      const resolved = await resolveLayers(
        specs,
        mediaCache,
        resolveAssetUrl,
        signal
      );
      const composeLayers = resolved.map(toCompositeLayer);
      await compositor.renderFrame(composeLayers);

      // Backpressure: don't queue more frames than the encoder can keep up
      // with. 4 is a small but useful buffer.
      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 1));
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      }

      const timestampUs = Math.round((i * 1_000_000) / fps);
      const durationUs = Math.round(1_000_000 / fps);
      const frame = new VideoFrame(compositor.outputCanvas, {
        timestamp: timestampUs,
        duration: durationUs
      });
      const keyFrame = i % keyframeInterval === 0;
      videoEncoder.encode(frame, { keyFrame });
      frame.close();

      framesEncoded++;
      emit("video", framesEncoded, frameCount, AUDIO_FRACTION, VIDEO_FRACTION);
    }

    // ── 6. Flush + finalize ──────────────────────────────────────────────
    emit("finalize", framesEncoded, frameCount, AUDIO_FRACTION, VIDEO_FRACTION);
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (firstError) throw firstError;
    muxer.finalize();
  } finally {
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      // already closed
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      // already closed
    }
    compositor.dispose();
    mediaCache.dispose();
  }

  const buffer = muxer.target.buffer;
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    durationMs,
    frameCount: framesEncoded,
    hasAudio: audioBuffer !== null
  };
}

/**
 * Picks a sensible codec string for `VideoEncoder.configure`. AVC profile
 * defaults to High @ Level 4.2, which covers up to 1080p60 / 4K30.
 */
function pickVideoCodecString(
  codec: NonNullable<ExportOptions["videoCodec"]>,
  width: number,
  height: number
): string {
  switch (codec) {
    case "avc": {
      // Level 4.2 (~ "2a" hex) is enough for 1080p60 / 4K30. For larger
      // formats, fall back to Level 5.1 ("33"); good enough for the
      // prototype's bitrate range.
      const pixels = width * height;
      const level = pixels > 1920 * 1080 ? "33" : "2a";
      return `avc1.6400${level}`;
    }
    case "hevc":
      return "hev1.1.6.L93.B0";
    case "vp9":
      return "vp09.00.10.08";
    case "av1":
      return "av01.0.04M.08";
  }
}

async function resolveLayers(
  specs: LayerSpec[],
  cache: ExportMediaCache,
  resolveAssetUrl: ExportCallbacks["resolveAssetUrl"],
  signal: AbortSignal | undefined
): Promise<ResolvedLayer[]> {
  const out: ResolvedLayer[] = [];
  for (const spec of specs) {
    const url = await resolveAssetUrl(spec.assetId);
    if (!url) continue;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    if (spec.mediaType === "video" || spec.mediaType === "overlay") {
      const sourceSec = clipSourceSeconds(spec);
      try {
        const el = await cache.getVideoAt(url, sourceSec, signal);
        out.push({ spec, source: el });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
        // Skip this layer for the frame; logging is per-frame so we keep
        // it sparse to avoid flooding the console on a bad asset.
      }
    } else if (spec.mediaType === "image") {
      try {
        const el = await cache.getImage(url, signal);
        out.push({ spec, source: el });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
      }
    }
  }
  return out;
}

/**
 * Translates a layer's playhead position into the source media's own time
 * axis. Mirrors PreviewCompositor's seek math: if speed isn't baked, one
 * timeline second consumes `rate` source seconds.
 */
function clipSourceSeconds(spec: LayerSpec): number {
  const rate = spec.speedBaked ? 1 : spec.speedMultiplier;
  return Math.max(
    0,
    (spec.intoClipTimelineMs / 1000) * rate + spec.inPointMs / 1000
  );
}

/**
 * Splits an AudioBuffer into AAC-sized chunks and feeds them to the
 * AudioEncoder. We pack channels into a single planar Float32 buffer (one
 * channel after another) because AudioData requires contiguous data.
 */
function encodeAudioBuffer(
  encoder: AudioEncoder,
  buffer: AudioBuffer
): void {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const totalFrames = buffer.length;

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 0;
  while (offset < totalFrames) {
    const frames = Math.min(AAC_FRAME_SIZE, totalFrames - offset);
    const packed = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      packed.set(channelData[c].subarray(offset, offset + frames), c * frames);
    }
    const timestampUs = Math.round((offset * 1_000_000) / sampleRate);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: timestampUs,
      data: packed
    });
    encoder.encode(data);
    data.close();
    offset += frames;
  }
}
