/**
 * Audio-only exports: encode a mixed-down `AudioBuffer` as a WAV or MP3 file,
 * and render a whole timeline to one such file.
 *
 * The mixdown is {@link renderTimelineAudio}, the same offline mix the video
 * export muxes in, so the file holds what the preview plays: clip gain, fades,
 * track mute and solo, inserts and the master channel.
 */

import type {
  TimelineClip,
  TimelineMasterChannel,
  TimelineTempo,
  TimelineTrack
} from "@nodetool-ai/timeline";
import { renderTimelineAudio } from "./renderAudio";
import type { RenderProgress } from "./TimelineRenderer";

export type AudioFileFormat = "wav" | "mp3";

export const AUDIO_FILE_MIME: Record<AudioFileFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg"
};

/** Bitrate of a timeline MP3 export, in bits per second. */
export const TIMELINE_MP3_BITRATE = 320_000;

/**
 * Encode a rendered buffer as a 16-bit PCM WAV or an MP3 at `mp3Bitrate`.
 * The channel count and sample rate are the buffer's own.
 */
export async function encodeAudioBuffer(
  buffer: AudioBuffer,
  format: AudioFileFormat,
  mp3Bitrate: number
): Promise<Uint8Array> {
  const {
    Output,
    BufferTarget,
    WavOutputFormat,
    Mp3OutputFormat,
    AudioBufferSource,
    canEncodeAudio
  } = await import("mediabunny");

  if (format === "mp3" && !(await canEncodeAudio("mp3"))) {
    // No browser ships an MP3 encoder in WebCodecs; the LAME build is loaded
    // only when someone exports MP3.
    const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
    registerMp3Encoder();
  }

  const output = new Output({
    format: format === "wav" ? new WavOutputFormat() : new Mp3OutputFormat(),
    target: new BufferTarget()
  });
  const source = new AudioBufferSource(
    format === "wav"
      ? { codec: "pcm-s16" }
      : { codec: "mp3", bitrate: mp3Bitrate }
  );
  output.addAudioTrack(source);
  await output.start();
  await source.add(buffer);
  source.close();
  await output.finalize();

  const bytes = output.target.buffer;
  if (!bytes) throw new Error("The audio encoder produced no output");
  return new Uint8Array(bytes);
}

interface RenderTimelineAudioFileOptions {
  format: AudioFileFormat;
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  tempo?: TimelineTempo;
  master?: TimelineMasterChannel;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}

/**
 * Mix the whole timeline down to stereo and encode it as a 16-bit PCM WAV or
 * a 320 kbps MP3.
 */
export async function renderTimelineAudioFile(
  opts: RenderTimelineAudioFileOptions
): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }> {
  const { format, onProgress, signal } = opts;
  if (opts.durationMs <= 0) throw new Error("durationMs must be positive");

  onProgress?.({ phase: "audio", frame: 0, totalFrames: 0, ratio: 0 });
  const buffer = await renderTimelineAudio({
    clips: opts.clips,
    tracks: opts.tracks,
    durationMs: opts.durationMs,
    resolveUrl: opts.resolveUrl,
    tempo: opts.tempo,
    master: opts.master,
    signal
  });
  if (signal?.aborted) {
    throw new DOMException("Render aborted", "AbortError");
  }
  // Null when no clip is audible: every track muted, or no audio at all.
  if (!buffer) {
    throw new Error(`Nothing on the timeline makes sound, so there is no ${format.toUpperCase()} to export.`);
  }

  onProgress?.({ phase: "finalizing", frame: 0, totalFrames: 0, ratio: 0.5 });
  const bytes = await encodeAudioBuffer(buffer, format, TIMELINE_MP3_BITRATE);
  onProgress?.({ phase: "finalizing", frame: 0, totalFrames: 0, ratio: 1 });
  return { bytes, mimeType: AUDIO_FILE_MIME[format], extension: format };
}
