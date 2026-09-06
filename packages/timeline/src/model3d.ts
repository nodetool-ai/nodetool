/**
 * The camera a `model3d` clip is drawn with: its authored pose folded with the
 * four animated camera channels (D4).
 *
 * Every host that renders a 3D layer — the browser session pool, the headless
 * Chromium one the agent frame preview drives, and the Blender bake — needs the
 * same number, so the fold lives here and not in any of them. Pure, and out of
 * `render/` so both the root export and the render surface can reach it.
 */

import type { ClipModel3DCamera, ClipModel3DStyle } from "./types.js";

/**
 * The animated camera channels of one sample. Named the way `AnimationSample`
 * names them, so a caller passes the sample — or the resolved layer props that
 * carry it — straight through.
 */
export interface Model3DCameraChannels {
  /** Degrees, added to the orbit azimuth. */
  cameraAzimuth: number;
  /** Degrees, added to the orbit elevation. */
  cameraElevation: number;
  /** Multiplier on the framing distance multiplier. */
  cameraZoom: number;
  /** Degrees, added to the field of view. */
  cameraFov: number;
}

/**
 * The four channels as a runtime list, for the surfaces that offer them to a
 * user: the keyframe inspector and the animatable-property docs.
 */
export const MODEL3D_CAMERA_PROPERTIES = [
  "cameraAzimuth",
  "cameraElevation",
  "cameraZoom",
  "cameraFov"
] as const satisfies readonly (keyof Model3DCameraChannels)[];

/**
 * Fold the sampled camera channels onto the clip's authored camera. Additive
 * channels add and `cameraZoom` multiplies, exactly as `ANIMATED_PROPERTY_FOLD`
 * declares — an animation moves the camera from wherever the clip parks it,
 * so re-posing the clip keeps the move.
 *
 * `scene` mode keeps `sceneCameraName` and the orbit terms it does not use;
 * nothing is dropped, because a mode switch must not lose the pose.
 */
export function resolveModel3DCamera(
  style: ClipModel3DStyle,
  anim: Model3DCameraChannels
): ClipModel3DCamera {
  const camera = style.camera;
  return {
    ...camera,
    azimuthDeg: camera.azimuthDeg + anim.cameraAzimuth,
    elevationDeg: camera.elevationDeg + anim.cameraElevation,
    fovDeg: camera.fovDeg + anim.cameraFov,
    zoom: camera.zoom * anim.cameraZoom
  };
}
