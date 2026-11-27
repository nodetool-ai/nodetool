/**
 * The camera a `model3d` clip is drawn with: its authored pose folded with the
 * animated camera channels (D4), plus the pure camera math every host shares.
 *
 * Every host that renders a 3D layer — the browser session pool, the headless
 * Chromium one the agent frame preview drives, and the Blender bake — needs the
 * same number, so the fold lives here and not in any of them. Pure, and out of
 * `render/` so both the root export and the render surface can reach it.
 */

import type {
  ClipModel3DCamera,
  ClipModel3DStyle,
  Model3DCameraMode
} from "./types.js";

/** A point or direction in glTF world space: right-handed, Y up. */
export type Model3DVec3 = [number, number, number];

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
  /** Degrees, added to the field of view. Orbit and free mode both read it. */
  cameraFov: number;
  /** World units, added to the free camera's `position[0]`. */
  cameraPosX: number;
  /** World units, added to the free camera's `position[1]`. */
  cameraPosY: number;
  /** World units, added to the free camera's `position[2]`. */
  cameraPosZ: number;
  /** World units, added to the free camera's `target[0]`. */
  cameraTargetX: number;
  /** World units, added to the free camera's `target[1]`. */
  cameraTargetY: number;
  /** World units, added to the free camera's `target[2]`. */
  cameraTargetZ: number;
  /** Degrees, added to the free camera's `rollDeg`. */
  cameraRoll: number;
}

/** The channels at identity: a camera that no animation moves. */
export const IDENTITY_MODEL3D_CAMERA_CHANNELS: Readonly<Model3DCameraChannels> =
  Object.freeze({
    cameraAzimuth: 0,
    cameraElevation: 0,
    cameraZoom: 1,
    cameraFov: 0,
    cameraPosX: 0,
    cameraPosY: 0,
    cameraPosZ: 0,
    cameraTargetX: 0,
    cameraTargetY: 0,
    cameraTargetZ: 0,
    cameraRoll: 0
  });

/** The channels an `orbit` camera reads. */
export const MODEL3D_ORBIT_CAMERA_PROPERTIES = [
  "cameraAzimuth",
  "cameraElevation",
  "cameraZoom",
  "cameraFov"
] as const satisfies readonly (keyof Model3DCameraChannels)[];

/** The channels a `free` camera reads. `cameraFov` is its lens. */
export const MODEL3D_FREE_CAMERA_PROPERTIES = [
  "cameraPosX",
  "cameraPosY",
  "cameraPosZ",
  "cameraTargetX",
  "cameraTargetY",
  "cameraTargetZ",
  "cameraRoll",
  "cameraFov"
] as const satisfies readonly (keyof Model3DCameraChannels)[];

/**
 * Every camera channel as a runtime list, for the surfaces that offer them to
 * a user: the keyframe inspector and the animatable-property docs.
 */
export const MODEL3D_CAMERA_PROPERTIES = [
  "cameraAzimuth",
  "cameraElevation",
  "cameraZoom",
  "cameraFov",
  "cameraPosX",
  "cameraPosY",
  "cameraPosZ",
  "cameraTargetX",
  "cameraTargetY",
  "cameraTargetZ",
  "cameraRoll"
] as const satisfies readonly (keyof Model3DCameraChannels)[];

export type Model3DCameraProperty = (typeof MODEL3D_CAMERA_PROPERTIES)[number];

/** The channels a camera in `mode` reads. `scene` reads none. */
export function model3dCameraPropertiesFor(
  mode: Model3DCameraMode
): readonly Model3DCameraProperty[] {
  if (mode === "free") return MODEL3D_FREE_CAMERA_PROPERTIES;
  if (mode === "orbit") return MODEL3D_ORBIT_CAMERA_PROPERTIES;
  return [];
}

/** Where a free camera sits when the clip stores no `position`. */
export const DEFAULT_FREE_CAMERA_POSITION: Readonly<Model3DVec3> =
  Object.freeze([0, 1.6, 5] as Model3DVec3);

/** Where a free camera looks when the clip stores no `target`. */
export const DEFAULT_FREE_CAMERA_TARGET: Readonly<Model3DVec3> = Object.freeze([
  0, 1, 0
] as Model3DVec3);

/** A free camera with every field present. */
export interface Model3DFreeCameraPose {
  /** Camera eye, world units. */
  position: Model3DVec3;
  /** Look-at point, world units. */
  target: Model3DVec3;
  /** Roll around the view axis, degrees. Positive turns the horizon clockwise. */
  rollDeg: number;
  /** Vertical field of view, degrees. */
  fovDeg: number;
}

/**
 * The free pose a camera describes, with the defaults filled in: `position`
 * `[0, 1.6, 5]`, `target` `[0, 1, 0]`, `rollDeg` 0. It reads the same fields in
 * every mode, so call it on a camera that is in `free` mode.
 */
export function model3dFreeCameraPose(
  camera: ClipModel3DCamera
): Model3DFreeCameraPose {
  return {
    position: [...(camera.position ?? DEFAULT_FREE_CAMERA_POSITION)],
    target: [...(camera.target ?? DEFAULT_FREE_CAMERA_TARGET)],
    rollDeg: camera.rollDeg ?? 0,
    fovDeg: camera.fovDeg
  };
}

/**
 * Fold the sampled camera channels onto the clip's authored camera. Additive
 * channels add and `cameraZoom` multiplies, exactly as `ANIMATED_PROPERTY_FOLD`
 * declares — an animation moves the camera from wherever the clip parks it,
 * so re-posing the clip keeps the move.
 *
 * `free` mode adds the position, target and roll channels onto the authored
 * `position`, `target` and `rollDeg`, and returns all three filled in. The
 * other modes leave those three fields as stored. Every mode keeps the terms it
 * does not use, because a mode switch must not lose the pose.
 */
export function resolveModel3DCamera(
  style: ClipModel3DStyle,
  anim: Model3DCameraChannels
): ClipModel3DCamera {
  const camera = style.camera;
  const resolved: ClipModel3DCamera = {
    ...camera,
    azimuthDeg: camera.azimuthDeg + anim.cameraAzimuth,
    elevationDeg: camera.elevationDeg + anim.cameraElevation,
    fovDeg: camera.fovDeg + anim.cameraFov,
    zoom: camera.zoom * anim.cameraZoom
  };
  if (camera.mode !== "free") return resolved;
  const pose = model3dFreeCameraPose(camera);
  resolved.position = [
    pose.position[0] + anim.cameraPosX,
    pose.position[1] + anim.cameraPosY,
    pose.position[2] + anim.cameraPosZ
  ];
  resolved.target = [
    pose.target[0] + anim.cameraTargetX,
    pose.target[1] + anim.cameraTargetY,
    pose.target[2] + anim.cameraTargetZ
  ];
  resolved.rollDeg = pose.rollDeg + anim.cameraRoll;
  return resolved;
}

const DEG = Math.PI / 180;

function sub(a: Readonly<Model3DVec3>, b: Readonly<Model3DVec3>): Model3DVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Readonly<Model3DVec3>, b: Readonly<Model3DVec3>): Model3DVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function length(v: Readonly<Model3DVec3>): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function scaled(v: Readonly<Model3DVec3>, s: number): Model3DVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** The camera's axes in world space, each of unit length. */
export interface Model3DCameraBasis {
  /** From the eye toward the target. */
  forward: Model3DVec3;
  /** Toward the right edge of the picture. */
  right: Model3DVec3;
  /** Toward the top edge of the picture. */
  up: Model3DVec3;
}

/**
 * The axes of a free camera at `position` looking at `target`, rolled by
 * `rollDeg`.
 *
 * With no roll, `right` is horizontal and `up` leans toward world +Y. A
 * positive roll turns the camera counter-clockwise around its view axis as
 * seen from behind it, so the horizon turns clockwise in the picture:
 * `up = cos(roll) * up0 - sin(roll) * right0`. This is `lookAt` followed by
 * `rotateZ(roll)` in three.js.
 *
 * A camera with `position` equal to `target` looks down -Z. A camera looking
 * straight up or down has no horizontal right, so it takes world +X.
 */
export function model3dFreeCameraBasis(
  position: Readonly<Model3DVec3>,
  target: Readonly<Model3DVec3>,
  rollDeg = 0
): Model3DCameraBasis {
  const toTarget = sub(target, position);
  const distance = length(toTarget);
  const forward: Model3DVec3 =
    distance > 1e-9 ? scaled(toTarget, 1 / distance) : [0, 0, -1];
  const flat = cross(forward, [0, 1, 0]);
  const flatLength = length(flat);
  const right0: Model3DVec3 =
    flatLength > 1e-6 ? scaled(flat, 1 / flatLength) : [1, 0, 0];
  const up0 = cross(right0, forward);
  const cos = Math.cos(rollDeg * DEG);
  const sin = Math.sin(rollDeg * DEG);
  return {
    forward,
    right: [
      cos * right0[0] + sin * up0[0],
      cos * right0[1] + sin * up0[1],
      cos * right0[2] + sin * up0[2]
    ],
    up: [
      cos * up0[0] - sin * right0[0],
      cos * up0[1] - sin * right0[1],
      cos * up0[2] - sin * right0[2]
    ]
  };
}

/** The sensor height the lens conversions assume: a full-frame 36 x 24 mm. */
export const MODEL3D_SENSOR_HEIGHT_MM = 24;

/**
 * The vertical field of view, in degrees, of a lens `focalLengthMm` long on a
 * 24 mm tall sensor: `2 * atan(12 / f)`. A 50 mm lens is about 27 degrees.
 */
export function focalLengthMmToFovDeg(focalLengthMm: number): number {
  const half = MODEL3D_SENSOR_HEIGHT_MM / 2;
  return (2 * Math.atan(half / Math.max(focalLengthMm, 1e-6))) / DEG;
}

/** The inverse of {@link focalLengthMmToFovDeg}: `12 / tan(fov / 2)`. */
export function fovDegToFocalLengthMm(fovDeg: number): number {
  const half = MODEL3D_SENSOR_HEIGHT_MM / 2;
  const clamped = Math.min(Math.max(fovDeg, 1e-6), 179.999);
  return half / Math.tan((clamped * DEG) / 2);
}

/** How far an orbit camera stands from its target. */
export interface Model3DOrbitFraming {
  /** Distance from the look-at point to the camera. */
  distance: number;
  near: number;
  far: number;
}

/**
 * The distance that fits a bounding sphere of `radius` into a camera with the
 * given vertical fov and aspect, with `zoom` applied (above 1 moves closer).
 *
 * The same math as `computeFraming` in
 * `packages/video-nodes/src/nodes/model3d/render3d-core.ts` and
 * `compute_framing` in `packages/blender-nodes/blender_ops/framing.py`. The
 * render core keeps its own copy because its headless page bundle must not
 * pull this package in, and `packages/video-nodes/tests/model3d-render.test.ts`
 * pins the two to each other.
 */
export function computeModel3DOrbitFraming(
  radius: number,
  fovDeg: number,
  aspect: number,
  zoom: number
): Model3DOrbitFraming {
  const safeRadius = Math.max(radius, 1e-6);
  const vFov = Math.max(fovDeg, 1) * DEG;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-6));
  const fitV = safeRadius / Math.sin(vFov / 2);
  const fitH = safeRadius / Math.sin(hFov / 2);
  const distance = Math.max(fitV, fitH) / Math.max(zoom, 1e-3);
  return {
    distance,
    near: Math.max(distance - safeRadius * 4, distance / 100, 1e-4),
    far: distance + safeRadius * 10
  };
}

/**
 * The offset from the look-at point to an orbit camera `distance` away.
 * Azimuth 0 sits on +Z and looks down -Z, and a growing azimuth moves the
 * camera toward +X. The same math as `orbitOffset` in the render core.
 */
export function model3dOrbitOffset(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number
): Model3DVec3 {
  const az = azimuthDeg * DEG;
  const el = Math.min(Math.max(elevationDeg, -89.9), 89.9) * DEG;
  return [
    distance * Math.cos(el) * Math.sin(az),
    distance * Math.sin(el),
    distance * Math.cos(el) * Math.cos(az)
  ];
}

/** What an orbit camera is fitted against, as the render session measures it. */
export interface Model3DOrbitFit {
  /** Center of the model's rest-pose bounding sphere, world units. */
  center: Readonly<Model3DVec3>;
  /** Radius of that sphere, world units. */
  radius: number;
  /** Picture width divided by height. */
  aspect: number;
}

/**
 * The `free` camera that draws the picture an `orbit` camera draws.
 *
 * The orbit terms stay on the result, so switching back to `orbit` restores
 * the old pose. `fit` has to describe the model the clip renders: the bounding
 * sphere of its rest pose and the aspect of the picture. Pass a camera already
 * folded by {@link resolveModel3DCamera} to convert the animated pose at one
 * instant. A camera that is not in `orbit` mode is returned as a copy.
 */
export function orbitCameraToFree(
  camera: ClipModel3DCamera,
  fit: Model3DOrbitFit
): ClipModel3DCamera {
  if (camera.mode !== "orbit") return { ...camera };
  const offsetToTarget = camera.targetOffset ?? [0, 0, 0];
  const target: Model3DVec3 = [
    fit.center[0] + offsetToTarget[0],
    fit.center[1] + offsetToTarget[1],
    fit.center[2] + offsetToTarget[2]
  ];
  const framing = computeModel3DOrbitFraming(
    fit.radius,
    camera.fovDeg,
    fit.aspect,
    camera.zoom
  );
  const offset = model3dOrbitOffset(
    camera.azimuthDeg,
    camera.elevationDeg,
    framing.distance
  );
  return {
    ...camera,
    mode: "free",
    position: [
      target[0] + offset[0],
      target[1] + offset[1],
      target[2] + offset[2]
    ],
    target,
    rollDeg: 0
  };
}
