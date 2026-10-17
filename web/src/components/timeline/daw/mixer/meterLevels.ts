/**
 * Peak levels for the mixer's meters, read from the stereo analyser taps the
 * timeline audio graph puts on each channel and on the master.
 */

import type { StereoMeterTap } from "../../preview/AudioGraph";

/** Largest absolute sample in the analyser's current window. */
export function analyserPeak(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(scratch);
  let peak = 0;
  for (let i = 0; i < scratch.length; i += 1) {
    const v = Math.abs(scratch[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * A `LevelMeter` reader over a tap the caller looks up each frame (the tap
 * appears once the channel first plays, and changes if the graph is rebuilt).
 */
export function stereoTapReader(
  getTap: () => StereoMeterTap | null
): () => [number, number] | null {
  let scratch = new Float32Array(0);
  const levels: [number, number] = [0, 0];
  return () => {
    const tap = getTap();
    if (!tap) return null;
    if (scratch.length !== tap.left.fftSize) scratch = new Float32Array(tap.left.fftSize);
    levels[0] = analyserPeak(tap.left, scratch);
    levels[1] = analyserPeak(tap.right, scratch);
    return levels;
  };
}
