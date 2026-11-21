/**
 * Cut segments and regions out of a generated window (MUSIC-MODE.md section
 * 11, AL-3).
 *
 * Every function in `music/` that touches audio reads and writes interleaved
 * stereo float PCM at 48 kHz: frame `f` is `samples[2f]` (left) and
 * `samples[2f + 1]` (right). Cuts land on whole frames. The 5 ms edge fades
 * are the clip's own `fadeInMs` and `fadeOutMs`, written by the client, so a
 * cut is a plain copy and the asset stays untouched.
 */

/** Channels of every music PCM buffer: interleaved left and right. */
export const MUSIC_CHANNELS = 2;

/** Whole frames in an interleaved stereo buffer. */
export function pcmFrames(samples: Float32Array): number {
  if (samples.length % MUSIC_CHANNELS !== 0) {
    throw new Error(
      `Interleaved stereo PCM needs an even sample count, got ${samples.length}`
    );
  }
  return samples.length / MUSIC_CHANNELS;
}

/**
 * Frames `[startFrame, endFrame)` of `samples`. Frames outside the buffer, at
 * a negative start or past the end, are digital silence, so a cut moved by a
 * negative alignment offset gets a silent head instead of a shorter take.
 */
export function cutFrames(
  samples: Float32Array,
  startFrame: number,
  endFrame: number
): Float32Array {
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame)) {
    throw new Error(`Cuts land on whole frames, got ${startFrame}..${endFrame}`);
  }
  if (endFrame < startFrame) {
    throw new Error(`Cut ends before it starts: ${startFrame}..${endFrame}`);
  }
  const frames = pcmFrames(samples);
  const out = new Float32Array((endFrame - startFrame) * MUSIC_CHANNELS);
  const from = Math.max(0, startFrame);
  const to = Math.min(frames, endFrame);
  if (to > from) {
    out.set(
      samples.subarray(from * MUSIC_CHANNELS, to * MUSIC_CHANNELS),
      (from - startFrame) * MUSIC_CHANNELS
    );
  }
  return out;
}

/** A frame range inside a window, `[start_frame, end_frame)`. */
export interface MusicFrameRange {
  start_frame: number;
  end_frame: number;
}

/**
 * One target range cut from a window, moved by the alignment offset. A
 * positive offset means the audio's beats fall late against the grid, so the
 * cut moves later by that many frames. A negative offset moves it earlier and
 * pads the head with silence where the window has no audio.
 */
export function cutRange(
  samples: Float32Array,
  range: MusicFrameRange,
  offsetFrames = 0
): Float32Array {
  return cutFrames(
    samples,
    range.start_frame + offsetFrames,
    range.end_frame + offsetFrames
  );
}
