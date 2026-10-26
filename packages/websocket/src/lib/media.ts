/**
 * Asset media helpers for the audio-extraction endpoint and video edits, on
 * the in-process media module.
 */
import { convertAudioToWav, probeMedia } from "@nodetool-ai/runtime/media";
import { withTaskSpan } from "@nodetool-ai/runtime/tracing";

/** True if the media file at `filePath` contains at least one audio stream. */
export async function probeHasAudio(filePath: string): Promise<boolean> {
  try {
    return (await probeMedia(filePath)).audio !== null;
  } catch {
    // Unreadable media has no audio to extract.
    return false;
  }
}

/**
 * Duration of the media at `filePath` in milliseconds, or null when it is not
 * media or names no duration.
 */
export async function probeDurationMs(
  filePath: string
): Promise<number | null> {
  try {
    const { durationSec } = await probeMedia(filePath);
    return durationSec === null ? null : Math.round(durationSec * 1000);
  } catch {
    return null;
  }
}

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
  return { durationMs: await probeDurationMs(outputPath) };
}

/** Shared source-window materialization used by browser and headless edits. */
export { trimVideoWindow } from "@nodetool-ai/runtime/trim-video-window";
