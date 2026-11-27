/**
 * A plain-language description of a `model3d` clip's camera move, for a video
 * model that takes no reference video.
 *
 * The words come from the clip's keyframed camera at its first and last
 * instant. Preset animations on the clip are not read, as in
 * `model3dKeyframedFreeCameraPose`.
 */

import { keyframeValueAt } from "./keyframes.js";
import { model3dFreeCameraBasis } from "./model3d.js";
import { model3dKeyframedFreeCameraPose } from "./model3dCameraMoves.js";
import type { TimelineClip } from "./types.js";

/** What {@link describeModel3DCameraMove} says when nothing moves. */
export const MODEL3D_STATIC_CAMERA_DESCRIPTION =
  "The camera is static and holds one framing for the whole shot.";

/** Rotation below this many degrees is not described. */
const ANGLE_THRESHOLD_DEG = 3;
/** Translation below this fraction of the eye-to-target distance is not described. */
const DISTANCE_THRESHOLD = 0.05;
/** Lens change below this many degrees of field of view is not described. */
const FOV_THRESHOLD_DEG = 2;
/** A vertical move is a crane when the target rises less than this share of the eye's rise. */
const CRANE_TARGET_SHARE = 0.5;

const RAD = 180 / Math.PI;

type Vec3 = readonly [number, number, number];

const sub = (a: Vec3, b: Vec3): [number, number, number] => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2]
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Wrap an angle difference into -180..180. */
const wrapDeg = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * "slowly", "quickly" or nothing, from a rate measured against the rate an
 * unremarkable move has. `rate` and `typical` share a unit per second.
 */
function pace(rate: number, typical: number): string {
  if (rate < typical / 3) return " slowly";
  if (rate > typical * 3) return " quickly";
  return "";
}

function sentence(phrases: readonly string[]): string {
  if (phrases.length === 0) return MODEL3D_STATIC_CAMERA_DESCRIPTION;
  const joined =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `The camera ${joined}.`;
}

function describeOrbitCamera(clip: TimelineClip, seconds: number): string {
  const delta = (property: Parameters<typeof keyframeValueAt>[1]): number =>
    keyframeValueAt(clip, property, clip.durationMs) -
    keyframeValueAt(clip, property, 0);
  const phrases: string[] = [];
  const azimuth = delta("cameraAzimuth");
  if (Math.abs(azimuth) >= ANGLE_THRESHOLD_DEG) {
    phrases.push(
      `orbits ${azimuth > 0 ? "right" : "left"} around the subject` +
        pace(Math.abs(azimuth) / seconds, 20)
    );
  }
  const elevation = delta("cameraElevation");
  if (Math.abs(elevation) >= ANGLE_THRESHOLD_DEG) {
    phrases.push(
      `${elevation > 0 ? "rises" : "descends"}` +
        pace(Math.abs(elevation) / seconds, 20)
    );
  }
  // `cameraZoom` multiplies the framing distance multiplier, so the move is
  // the ratio of its two ends. Above one is closer.
  const zoomStart = keyframeValueAt(clip, "cameraZoom", 0);
  const zoomEnd = keyframeValueAt(clip, "cameraZoom", clip.durationMs);
  const zoom = zoomStart > 0 && zoomEnd > 0 ? zoomEnd / zoomStart : 1;
  if (Math.abs(zoom - 1) >= DISTANCE_THRESHOLD) {
    phrases.push(
      `${zoom > 1 ? "pushes in" : "pulls out"}` +
        pace(Math.abs(Math.log(zoom)) / seconds, 0.15)
    );
  }
  const fov = delta("cameraFov");
  if (Math.abs(fov) >= FOV_THRESHOLD_DEG) {
    phrases.push(`zooms ${fov < 0 ? "in" : "out"}` + pace(Math.abs(fov) / seconds, 8));
  }
  return sentence(phrases);
}

/**
 * Describe the clip's camera move between its first and last instant, for a
 * prompt: "The camera pushes in slowly and pans right."
 *
 * A free camera is read as a push in or pull out (movement along the view
 * axis), a truck (sideways), a pedestal (eye and target rise together) or a
 * crane (the eye rises and keeps looking at the target), a pan and a tilt
 * (the view direction turning about the eye), an orbit (the eye circling a
 * target that stays put), a zoom (the lens) and a roll. An orbit camera is
 * read from its azimuth, elevation, zoom and lens channels. A scene camera
 * has no keyed pose and reads as static. A change under the thresholds at the
 * top of this file is left out, and a clip with nothing left reads as
 * {@link MODEL3D_STATIC_CAMERA_DESCRIPTION}.
 */
export function describeModel3DCameraMove(clip: TimelineClip): string {
  const style = clip.model3dStyle;
  if (!style || style.camera.mode === "scene") {
    return MODEL3D_STATIC_CAMERA_DESCRIPTION;
  }
  const seconds = Math.max(clip.durationMs / 1000, 1e-3);
  if (style.camera.mode === "orbit") {
    return describeOrbitCamera(clip, seconds);
  }

  const start = model3dKeyframedFreeCameraPose(clip, 0);
  const end = model3dKeyframedFreeCameraPose(clip, clip.durationMs);
  const basis = model3dFreeCameraBasis(start.position, start.target, start.rollDeg);
  const endBasis = model3dFreeCameraBasis(end.position, end.target, end.rollDeg);
  const distance = Math.max(length(sub(start.target, start.position)), 1e-6);
  const endDistance = length(sub(end.target, end.position));
  const eyeMove = sub(end.position, start.position);
  const targetMove = sub(end.target, start.target);
  // The unrolled right axis, so a rolled camera still trucks "left" and
  // "right" in the ground plane.
  const flat = model3dFreeCameraBasis(start.position, start.target, 0);
  const forward = dot(eyeMove, basis.forward) / distance;
  const sideways = dot(eyeMove, flat.right) / distance;
  const vertical = eyeMove[1] / distance;

  const yaw = (f: Vec3): number => Math.atan2(f[0], -f[2]) * RAD;
  const pitch = (f: Vec3): number =>
    Math.asin(Math.min(1, Math.max(-1, f[1]))) * RAD;
  const pan = wrapDeg(yaw(endBasis.forward) - yaw(basis.forward));
  const tilt = pitch(endBasis.forward) - pitch(basis.forward);

  const phrases: string[] = [];

  // An orbit: the target stays where it was, the eye keeps its distance and
  // swings around it. Seen from the eye that is a sideways move plus an
  // opposite pan, which reads wrong as "trucks right and pans left".
  const targetHeld = length(targetMove) / distance < DISTANCE_THRESHOLD;
  const distanceHeld =
    Math.abs(endDistance - distance) / distance < DISTANCE_THRESHOLD * 2;
  const orbiting =
    targetHeld && distanceHeld && Math.abs(pan) >= ANGLE_THRESHOLD_DEG;
  if (orbiting) {
    phrases.push(
      `orbits ${sideways > 0 ? "right" : "left"} around the subject` +
        pace(Math.abs(pan) / seconds, 20)
    );
    if (Math.abs(vertical) >= DISTANCE_THRESHOLD) {
      phrases.push(vertical > 0 ? "rises" : "descends");
    }
  } else {
    if (Math.abs(forward) >= DISTANCE_THRESHOLD) {
      phrases.push(
        `${forward > 0 ? "pushes in" : "pulls out"}` +
          pace(Math.abs(forward) / seconds, 0.15)
      );
    }
    if (Math.abs(sideways) >= DISTANCE_THRESHOLD) {
      phrases.push(
        `trucks ${sideways > 0 ? "right" : "left"}` +
          pace(Math.abs(sideways) / seconds, 0.15)
      );
    }
    // A crane raises the eye while it keeps looking at the target, so the
    // tilt that comes with it is part of the move. A pedestal raises the eye
    // and the target together.
    const crane =
      Math.abs(vertical) >= DISTANCE_THRESHOLD &&
      Math.abs(targetMove[1]) < Math.abs(eyeMove[1]) * CRANE_TARGET_SHARE;
    if (Math.abs(vertical) >= DISTANCE_THRESHOLD) {
      phrases.push(
        `${crane ? "cranes" : "pedestals"} ${vertical > 0 ? "up" : "down"}` +
          pace(Math.abs(vertical) / seconds, 0.15)
      );
    }
    if (Math.abs(pan) >= ANGLE_THRESHOLD_DEG) {
      phrases.push(
        `pans ${pan > 0 ? "right" : "left"}` + pace(Math.abs(pan) / seconds, 20)
      );
    }
    if (!crane && Math.abs(tilt) >= ANGLE_THRESHOLD_DEG) {
      phrases.push(
        `tilts ${tilt > 0 ? "up" : "down"}` + pace(Math.abs(tilt) / seconds, 20)
      );
    }
  }

  const fov = end.fovDeg - start.fovDeg;
  if (Math.abs(fov) >= FOV_THRESHOLD_DEG) {
    phrases.push(`zooms ${fov < 0 ? "in" : "out"}` + pace(Math.abs(fov) / seconds, 8));
  }
  const roll = end.rollDeg - start.rollDeg;
  if (Math.abs(roll) >= ANGLE_THRESHOLD_DEG) {
    // Positive roll turns the horizon clockwise in the picture.
    phrases.push(
      `rolls so the horizon turns ${roll > 0 ? "clockwise" : "counterclockwise"}`
    );
  }
  return sentence(phrases);
}
