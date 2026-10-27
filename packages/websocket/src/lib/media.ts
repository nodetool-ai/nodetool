/**
 * Asset media helpers for the audio-extraction endpoint and video edits, on
 * the in-process media module.
 */
import { convertAudioToWav, probeDurationSec } from "@nodetool-ai/runtime/media";
import { withTaskSpan } from "@nodetool-ai/runtime/tracing";

/**
 * Extract the audio track of the media at `inputPath` to a 16-bit PCM WAV at
 * `outputPath` and return the WAV's duration. The WAV stays on disk so the
 * caller can store it without holding it in memory; a two-hour stereo track
 * is over a gigabyte. Throws when the input has no audio.
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string
): Promise<{ durationMs: number | null }> {
  await withTaskSpan("cpu", "media.extract_audio", {}, () =>
    convertAudioToWav(inputPath, outputPath)
  );
  const durationSec = await probeDurationSec(outputPath);
  return { durationMs: durationSec === null ? null : Math.round(durationSec * 1000) };
}

/** Shared source-window materialization used by browser and headless edits. */
export { trimVideoWindow } from "@nodetool-ai/runtime/trim-video-window";
