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
import {
  AUDIO_FILE_MIME,
  encodeAudioBuffer,
  type AudioFileFormat
} from "../timeline/render/encodeAudio";

export type ScriptAudioFormat = AudioFileFormat;

export const SCRIPT_AUDIO_MIME = AUDIO_FILE_MIME;

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
export function encodeScriptAudio(
  buffer: AudioBuffer,
  format: ScriptAudioFormat
): Promise<Uint8Array> {
  return encodeAudioBuffer(buffer, format, MP3_BITRATE);
}
