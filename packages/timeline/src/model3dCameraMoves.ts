/**
 * Camera move presets for a `model3d` clip's free camera.
 *
 * A move is a pure function from a start pose to the pose at each instant of
 * the move. `model3dCameraMoveCurves` turns one into keyframe curves on the
 * free camera channels, in the curve shape a custom animation stores, and
 * `applyModel3DCameraMove` writes them into the clip's keyframe animation.
 *
 * The channels are additive, so every curve value is an offset from the start
 * pose: 0 at the start of the move.
 */

import { ease } from "./animation/easing.js";
import type { ClipAnimation, CustomClipAnimation } from "./animation/types.js";
import { keyframeValueAt, replaceKeyframeSpan } from "./keyframes.js";
import {
  IDENTITY_MODEL3D_CAMERA_CHANNELS,
  MODEL3D_CAMERA_PROPERTIES,
  model3dFreeCameraBasis,
  resolveModel3DCamera,
  model3dFreeCameraPose,
  type Model3DCameraChannels,
  type Model3DCameraProperty,
  type Model3DFreeCameraPose,
  type Model3DVec3
} from "./model3d.js";
import type { TimelineClip } from "./types.js";

export type Model3DCameraMoveId =
  | "pan"
  | "tilt"
  | "orbit"
  | "pushIn"
  | "truck"
  | "crane"
  | "pedestal"
  | "zoom"
  | "dollyZoom"
  | "dutch";

/**
 * What a move's `amount` measures.
 *
 * - `degrees`: an angle.
 * - `distance`: a fraction of the distance from the eye to the target at the
 *   start of the move, so a move reads the same on a set of any size.
 * - `factor`: a multiplier on the focal length.
 */
export type Model3DCameraMoveUnit = "degrees" | "distance" | "factor";

export interface Model3DCameraMoveSpec {
  id: Model3DCameraMoveId;
  label: string;
  unit: Model3DCameraMoveUnit;
  /** The amount a caller gets when it passes none. */
  defaultAmount: number;
  /** What a positive amount does. */
  describe: string;
  /** The channels the move writes. */
  properties: readonly Model3DCameraProperty[];
  /**
   * True when the path is not a straight line in channel space, so the curves
   * hold one keyframe per sample instead of a start and an end.
   */
  sampled: boolean;
}

const POSITION = ["cameraPosX", "cameraPosY", "cameraPosZ"] as const;
const TARGET = ["cameraTargetX", "cameraTargetY", "cameraTargetZ"] as const;

export const MODEL3D_CAMERA_MOVES: readonly Model3DCameraMoveSpec[] = [
  {
    id: "pan",
    label: "Pan",
    unit: "degrees",
    defaultAmount: 30,
    describe: "Turns the camera to its right around the vertical axis. The eye stays put.",
    properties: ["cameraTargetX", "cameraTargetZ"],
    sampled: true
  },
  {
    id: "tilt",
    label: "Tilt",
    unit: "degrees",
    defaultAmount: 15,
    describe: "Turns the camera upward. The eye stays put.",
    properties: TARGET,
    sampled: true
  },
  {
    id: "orbit",
    label: "Orbit",
    unit: "degrees",
    defaultAmount: 45,
    describe: "Moves the eye to the camera's right on a circle around the target.",
    properties: ["cameraPosX", "cameraPosZ"],
    sampled: true
  },
  {
    id: "pushIn",
    label: "Push in",
    unit: "distance",
    defaultAmount: 0.3,
    describe: "Moves the eye toward the target. A negative amount pulls out.",
    properties: POSITION,
    sampled: false
  },
  {
    id: "truck",
    label: "Truck",
    unit: "distance",
    defaultAmount: 0.25,
    describe: "Slides the eye and the target to the camera's right.",
    properties: ["cameraPosX", "cameraPosZ", "cameraTargetX", "cameraTargetZ"],
    sampled: false
  },
  {
    id: "crane",
    label: "Crane",
    unit: "distance",
    defaultAmount: 0.25,
    describe: "Raises the eye while it keeps looking at the target.",
    properties: ["cameraPosY"],
    sampled: false
  },
  {
    id: "pedestal",
    label: "Pedestal",
    unit: "distance",
    defaultAmount: 0.25,
    describe: "Raises the eye and the target together.",
    properties: ["cameraPosY", "cameraTargetY"],
    sampled: false
  },
  {
    id: "zoom",
    label: "Zoom",
    unit: "factor",
    defaultAmount: 1.5,
    describe: "Multiplies the focal length. Above 1 zooms in, below 1 zooms out.",
    properties: ["cameraFov"],
    sampled: true
  },
  {
    id: "dollyZoom",
    label: "Dolly zoom",
    unit: "distance",
    defaultAmount: 0.4,
    describe:
      "Moves the eye toward the target and widens the lens so the subject at the target keeps its size.",
    properties: [...POSITION, "cameraFov"],
    sampled: true
  },
  {
    id: "dutch",
    label: "Dutch",
    unit: "degrees",
    defaultAmount: 15,
    describe: "Rolls the camera so the horizon turns clockwise in the picture.",
    properties: ["cameraRoll"],
    sampled: false
  }
];

/** How many segments a sampled move is cut into by default. */
export const MODEL3D_CAMERA_MOVE_SAMPLES = 24;

const DEG = Math.PI / 180;
/** A dolly never reaches the target: the eye stops at 5% of the distance. */
const MAX_DOLLY_FRACTION = 0.95;
const MAX_TILT_ELEVATION_DEG = 89;
const MIN_FOV_DEG = 1;
const MAX_FOV_DEG = 170;

export function model3dCameraMoveSpec(
  move: Model3DCameraMoveId
): Model3DCameraMoveSpec {
  const spec = MODEL3D_CAMERA_MOVES.find((entry) => entry.id === move);
  if (!spec) {
    throw new Error(
      `Unknown camera move "${String(move)}". Moves: ${MODEL3D_CAMERA_MOVES.map(
        (entry) => entry.id
      ).join(", ")}`
    );
  }
  return spec;
}

function add(a: Readonly<Model3DVec3>, b: Readonly<Model3DVec3>): Model3DVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Readonly<Model3DVec3>, b: Readonly<Model3DVec3>): Model3DVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaled(v: Readonly<Model3DVec3>, s: number): Model3DVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Rotate `v` around world +Y by `deg`, counter-clockwise seen from above. */
function rotateY(v: Readonly<Model3DVec3>, deg: number): Model3DVec3 {
  const cos = Math.cos(deg * DEG);
  const sin = Math.sin(deg * DEG);
  return [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
}

function clampFov(fovDeg: number): number {
  return Math.min(Math.max(fovDeg, MIN_FOV_DEG), MAX_FOV_DEG);
}

/**
 * The pose `progress` of the way through a move, 0 at the start and 1 at the
 * end. `amount` defaults to the move's `defaultAmount`.
 *
 * Directions are the camera's own at the start of the move, with roll left
 * out: "right" is horizontal and "up" is world +Y.
 */
export function model3dCameraMovePoseAt(
  move: Model3DCameraMoveId,
  start: Model3DFreeCameraPose,
  progress: number,
  amount?: number
): Model3DFreeCameraPose {
  const spec = model3dCameraMoveSpec(move);
  const total = amount ?? spec.defaultAmount;
  const pose: Model3DFreeCameraPose = {
    position: [...start.position],
    target: [...start.target],
    rollDeg: start.rollDeg,
    fovDeg: start.fovDeg
  };
  const toTarget = sub(start.target, start.position);
  const distance = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
  const basis = model3dFreeCameraBasis(start.position, start.target, 0);

  switch (move) {
    case "pan":
      pose.target = add(start.position, rotateY(toTarget, -total * progress));
      break;
    case "tilt": {
      const elevation = Math.asin(basis.forward[1]) / DEG;
      const end = Math.min(
        Math.max(elevation + total, -MAX_TILT_ELEVATION_DEG),
        MAX_TILT_ELEVATION_DEG
      );
      const angle = (end - elevation) * progress * DEG;
      const forward = add(
        scaled(basis.forward, Math.cos(angle)),
        scaled(basis.up, Math.sin(angle))
      );
      pose.target = add(start.position, scaled(forward, distance));
      break;
    }
    case "orbit":
      pose.position = add(
        start.target,
        rotateY(scaled(toTarget, -1), total * progress)
      );
      break;
    case "pushIn": {
      const fraction = Math.min(total, MAX_DOLLY_FRACTION) * progress;
      pose.position = add(start.position, scaled(toTarget, fraction));
      break;
    }
    case "truck": {
      const slide = scaled(basis.right, total * distance * progress);
      pose.position = add(start.position, slide);
      pose.target = add(start.target, slide);
      break;
    }
    case "crane":
      pose.position[1] += total * distance * progress;
      break;
    case "pedestal":
      pose.position[1] += total * distance * progress;
      pose.target[1] += total * distance * progress;
      break;
    case "zoom": {
      const factor = Math.max(total, 1e-3) ** progress;
      pose.fovDeg = clampFov(
        (2 * Math.atan(Math.tan((start.fovDeg * DEG) / 2) / factor)) / DEG
      );
      break;
    }
    case "dollyZoom": {
      const fraction = Math.min(total, MAX_DOLLY_FRACTION) * progress;
      pose.position = add(start.position, scaled(toTarget, fraction));
      // distance * tan(fov / 2) is the half height of the frame at the target.
      pose.fovDeg = clampFov(
        (2 * Math.atan(Math.tan((start.fovDeg * DEG) / 2) / (1 - fraction))) /
          DEG
      );
      break;
    }
    case "dutch":
      pose.rollDeg = start.rollDeg + total * progress;
      break;
  }
  return pose;
}

function channelValue(
  property: Model3DCameraProperty,
  pose: Model3DFreeCameraPose,
  start: Model3DFreeCameraPose
): number {
  switch (property) {
    case "cameraPosX":
      return pose.position[0] - start.position[0];
    case "cameraPosY":
      return pose.position[1] - start.position[1];
    case "cameraPosZ":
      return pose.position[2] - start.position[2];
    case "cameraTargetX":
      return pose.target[0] - start.target[0];
    case "cameraTargetY":
      return pose.target[1] - start.target[1];
    case "cameraTargetZ":
      return pose.target[2] - start.target[2];
    case "cameraRoll":
      return pose.rollDeg - start.rollDeg;
    case "cameraFov":
      return pose.fovDeg - start.fovDeg;
    default:
      return 0;
  }
}

export interface Model3DCameraMoveOptions {
  /** In the move's unit. The move's `defaultAmount` when absent. */
  amount?: number;
  /** An easing id from `animation/easing.ts`. Linear when absent. */
  easing?: string;
  /** Segments of a sampled move. {@link MODEL3D_CAMERA_MOVE_SAMPLES} when absent. */
  samples?: number;
}

/**
 * The curves of one move, in the shape `CustomClipAnimation.curves` stores:
 * `t` runs 0..1 over the move and every value is an offset from the start
 * pose, 0 at `t` 0.
 *
 * A straight move is two keyframes, with `easing` on the second, which is the
 * keyframe that eases the segment arriving at it. A sampled move is evenly
 * spaced linear keyframes with the easing folded into their values, because an
 * arc cut into eased chords would not follow the arc.
 */
export function model3dCameraMoveCurves(
  move: Model3DCameraMoveId,
  start: Model3DFreeCameraPose,
  options: Model3DCameraMoveOptions = {}
): CustomClipAnimation["curves"] {
  const spec = model3dCameraMoveSpec(move);
  const easing = options.easing ?? "linear";
  if (!spec.sampled) {
    const end = model3dCameraMovePoseAt(move, start, 1, options.amount);
    return spec.properties.map((property) => ({
      property,
      keyframes: [
        { t: 0, value: 0 },
        easing === "linear"
          ? { t: 1, value: channelValue(property, end, start) }
          : { t: 1, value: channelValue(property, end, start), easing }
      ]
    }));
  }
  const segments = Math.max(
    1,
    Math.round(options.samples ?? MODEL3D_CAMERA_MOVE_SAMPLES)
  );
  const poses: Model3DFreeCameraPose[] = [];
  for (let i = 0; i <= segments; i += 1) {
    poses.push(
      model3dCameraMovePoseAt(move, start, ease(easing, i / segments), options.amount)
    );
  }
  return spec.properties.map((property) => ({
    property,
    keyframes: poses.map((pose, i) => ({
      t: i / segments,
      value: channelValue(property, pose, start)
    }))
  }));
}

export interface ApplyModel3DCameraMoveOptions extends Model3DCameraMoveOptions {
  /** Clip-relative start of the move. 0 when absent. */
  startMs?: number;
  /** Length of the move. The rest of the clip when absent. */
  durationMs?: number;
}

/**
 * The clip's free camera at a clip-relative time, folded with its keyframe
 * curves. Preset animations on the clip are not read: they add onto whatever
 * the keyframes say, before and after a move alike.
 */
export function model3dKeyframedFreeCameraPose(
  clip: TimelineClip,
  atMs: number
): Model3DFreeCameraPose {
  const style = clip.model3dStyle;
  if (!style) {
    throw new Error(`Clip "${clip.name}" has no model3dStyle, so it has no camera.`);
  }
  const channels: Model3DCameraChannels = { ...IDENTITY_MODEL3D_CAMERA_CHANNELS };
  for (const property of MODEL3D_CAMERA_PROPERTIES) {
    channels[property] = keyframeValueAt(clip, property, atMs);
  }
  return model3dFreeCameraPose(resolveModel3DCamera(style, channels));
}

/**
 * Write a camera move into the clip's keyframe animation and return the
 * clip's new animation list, the way `setKeyframe` does.
 *
 * The move starts from the camera the clip's keyframes give at `startMs`, and
 * each written value is the channel's value there plus the move's offset, so
 * the picture does not jump at the start. Keyframes the move's channels
 * already had inside its span are replaced. The clip has to be in `free` mode:
 * convert an orbit camera with `orbitCameraToFree` first.
 */
export function applyModel3DCameraMove(
  clip: TimelineClip,
  move: Model3DCameraMoveId,
  options: ApplyModel3DCameraMoveOptions = {}
): ClipAnimation[] {
  const mode = clip.model3dStyle?.camera.mode;
  if (mode !== "free") {
    throw new Error(
      `Camera move "${move}" needs a free camera, and clip "${clip.name}" ` +
        `has ${mode === undefined ? "no camera" : `a ${mode} camera`}. ` +
        `Set model3dStyle.camera.mode to "free" first.`
    );
  }
  const startMs = Math.min(Math.max(options.startMs ?? 0, 0), clip.durationMs);
  const endMs = Math.min(
    startMs + Math.max(options.durationMs ?? clip.durationMs - startMs, 0),
    clip.durationMs
  );
  if (!(endMs > startMs)) {
    throw new Error(
      `Camera move "${move}" has no time to run: it starts at ${startMs} ms ` +
        `and clip "${clip.name}" is ${clip.durationMs} ms long.`
    );
  }
  const start = model3dKeyframedFreeCameraPose(clip, startMs);
  let working = clip;
  for (const curve of model3dCameraMoveCurves(move, start, options)) {
    const property = curve.property as Model3DCameraProperty;
    const base = keyframeValueAt(clip, property, startMs);
    working = {
      ...working,
      animations: replaceKeyframeSpan(
        working,
        property,
        curve.keyframes.map((keyframe) => ({
          atMs: startMs + keyframe.t * (endMs - startMs),
          value: base + keyframe.value,
          easing: keyframe.easing
        }))
      )
    };
  }
  return working.animations ?? [];
}
