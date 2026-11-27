/**
 * The frames a Blockout reference is rendered from: one model time and one
 * camera per output frame of the clip's span, at the reference size and in
 * the chosen pass.
 *
 * The times and cameras are `computeModel3DBakeSamples`, the list the Blender
 * bake renders, so a reference and a bake of one clip show the same motion.
 * Each entry has the shape of a `Model3DRenderFrame`, which the browser
 * session and the headless host both take.
 */

import type { ClipModel3DCamera, TimelineClip } from "../types.js";
import type { Model3DBakeSequence } from "../model3dBake.js";
import {
  model3dReferenceSize,
  type Model3DReferencePass
} from "../model3dReference.js";
import {
  computeModel3DBakeSamples,
  type Model3DBakeAnimationDuration
} from "./model3dBakeSamples.js";

/** One frame of a reference render. Structurally a `Model3DRenderFrame`. */
export interface Model3DReferenceFrame {
  timeSec: number;
  camera: ClipModel3DCamera;
  width: number;
  height: number;
  pass: Model3DReferencePass;
}

/** The frames of a reference render, in output order, one per sequence frame. */
export function computeModel3DReferenceFrames(
  clip: TimelineClip,
  sequence: Model3DBakeSequence,
  durations: readonly Model3DBakeAnimationDuration[],
  pass: Model3DReferencePass
): Model3DReferenceFrame[] {
  const samples = computeModel3DBakeSamples(clip, sequence, durations);
  const size = model3dReferenceSize(sequence);
  return samples.frameTimes.map((timeSec, index) => ({
    timeSec,
    camera: samples.cameras[index],
    width: size.width,
    height: size.height,
    pass
  }));
}
