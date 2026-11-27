/**
 * The Blockout reference of a `model3d` clip: a grey render of the clip's span
 * that a video model follows when a storyboard shot is generated.
 *
 * Nothing here renders. This module holds what every host has to agree on: the
 * passes a reference can be drawn in, the fixed look it is drawn with, the
 * size it is drawn at, and the hash that decides whether a stored reference
 * still shows the clip. The per-frame sample list is
 * `computeModel3DReferenceFrames` in `render/`, because it samples the clip's
 * animation curves through the scene model.
 */

import { model3dPictureDigest, model3dPictureInputs } from "./model3dBake.js";
import type { Model3DBakeSequence } from "./model3dBake.js";
import { stableSerialize } from "./stableSerialize.js";
import type {
  ClipModel3DAnimation,
  ClipModel3DStyle,
  TimelineClip
} from "./types.js";

/** What a reference frame draws. See `Model3DRenderPass` in the render core. */
export type Model3DReferencePass = "clay" | "depth" | "normal";

export const MODEL3D_REFERENCE_PASSES = [
  "clay",
  "depth",
  "normal"
] as const satisfies readonly Model3DReferencePass[];

export const DEFAULT_MODEL3D_REFERENCE_PASS: Model3DReferencePass = "clay";

/** Whether a value names a reference pass. */
export function isModel3DReferencePass(
  value: unknown
): value is Model3DReferencePass {
  return MODEL3D_REFERENCE_PASSES.some((pass) => pass === value);
}

/**
 * The background every reference is drawn on. Opaque, neutral and darker than
 * the lit clay grey, so a figure reads against it whatever background the clip
 * itself uses.
 */
export const MODEL3D_REFERENCE_BACKGROUND = "#3c3c3c";

/** The longest side of a reference frame, in pixels. */
export const MODEL3D_REFERENCE_MAX_SIDE = 1280;

/** The renderer settings a reference fixes, in the shape a render session takes. */
export interface Model3DReferenceSession {
  lighting: "studio";
  lightIntensity: 1;
  background: { transparent: false; color: string };
  animation: ClipModel3DAnimation;
}

/**
 * The session a reference is rendered with. The lighting and the background
 * are constants: the clip's own lighting, intensity and background are look
 * choices for the timeline picture and must not change what the video model
 * is shown. Only the animation selection comes from the clip.
 */
export function model3dReferenceSession(
  style: Pick<ClipModel3DStyle, "animation">
): Model3DReferenceSession {
  return {
    lighting: "studio",
    lightIntensity: 1,
    background: { transparent: false, color: MODEL3D_REFERENCE_BACKGROUND },
    animation: { ...style.animation }
  };
}

/**
 * The pixel size of a reference frame: the sequence's aspect ratio, scaled
 * down so the longest side is at most {@link MODEL3D_REFERENCE_MAX_SIDE}, with
 * both sides even because H.264 4:2:0 needs that.
 */
export function model3dReferenceSize(
  sequence: Pick<Model3DBakeSequence, "width" | "height">
): { width: number; height: number } {
  const width = Math.max(2, sequence.width);
  const height = Math.max(2, sequence.height);
  const scale = Math.min(1, MODEL3D_REFERENCE_MAX_SIDE / Math.max(width, height));
  const even = (value: number): number =>
    Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

const MODEL3D_REFERENCE_HASH_VERSION_PREFIX = "model3d-reference-v1:";

/**
 * The hash a reference is stored under.
 *
 * It covers what {@link computeModel3DBakeHash} covers, through the same
 * record, with two differences. The style is narrowed to the camera and the
 * animation, because the lighting and the background of a reference are fixed
 * by {@link model3dReferenceSession}. And the pass is added, because a depth
 * render of an unchanged clip is a different video from a clay one.
 */
export function computeModel3DReferenceHash(
  clip: TimelineClip,
  sequence: Model3DBakeSequence,
  pass: Model3DReferencePass
): string {
  const style = clip.model3dStyle;
  const picture = style
    ? { camera: style.camera, animation: style.animation }
    : {};
  const payload = `${MODEL3D_REFERENCE_HASH_VERSION_PREFIX}${stableSerialize({
    ...model3dPictureInputs(clip, sequence, picture),
    pass
  })}`;
  return model3dPictureDigest(payload);
}

/** Where a clip's reference stands against the live document. */
export type Model3DReferenceStatus = "missing" | "stale" | "current";

/**
 * `missing` when the clip stores no reference, `stale` when the stored one was
 * rendered from a different set, camera, span, sequence or pass, and `current`
 * otherwise. `pass` overrides the stored pass, for a caller that wants to know
 * whether a reference in another pass has to be rendered.
 */
export function model3dReferenceStatus(
  clip: TimelineClip,
  sequence: Model3DBakeSequence,
  pass?: Model3DReferencePass
): Model3DReferenceStatus {
  const reference = clip.model3dStyle?.reference;
  if (!reference) return "missing";
  if (pass !== undefined && pass !== reference.pass) return "stale";
  return reference.dependencyHash ===
    computeModel3DReferenceHash(clip, sequence, reference.pass)
    ? "current"
    : "stale";
}

/** Whether the clip stores a reference that no longer shows the clip. */
export function isModel3DReferenceStale(
  clip: TimelineClip,
  sequence: Model3DBakeSequence
): boolean {
  return model3dReferenceStatus(clip, sequence) === "stale";
}
