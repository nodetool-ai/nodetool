/**
 * exportScriptAudio — render a whole voiced script to one WAV or MP3 file.
 *
 * The script is laid out with the same voiceover mapping "Send to timeline"
 * uses (`buildScriptTimeline`: each line's current take end to end, with the
 * authored `pauseAfterMs` gaps, unvoiced lines skipped), then mixed down by the
 * timeline's offline renderer and encoded with mediabunny. The exported file
 * therefore matches what the assembled voiceover track plays.
 */

import { buildScriptTimeline } from "@nodetool-ai/timeline";
import type { ScriptDraft } from "../../stores/script/ScriptStore";
import { renderTimelineAudio } from "../timeline/render/renderAudio";

export type ScriptAudioFormat = "wav" | "mp3";

export const SCRIPT_AUDIO_MIME: Record<ScriptAudioFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg"
};

const MP3_BITRATE = 192_000;

interface RenderScriptAudioOptions {
  /** Resolve a take's asset id to a fetchable URL. */
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  signal?: AbortSignal;
}

/**
 * Mix every voiced line's current take into one stereo buffer, or `null` when
 * the script has no voiced line.
 */
export async function renderScriptAudio(
  script: ScriptDraft,
  { resolveUrl, signal }: RenderScriptAudioOptions
): Promise<AudioBuffer | null> {
  const { tracks, clips, durationMs } = buildScriptTimeline({
    scriptId: script.id,
    cast: script.cast,
    sections: script.sections
  });
  if (clips.length === 0) return null;
  return renderTimelineAudio({ clips, tracks, durationMs, resolveUrl, signal });
}

/** Encode a rendered buffer as a 16-bit PCM WAV or a 192 kbps MP3. */
export async function encodeScriptAudio(
  buffer: AudioBuffer,
  format: ScriptAudioFormat
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
      : { codec: "mp3", bitrate: MP3_BITRATE }
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
