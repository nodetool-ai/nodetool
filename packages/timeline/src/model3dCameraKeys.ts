/**
 * Keying a `model3d` clip's free camera at one instant, and the lens
 * conversion a camera patch accepts.
 *
 * A camera key is one keyframe on each free camera channel at the same time,
 * so the whole pose is pinned there and a later key on one channel cannot
 * drag the others. The channels fold by addition onto the clip's authored
 * camera, so every stored value is the wanted pose minus the authored one.
 */

import { parseEasing } from "./animation/easing.js";
import type { ClipAnimation } from "./animation/types.js";
import { setKeyframe, setKeyframeEasing } from "./keyframes.js";
import {
  MODEL3D_FREE_CAMERA_PROPERTIES,
  focalLengthMmToFovDeg,
  fovDegToFocalLengthMm,
  model3dFreeCameraPose,
  type Model3DCameraProperty,
  type Model3DFreeCameraPose
} from "./model3d.js";
import { model3dKeyframedFreeCameraPose } from "./model3dCameraMoves.js";
import type { TimelineClip } from "./types.js";

/** The widest and the narrowest lens a free camera takes, vertical degrees. */
export const MODEL3D_MIN_FOV_DEG = 1;
export const MODEL3D_MAX_FOV_DEG = 170;

/** The lens of a camera patch: a field of view or a focal length, never both. */
export interface Model3DLensInput {
  fovDeg?: number;
  focalLengthMm?: number;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * The vertical field of view a lens input asks for, or undefined when it names
 * no lens. `field` is the path of the object in the caller's arguments, for
 * the message.
 */
export function resolveModel3DLensFovDeg(
  lens: Model3DLensInput,
  field = "camera"
): number | undefined {
  const { fovDeg, focalLengthMm } = lens;
  if (fovDeg !== undefined && focalLengthMm !== undefined) {
    throw new Error(
      `${field} has both fovDeg (${fovDeg}) and focalLengthMm ` +
        `(${focalLengthMm}). Send one of them: focalLengthMm ` +
        `${focalLengthMm} is fovDeg ${round(focalLengthMmToFovDeg(focalLengthMm), 2)}.`
    );
  }
  if (focalLengthMm !== undefined) {
    if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) {
      throw new Error(
        `${field}.focalLengthMm must be a focal length above 0 in mm, such ` +
          `as 35, and it is ${focalLengthMm}.`
      );
    }
    return focalLengthMmToFovDeg(focalLengthMm);
  }
  return fovDeg;
}

/** A free camera pose with the lens in both units, rounded for a report. */
export interface Model3DFreeCameraReport extends Model3DFreeCameraPose {
  focalLengthMm: number;
}

export function model3dFreeCameraReport(
  pose: Model3DFreeCameraPose
): Model3DFreeCameraReport {
  return {
    position: [
      round(pose.position[0], 4),
      round(pose.position[1], 4),
      round(pose.position[2], 4)
    ],
    target: [
      round(pose.target[0], 4),
      round(pose.target[1], 4),
      round(pose.target[2], 4)
    ],
    rollDeg: round(pose.rollDeg, 3),
    fovDeg: round(pose.fovDeg, 3),
    focalLengthMm: round(fovDegToFocalLengthMm(pose.fovDeg), 2)
  };
}

/** Throws when `easing` is outside the easing grammar. `field` names it. */
export function assertKnownEasing(easing: string, field: string): void {
  if (parseEasing(easing) !== null) return;
  throw new Error(
    `${field} "${easing}" is not an easing. Use a named one such as ` +
      `"linear", "easeInOut" or "easeOutExpo", or ` +
      `"cubic-bezier(x1,y1,x2,y2)".`
  );
}

function assertFiniteVec3(value: readonly number[], field: string): void {
  if (value.length !== 3 || value.some((n) => !Number.isFinite(n))) {
    throw new Error(
      `${field} must be [x, y, z] with three finite numbers, and it is ` +
        `${JSON.stringify(value)}.`
    );
  }
}

function channelOffset(
  property: Model3DCameraProperty,
  pose: Model3DFreeCameraPose,
  base: Model3DFreeCameraPose
): number {
  switch (property) {
    case "cameraPosX":
      return pose.position[0] - base.position[0];
    case "cameraPosY":
      return pose.position[1] - base.position[1];
    case "cameraPosZ":
      return pose.position[2] - base.position[2];
    case "cameraTargetX":
      return pose.target[0] - base.target[0];
    case "cameraTargetY":
      return pose.target[1] - base.target[1];
    case "cameraTargetZ":
      return pose.target[2] - base.target[2];
    case "cameraRoll":
      return pose.rollDeg - base.rollDeg;
    case "cameraFov":
      return pose.fovDeg - base.fovDeg;
    default:
      return 0;
  }
}

export interface KeyModel3DFreeCameraOptions {
  /** Easing of the segment that arrives at this key. Linear when absent. */
  easing?: string;
}

/**
 * Key the clip's free camera at `atMs`, clip-relative, and return the clip's
 * new animation list, the way `setKeyframe` does.
 *
 * Every field `pose` leaves out keeps the value the camera has at `atMs`, so
 * `{}` pins the current picture. All eight free channels get a keyframe. The
 * clip has to be in `free` mode and `atMs` inside the clip.
 */
export function keyModel3DFreeCamera(
  clip: TimelineClip,
  atMs: number,
  pose: Partial<Model3DFreeCameraPose> = {},
  options: KeyModel3DFreeCameraOptions = {}
): ClipAnimation[] {
  const style = clip.model3dStyle;
  const mode = style?.camera.mode;
  if (!style || mode !== "free") {
    throw new Error(
      `keyAtMs keys a free camera, and clip "${clip.name}" has ` +
        `${mode === undefined ? "no camera" : `a ${mode} camera`}. Send ` +
        `patch.camera.mode "free" in the same call, or leave keyAtMs out to ` +
        `change the resting pose.`
    );
  }
  if (!Number.isFinite(atMs) || atMs < 0 || atMs > clip.durationMs) {
    throw new Error(
      `keyAtMs ${atMs} is outside clip "${clip.name}", which runs from 0 to ` +
        `${clip.durationMs} ms. keyAtMs counts from the clip's start, not ` +
        `from the start of the timeline.`
    );
  }
  if (pose.position) assertFiniteVec3(pose.position, "patch.camera.position");
  if (pose.target) assertFiniteVec3(pose.target, "patch.camera.target");
  if (pose.rollDeg !== undefined && !Number.isFinite(pose.rollDeg)) {
    throw new Error(
      `patch.camera.rollDeg must be a finite number of degrees, and it is ${pose.rollDeg}.`
    );
  }
  if (
    pose.fovDeg !== undefined &&
    !(pose.fovDeg >= MODEL3D_MIN_FOV_DEG && pose.fovDeg <= MODEL3D_MAX_FOV_DEG)
  ) {
    throw new Error(
      `patch.camera.fovDeg must be between ${MODEL3D_MIN_FOV_DEG} and ` +
        `${MODEL3D_MAX_FOV_DEG} degrees, and it is ${pose.fovDeg}. A 35 mm ` +
        `lens is fovDeg 37.85, or send focalLengthMm.`
    );
  }
  if (options.easing !== undefined) {
    assertKnownEasing(options.easing, "keyEasing");
  }
  const current = model3dKeyframedFreeCameraPose(clip, atMs);
  const wanted: Model3DFreeCameraPose = {
    position: pose.position ? [...pose.position] : current.position,
    target: pose.target ? [...pose.target] : current.target,
    rollDeg: pose.rollDeg ?? current.rollDeg,
    fovDeg: pose.fovDeg ?? current.fovDeg
  };
  const base = model3dFreeCameraPose(style.camera);
  let working = clip;
  for (const property of MODEL3D_FREE_CAMERA_PROPERTIES) {
    working = {
      ...working,
      animations: setKeyframe(
        working,
        property,
        atMs,
        channelOffset(property, wanted, base)
      )
    };
  }
  if (options.easing !== undefined) {
    working = {
      ...working,
      animations: setKeyframeEasing(
        working,
        MODEL3D_FREE_CAMERA_PROPERTIES,
        atMs,
        options.easing
      )
    };
  }
  return working.animations ?? [];
}
