/**
 * Whole-file conversions on Mediabunny: trim with re-encode, and audio to WAV.
 * Mediabunny encodes through `@mediabunny/server`, which runs node-av's codecs.
 */

import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  Conversion,
  FilePathSource,
  FilePathTarget,
  Input,
  Mp4OutputFormat,
  Output,
  WavOutputFormat
} from "mediabunny";
import { registerMediabunnyServer } from "@mediabunny/server";

import { abortError, throwIfAborted } from "./av.js";
import type { MediaSource } from "./probe.js";

let serverRegistered = false;

/**
 * Register Mediabunny's Node codecs once per process. Hardware acceleration
 * stays off: a server render must not depend on which GPU the host has, and
 * probing every hardware API on each codec open costs time and log noise.
 */
export function ensureMediabunnyServer(): void {
  if (serverRegistered) return;
  serverRegistered = true;
  registerMediabunnyServer({ hardwareContext: null });
}

function inputFrom(source: MediaSource): Input {
  return new Input({
    source:
      typeof source === "string" ? new FilePathSource(source) : new BufferSource(source),
    formats: ALL_FORMATS
  });
}

async function runConversion(conversion: Conversion, signal?: AbortSignal): Promise<void> {
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((track) => track.reason).join(", ");
    throw new Error(`The media cannot be converted${reasons ? `: ${reasons}` : ""}`);
  }
  const cancel = (): void => {
    void conversion.cancel();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await conversion.execute();
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Re-encode `[startSec, endSec)` of `source` as an MP4 that starts at zero,
 * H.264 and AAC with the index at the front: the in-process form of
 * `ffmpeg -i in -ss S -t D -c:v libx264 -c:a aac -movflags +faststart`.
 */
export async function trimVideo(
  source: MediaSource,
  startSec: number,
  endSec: number,
  options: { signal?: AbortSignal } = {}
): Promise<Uint8Array> {
  throwIfAborted(options.signal);
  ensureMediabunnyServer();
  const input = inputFrom(source);
  try {
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target
    });
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: startSec, end: endSec },
      video: { codec: "avc", forceTranscode: true },
      audio: { codec: "aac", forceTranscode: true },
      showWarnings: false
    });
    await runConversion(conversion, options.signal);
    if (!target.buffer) throw new Error("The trim produced no file");
    return new Uint8Array(target.buffer);
  } finally {
    input.dispose();
  }
}

/**
 * Write `source`'s first audio track to `outPath` as 16-bit PCM WAV at its own
 * rate and channel count, as `ffmpeg -i in -vn -acodec pcm_s16le out.wav` did.
 * Throws when the source has no audio track.
 */
export async function convertAudioToWav(
  source: MediaSource,
  outPath: string,
  options: { signal?: AbortSignal } = {}
): Promise<void> {
  throwIfAborted(options.signal);
  ensureMediabunnyServer();
  const input = inputFrom(source);
  try {
    if (!(await input.getPrimaryAudioTrack())) {
      throw new Error("The media has no audio track");
    }
    const output = new Output({
      format: new WavOutputFormat(),
      target: new FilePathTarget(outPath)
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: "pcm-s16" },
      showWarnings: false
    });
    await runConversion(conversion, options.signal);
  } finally {
    input.dispose();
  }
}
