/**
 * The orbit gesture's arithmetic: pointer pixels and wheel notches into
 * `ClipModel3DCamera` terms (design §D7 "Preview").
 *
 * The rates are three.js `OrbitControls`', which is what the model editor
 * orbits with (`Model3DEditor.tsx` mounts drei's `<OrbitControls>` with the
 * default speeds), so the same drag turns the model by the same amount in both
 * surfaces:
 *
 *   - rotation: `theta -= 2π · Δx / element.clientHeight` and
 *     `phi -= 2π · Δy / element.clientHeight`, i.e. one full turn per frame
 *     height of travel, on both axes. Height on both is deliberate upstream —
 *     the aspect ratio must not distort the speed.
 *   - dolly: `0.95 ^ (deltaY / 100)` per wheel event, `_getZoomScale` with the
 *     default `zoomSpeed`.
 *
 * Elevation is `90° − phi`, so a downward drag (which lowers phi) raises the
 * camera, and `zoom` is a multiplier where above 1 moves closer, so it moves
 * the opposite way to OrbitControls' radius.
 *
 * Pure functions, no DOM: {@link Model3DOrbitOverlay} owns the events, this
 * owns the numbers.
 *
 * @module timeline/preview/model3dOrbitGesture
 */

import type { ClipModel3DCamera } from "@nodetool-ai/timeline";

/** Pointer travel, in CSS px, that turns the camera a full 360°. */
export const ORBIT_DEGREES_PER_FRAME_HEIGHT = 360;

/** Dolly factor per wheel notch: `ZOOM_WHEEL_BASE ^ (deltaY · SCALE)`. */
export const ZOOM_WHEEL_BASE = 0.95;
export const ZOOM_WHEEL_DELTA_SCALE = 0.01;

/**
 * Elevation stops one degree short of the poles. At ±90° the orbit camera's
 * position is parallel to its up vector and the framing flips — three's own
 * OrbitControls clamps phi away from 0 and π for the same reason.
 */
export const MIN_ELEVATION_DEG = -89;
export const MAX_ELEVATION_DEG = 89;

/**
 * Zoom stays positive: the renderer divides the auto-framed distance by it
 * (`render3d-core.ts`), so zero or negative is a camera behind the model. The
 * floor is the inspector's own (`SCRUB_ZOOM.min` in `ClipModel3DSection`), so
 * the gesture and the field agree on how close is close enough; the ceiling
 * only stops a long wheel burst from ending up inside the geometry.
 */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Degrees into [0, 360), so a long drag reads as a heading, not a tally. */
const wrapDegrees = (deg: number): number => ((deg % 360) + 360) % 360;

/** How far one CSS pixel of pointer travel turns the camera. */
export const orbitDegreesPerPixel = (frameHeightPx: number): number =>
  ORBIT_DEGREES_PER_FRAME_HEIGHT / Math.max(frameHeightPx, 1);

/**
 * The camera terms a drag of (`dxPx`, `dyPx`) from `start` lands on. Dragging
 * right turns the model right (azimuth falls) and dragging down lifts the
 * camera above it (elevation rises), matching OrbitControls.
 */
export function orbitCameraFromDrag(
  start: ClipModel3DCamera,
  dxPx: number,
  dyPx: number,
  frameHeightPx: number
): Pick<ClipModel3DCamera, "azimuthDeg" | "elevationDeg"> {
  const degPerPx = orbitDegreesPerPixel(frameHeightPx);
  return {
    azimuthDeg: wrapDegrees(start.azimuthDeg - dxPx * degPerPx),
    elevationDeg: clamp(
      start.elevationDeg + dyPx * degPerPx,
      MIN_ELEVATION_DEG,
      MAX_ELEVATION_DEG
    )
  };
}

/**
 * The zoom one wheel event lands on. `deltaY` carries its own sign, so
 * scrolling up (negative, the browser's "away from the user") moves closer,
 * the direction OrbitControls dollies in.
 */
export function zoomFromWheel(zoom: number, deltaY: number): number {
  const factor = Math.pow(ZOOM_WHEEL_BASE, deltaY * ZOOM_WHEEL_DELTA_SCALE);
  return clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
}

/** The pose as the readout says it: `Azimuth 145° · Elevation 30° · Zoom 1.20×`. */
export function formatOrbitPose(camera: ClipModel3DCamera): string {
  const azimuth = Math.round(camera.azimuthDeg);
  const elevation = Math.round(camera.elevationDeg);
  const zoom = camera.zoom.toFixed(2);
  return `Azimuth ${azimuth}° · Elevation ${elevation}° · Zoom ${zoom}×`;
}
