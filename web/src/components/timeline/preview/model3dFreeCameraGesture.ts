/**
 * The free camera gestures' arithmetic: pointer pixels and wheel notches into
 * a `Model3DFreeCameraPose`.
 *
 * The rates are the orbit gesture's (`model3dOrbitGesture.ts`), so a drag
 * turns a free camera around its target by the same angle it turns an orbit
 * camera around the model:
 *
 *   - orbit: one full turn per frame height of travel, on both axes.
 *   - truck: the point at the target stays under the pointer.
 *   - dolly and lens: `0.95 ^ (deltaY / 100)` per wheel event.
 *
 * Every function takes the composed pose (authored pose plus keyframe
 * channels) and returns the composed pose the gesture lands on.
 * `Inspector/model3dFreeCamera.ts` turns that into a clip edit.
 *
 * Pure functions, no DOM.
 *
 * @module timeline/preview/model3dFreeCameraGesture
 */

import {
  focalLengthMmToFovDeg,
  fovDegToFocalLengthMm,
  model3dFreeCameraBasis,
  model3dOrbitOffset,
  type Model3DFreeCameraPose,
  type Model3DVec3
} from "@nodetool-ai/timeline";

import {
  MAX_ELEVATION_DEG,
  MIN_ELEVATION_DEG,
  ZOOM_WHEEL_BASE,
  ZOOM_WHEEL_DELTA_SCALE,
  orbitDegreesPerPixel
} from "./model3dOrbitGesture";

/** The eye stops this far from the target, world units. */
export const MIN_FREE_DISTANCE = 0.01;
export const MAX_FREE_DISTANCE = 100_000;

/** The lens range the wheel reaches, millimetres on a 24 mm tall sensor. */
export const MIN_FREE_LENS_MM = 4;
export const MAX_FREE_LENS_MM = 600;

const RAD = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(value, min));

const eyeDistance = (pose: Model3DFreeCameraPose): number =>
  Math.hypot(
    pose.position[0] - pose.target[0],
    pose.position[1] - pose.target[1],
    pose.position[2] - pose.target[2]
  );

const wheelFactor = (deltaY: number): number =>
  Math.pow(ZOOM_WHEEL_BASE, deltaY * ZOOM_WHEEL_DELTA_SCALE);

/**
 * Turn the eye around the target. Dragging right turns the set right and
 * dragging down lifts the eye, as the orbit gesture does. The distance to the
 * target, the roll and the lens stay.
 */
export function freeOrbitFromDrag(
  start: Model3DFreeCameraPose,
  dxPx: number,
  dyPx: number,
  frameHeightPx: number
): Model3DFreeCameraPose {
  const offset: Model3DVec3 = [
    start.position[0] - start.target[0],
    start.position[1] - start.target[1],
    start.position[2] - start.target[2]
  ];
  const distance = Math.max(eyeDistance(start), MIN_FREE_DISTANCE);
  const azimuthDeg = Math.atan2(offset[0], offset[2]) / RAD;
  const elevationDeg = Math.asin(clamp(offset[1] / distance, -1, 1)) / RAD;
  const degPerPx = orbitDegreesPerPixel(frameHeightPx);
  const next = model3dOrbitOffset(
    azimuthDeg - dxPx * degPerPx,
    clamp(elevationDeg + dyPx * degPerPx, MIN_ELEVATION_DEG, MAX_ELEVATION_DEG),
    distance
  );
  return {
    ...start,
    target: [...start.target],
    position: [
      start.target[0] + next[0],
      start.target[1] + next[1],
      start.target[2] + next[2]
    ]
  };
}

/**
 * Slide the eye and the target together in the view plane. The point at the
 * target's depth stays under the pointer, so the picture follows the drag.
 */
export function freeTruckFromDrag(
  start: Model3DFreeCameraPose,
  dxPx: number,
  dyPx: number,
  frameHeightPx: number
): Model3DFreeCameraPose {
  const { right, up } = model3dFreeCameraBasis(
    start.position,
    start.target,
    start.rollDeg
  );
  const distance = Math.max(eyeDistance(start), MIN_FREE_DISTANCE);
  const unitsPerPx =
    (2 * distance * Math.tan((clamp(start.fovDeg, 1, 179) * RAD) / 2)) /
    Math.max(frameHeightPx, 1);
  const shift: Model3DVec3 = [0, 1, 2].map(
    (axis) => (-dxPx * right[axis] + dyPx * up[axis]) * unitsPerPx
  ) as Model3DVec3;
  return {
    ...start,
    position: [
      start.position[0] + shift[0],
      start.position[1] + shift[1],
      start.position[2] + shift[2]
    ],
    target: [
      start.target[0] + shift[0],
      start.target[1] + shift[1],
      start.target[2] + shift[2]
    ]
  };
}

/** Move the eye along the view axis. Scrolling up moves it toward the target. */
export function freeDollyFromWheel(
  pose: Model3DFreeCameraPose,
  deltaY: number
): Model3DFreeCameraPose {
  const { forward } = model3dFreeCameraBasis(pose.position, pose.target);
  const distance = clamp(
    eyeDistance(pose) / wheelFactor(deltaY),
    MIN_FREE_DISTANCE,
    MAX_FREE_DISTANCE
  );
  return {
    ...pose,
    target: [...pose.target],
    position: [
      pose.target[0] - forward[0] * distance,
      pose.target[1] - forward[1] * distance,
      pose.target[2] - forward[2] * distance
    ]
  };
}

/** Change the lens. Scrolling up lengthens it, which zooms in. */
export function freeLensFromWheel(
  pose: Model3DFreeCameraPose,
  deltaY: number
): Model3DFreeCameraPose {
  const lensMm = clamp(
    fovDegToFocalLengthMm(pose.fovDeg) * wheelFactor(deltaY),
    MIN_FREE_LENS_MM,
    MAX_FREE_LENS_MM
  );
  return { ...pose, fovDeg: focalLengthMmToFovDeg(lensMm) };
}

/** The pose as the readout says it: `Eye 0.00, 1.60, 5.00 · Lens 35 mm`. */
export function formatFreePose(pose: Model3DFreeCameraPose): string {
  const eye = pose.position.map((value) => value.toFixed(2)).join(", ");
  const lens = Math.round(fovDegToFocalLengthMm(pose.fovDeg));
  return `Eye ${eye} · Lens ${lens} mm`;
}
