/**
 * The agent's view of the audio editor's pure edit helpers: one function that
 * maps a named edit onto `audioSample.ts`, and a coarse level summary the agent
 * reads instead of the PCM.
 */

import {
  applyGain,
  cropToRange,
  deleteRange,
  fade,
  normalize,
  numFrames,
  reverseRange,
  sampleDuration,
  silenceRange,
  type AudioSample
} from "./audioSample";
import type { AudioEditOp, AudioRange } from "./audioAgentBridge";

/** At most this many windows in a level summary. */
const MAX_PEAK_WINDOWS = 120;
const MIN_PEAK_WINDOW_SECONDS = 0.1;

const requireRange = (op: AudioEditOp, range?: AudioRange): AudioRange => {
  if (!range) {
    throw new Error(
      `"${op}" needs a range: pass start and end in seconds. To use the user's selection, pass the selection from ui_audio_get_state.`
    );
  }
  return range;
};

/**
 * Apply one named edit. Returns a new sample; the input is never mutated.
 * Throws on a missing range for trim/delete or a missing gain for `gain`.
 */
export const applyAudioEdit = (
  sample: AudioSample,
  op: AudioEditOp,
  range?: AudioRange,
  gainDb?: number
): AudioSample => {
  const duration = sampleDuration(sample);
  const start = range?.start;
  const end = range?.end;
  switch (op) {
    case "trim": {
      const r = requireRange(op, range);
      return cropToRange(sample, r.start, r.end);
    }
    case "delete": {
      const r = requireRange(op, range);
      return deleteRange(sample, r.start, r.end);
    }
    case "silence":
      return silenceRange(sample, start, end);
    case "fade_in":
      return fade(sample, start ?? 0, end ?? duration, "in");
    case "fade_out":
      return fade(sample, start ?? 0, end ?? duration, "out");
    case "normalize":
      return normalize(sample, start, end);
    case "reverse":
      return reverseRange(sample, start, end);
    case "gain": {
      if (gainDb === undefined || !Number.isFinite(gainDb)) {
        throw new Error('"gain" needs gain_db, e.g. 6 to boost or -6 to cut.');
      }
      return applyGain(sample, 10 ** (gainDb / 20), start, end);
    }
  }
};

/**
 * Peak level of consecutive windows across all channels, rounded to two
 * decimals. The window grows with the duration so the list stays short.
 */
export const summarizePeaks = (
  sample: AudioSample
): { peaks: number[]; windowSeconds: number } => {
  const frames = numFrames(sample);
  const duration = sampleDuration(sample);
  if (frames === 0 || duration === 0) {
    return { peaks: [], windowSeconds: MIN_PEAK_WINDOW_SECONDS };
  }
  const windowSeconds = Math.max(
    MIN_PEAK_WINDOW_SECONDS,
    Math.ceil((duration / MAX_PEAK_WINDOWS) * 10) / 10
  );
  const windowFrames = Math.max(1, Math.round(windowSeconds * sample.sampleRate));
  const count = Math.ceil(frames / windowFrames);
  const peaks = new Array<number>(count).fill(0);
  for (const channel of sample.channels) {
    for (let i = 0; i < frames; i += 1) {
      const level = Math.abs(channel[i]);
      const w = Math.floor(i / windowFrames);
      if (level > peaks[w]) peaks[w] = level;
    }
  }
  return {
    peaks: peaks.map((peak) => Math.round(Math.min(1, peak) * 100) / 100),
    windowSeconds
  };
};
