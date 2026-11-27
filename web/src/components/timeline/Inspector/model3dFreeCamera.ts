/**
 * Clip edits for a `model3d` clip's free camera: keying the pose, landing a
 * preview gesture, and switching an orbit camera to free without moving the
 * picture.
 *
 * The free channels are additive offsets from the authored pose
 * (`resolveModel3DCamera`), so every function here converts between the
 * composed pose a user sees and the authored pose plus keyframe values the
 * clip stores. Pure. The callers hand the patch to `editClipKeyframes`, which
 * makes each edit one undo step.
 */

import {
  IDENTITY_MODEL3D_CAMERA_CHANNELS,
  MODEL3D_CAMERA_PROPERTIES,
  MODEL3D_FREE_CAMERA_PROPERTIES,
  isPropertyKeyframed,
  keyframeValueAt,
  model3dStyleWithPatch,
  orbitCameraToFree,
  resolveModel3DCamera,
  setKeyframes,
  type ClipModel3DCamera,
  type KeyframeProperty,
  type Model3DCameraChannels,
  type Model3DCameraMoveUnit,
  type Model3DFreeCameraPose,
  type Model3DOrbitFit,
  type TimelineClip
} from "@nodetool-ai/timeline";

type FreeProperty = (typeof MODEL3D_FREE_CAMERA_PROPERTIES)[number];

/** Each free channel's composed value in a pose. */
const POSE_VALUE: Record<FreeProperty, (pose: Model3DFreeCameraPose) => number> = {
  cameraPosX: (pose) => pose.position[0],
  cameraPosY: (pose) => pose.position[1],
  cameraPosZ: (pose) => pose.position[2],
  cameraTargetX: (pose) => pose.target[0],
  cameraTargetY: (pose) => pose.target[1],
  cameraTargetZ: (pose) => pose.target[2],
  cameraRoll: (pose) => pose.rollDeg,
  cameraFov: (pose) => pose.fovDeg
};

/** A change smaller than this is a gesture that did not move the channel. */
const MOVED_EPSILON = 1e-9;

const isFree = (clip: TimelineClip): boolean =>
  clip.model3dStyle?.camera.mode === "free";

/** The keyframe value of every camera channel at a clip-relative time. */
function cameraChannelsAt(
  clip: TimelineClip,
  atMs: number | null
): Model3DCameraChannels {
  const channels: Model3DCameraChannels = { ...IDENTITY_MODEL3D_CAMERA_CHANNELS };
  if (atMs === null) return channels;
  for (const property of MODEL3D_CAMERA_PROPERTIES) {
    channels[property] = keyframeValueAt(clip, property, atMs);
  }
  return channels;
}

/** Whether any free camera channel of the clip has a keyframe. */
export function isFreeCameraKeyed(clip: TimelineClip): boolean {
  return MODEL3D_FREE_CAMERA_PROPERTIES.some((property) =>
    isPropertyKeyframed(clip, property)
  );
}

/**
 * "Key camera": a keyframe on every free channel at `atMs`, holding the pose
 * the camera has there. Null off the clip (`atMs` null) and for a camera that
 * is not free.
 */
export function keyFreeCameraPatch(
  clip: TimelineClip,
  atMs: number | null
): Partial<TimelineClip> | null {
  if (atMs === null || !isFree(clip)) return null;
  return {
    animations: setKeyframes(
      clip,
      MODEL3D_FREE_CAMERA_PROPERTIES.map((property) => ({
        property: property as KeyframeProperty,
        value: keyframeValueAt(clip, property, atMs)
      })),
      atMs
    )
  };
}

/**
 * Land a pose edit that took the composed pose from `start` to `next`.
 *
 * A camera with no keys takes `next` as its authored pose. A keyed camera
 * keeps its authored pose and gets a keyframe at `atMs` on each channel the
 * edit moved, so the other keys keep their pictures. Null when nothing moved,
 * and when a keyed camera has no instant to write to.
 */
export function freeCameraPosePatch(
  clip: TimelineClip,
  start: Model3DFreeCameraPose,
  next: Model3DFreeCameraPose,
  atMs: number | null
): Partial<TimelineClip> | null {
  if (!isFree(clip)) return null;
  const moved = MODEL3D_FREE_CAMERA_PROPERTIES.filter(
    (property) =>
      Math.abs(POSE_VALUE[property](next) - POSE_VALUE[property](start)) >
      MOVED_EPSILON
  );
  if (moved.length === 0) return null;

  if (!isFreeCameraKeyed(clip)) {
    return {
      model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
        camera: {
          position: [...next.position],
          target: [...next.target],
          rollDeg: next.rollDeg,
          fovDeg: next.fovDeg
        }
      })
    };
  }
  if (atMs === null) return null;
  return {
    animations: setKeyframes(
      clip,
      moved.map((property) => ({
        property: property as KeyframeProperty,
        value:
          keyframeValueAt(clip, property, atMs) +
          POSE_VALUE[property](next) -
          POSE_VALUE[property](start)
      })),
      atMs
    )
  };
}

/**
 * The camera to draw while a gesture is in flight: the authored camera that
 * composes to `pose` under the keyframe values at `atMs`. The preview folds
 * the sampled channels on top of whatever camera it is handed, so handing it
 * `pose` itself would add the keys twice.
 */
export function freeCameraGestureCamera(
  clip: TimelineClip,
  pose: Model3DFreeCameraPose,
  atMs: number | null
): ClipModel3DCamera {
  const channels = cameraChannelsAt(clip, atMs);
  return {
    ...model3dStyleWithPatch(clip.model3dStyle, undefined).camera,
    mode: "free",
    position: [
      pose.position[0] - channels.cameraPosX,
      pose.position[1] - channels.cameraPosY,
      pose.position[2] - channels.cameraPosZ
    ],
    target: [
      pose.target[0] - channels.cameraTargetX,
      pose.target[1] - channels.cameraTargetY,
      pose.target[2] - channels.cameraTargetZ
    ],
    rollDeg: pose.rollDeg - channels.cameraRoll,
    fovDeg: pose.fovDeg - channels.cameraFov
  };
}

/**
 * Switch an orbit camera to free so the picture at `atMs` does not jump.
 *
 * The eye and the target come from the orbit pose folded with its keys at
 * `atMs`. The authored lens stays, because `cameraFov` keeps folding in free
 * mode. Without a `fit` (the model has not loaded) the camera takes the
 * default free pose.
 */
export function orbitToFreeCameraPatch(
  clip: TimelineClip,
  fit: Model3DOrbitFit | null,
  atMs: number | null
): Partial<TimelineClip> {
  const style = model3dStyleWithPatch(clip.model3dStyle, undefined);
  if (!fit || style.camera.mode !== "orbit") {
    return {
      model3dStyle: model3dStyleWithPatch(style, { camera: { mode: "free" } })
    };
  }
  const folded = resolveModel3DCamera(style, cameraChannelsAt(clip, atMs));
  const free = orbitCameraToFree(folded, fit);
  return {
    model3dStyle: model3dStyleWithPatch(style, {
      camera: {
        mode: "free",
        position: free.position,
        target: free.target,
        rollDeg: 0
      }
    })
  };
}

/** How a move's amount is shown: stored value times `scale`, then `unit`. */
export interface CameraMoveAmountDisplay {
  scale: number;
  unit: string;
  decimals: number;
  step: number;
}

/**
 * The field a move's amount is edited in. A distance is stored as a fraction
 * of the eye-to-target distance and shown as a percentage of it.
 */
export function cameraMoveAmountDisplay(
  unit: Model3DCameraMoveUnit
): CameraMoveAmountDisplay {
  if (unit === "degrees") return { scale: 1, unit: "°", decimals: 0, step: 1 };
  if (unit === "distance") return { scale: 100, unit: "%", decimals: 0, step: 1 };
  return { scale: 1, unit: "×", decimals: 2, step: 0.05 };
}

/**
 * Where a move added now runs: from the playhead to the end of the clip. With
 * the playhead off the clip (`atMs` null) or on its last instant, the move
 * takes the whole clip.
 */
export function cameraMoveSpan(
  clip: Pick<TimelineClip, "durationMs">,
  atMs: number | null
): { startMs: number; durationMs: number } {
  const startMs =
    atMs === null || atMs >= clip.durationMs ? 0 : Math.max(0, atMs);
  return { startMs, durationMs: clip.durationMs - startMs };
}
