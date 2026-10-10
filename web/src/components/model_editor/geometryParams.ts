import * as THREE from "three";
import { isNumber } from "../../utils/typePredicates";

/**
 * Geometry types whose construction parameters the Properties panel can edit
 * and rebuild live, mirroring the per-type sub-panels in the three.js editor
 * (Sidebar.Geometry.<Type>.js). Loaded GLTF meshes typically carry a plain
 * BufferGeometry with no `.parameters`, so they are intentionally not editable.
 */
export type EditableGeometryType =
  | "BoxGeometry"
  | "SphereGeometry"
  | "PlaneGeometry"
  | "CylinderGeometry"
  | "ConeGeometry"
  | "TorusGeometry";

interface GeometryParamSpec {
  /** Key on `geometry.parameters` and the constructor argument. */
  key: string;
  label: string;
  /** float: plain number; int: rounded, min 1+; angle: stored radians, edited in degrees. */
  kind: "float" | "int" | "angle";
  min?: number;
  max?: number;
  step?: number;
}

const TAU = Math.PI * 2;

/**
 * Upper bound for every segment count. A box at 2000 segments per side has
 * about 24 million vertices and freezes the tab while it builds.
 */
export const MAX_SEGMENTS = 512;

export const GEOMETRY_PARAM_SPECS = {
  BoxGeometry: [
    { key: "width", label: "Width", kind: "float", min: 0.001, step: 0.1 },
    { key: "height", label: "Height", kind: "float", min: 0.001, step: 0.1 },
    { key: "depth", label: "Depth", kind: "float", min: 0.001, step: 0.1 },
    { key: "widthSegments", label: "W Segs", kind: "int", min: 1, max: MAX_SEGMENTS },
    { key: "heightSegments", label: "H Segs", kind: "int", min: 1, max: MAX_SEGMENTS },
    { key: "depthSegments", label: "D Segs", kind: "int", min: 1, max: MAX_SEGMENTS }
  ],
  SphereGeometry: [
    { key: "radius", label: "Radius", kind: "float", min: 0.001, step: 0.1 },
    { key: "widthSegments", label: "W Segs", kind: "int", min: 3, max: MAX_SEGMENTS },
    { key: "heightSegments", label: "H Segs", kind: "int", min: 2, max: MAX_SEGMENTS },
    { key: "phiStart", label: "Phi Start", kind: "angle" },
    { key: "phiLength", label: "Phi Len", kind: "angle" },
    { key: "thetaStart", label: "Theta Start", kind: "angle" },
    { key: "thetaLength", label: "Theta Len", kind: "angle" }
  ],
  PlaneGeometry: [
    { key: "width", label: "Width", kind: "float", min: 0.001, step: 0.1 },
    { key: "height", label: "Height", kind: "float", min: 0.001, step: 0.1 },
    { key: "widthSegments", label: "W Segs", kind: "int", min: 1, max: MAX_SEGMENTS },
    { key: "heightSegments", label: "H Segs", kind: "int", min: 1, max: MAX_SEGMENTS }
  ],
  CylinderGeometry: [
    { key: "radiusTop", label: "Radius Top", kind: "float", min: 0, step: 0.1 },
    {
      key: "radiusBottom",
      label: "Radius Bot",
      kind: "float",
      min: 0,
      step: 0.1
    },
    { key: "height", label: "Height", kind: "float", min: 0.001, step: 0.1 },
    { key: "radialSegments", label: "Radial Segs", kind: "int", min: 3, max: MAX_SEGMENTS },
    { key: "heightSegments", label: "Height Segs", kind: "int", min: 1, max: MAX_SEGMENTS },
    { key: "thetaStart", label: "Theta Start", kind: "angle" },
    { key: "thetaLength", label: "Theta Len", kind: "angle" }
  ],
  ConeGeometry: [
    { key: "radius", label: "Radius", kind: "float", min: 0.001, step: 0.1 },
    { key: "height", label: "Height", kind: "float", min: 0.001, step: 0.1 },
    { key: "radialSegments", label: "Radial Segs", kind: "int", min: 3, max: MAX_SEGMENTS },
    { key: "heightSegments", label: "Height Segs", kind: "int", min: 1, max: MAX_SEGMENTS },
    { key: "thetaStart", label: "Theta Start", kind: "angle" },
    { key: "thetaLength", label: "Theta Len", kind: "angle" }
  ],
  TorusGeometry: [
    { key: "radius", label: "Radius", kind: "float", min: 0.001, step: 0.1 },
    { key: "tube", label: "Tube", kind: "float", min: 0.001, step: 0.05 },
    { key: "radialSegments", label: "Radial Segs", kind: "int", min: 3, max: MAX_SEGMENTS },
    { key: "tubularSegments", label: "Tubular Segs", kind: "int", min: 3, max: MAX_SEGMENTS },
    { key: "arc", label: "Arc", kind: "angle" }
  ]
} satisfies Record<EditableGeometryType, readonly GeometryParamSpec[]>;

export type GeometryParams = Record<string, number | boolean>;

export const isEditableGeometryType = (
  type: string | undefined
): type is EditableGeometryType =>
  type !== undefined && type in GEOMETRY_PARAM_SPECS;

/** Read a geometry's construction parameters, if it exposes any. */
export const readGeometryParams = (
  geometry: THREE.BufferGeometry
): GeometryParams => {
  const params = (geometry as { parameters?: GeometryParams }).parameters;
  return params ? { ...params } : {};
};

const num = (params: GeometryParams, key: string, fallback: number): number => {
  const value = params[key];
  return isNumber(value) ? value : fallback;
};

/**
 * Round `int` params and keep every param inside its spec bounds. The numeric
 * field commits on each keystroke and clamps only on blur, so a value typed
 * on the way to another (a 0 before 05) must not reach the constructor:
 * BoxGeometry with 0 segments divides by zero and fills the mesh with NaN.
 */
const clampToSpecs = (
  type: EditableGeometryType,
  params: GeometryParams
): GeometryParams => {
  const clamped = { ...params };
  for (const spec of GEOMETRY_PARAM_SPECS[
    type
  ] as readonly GeometryParamSpec[]) {
    const value = clamped[spec.key];
    if (!isNumber(value)) {
      continue;
    }
    const rounded = spec.kind === "int" ? Math.round(value) : value;
    clamped[spec.key] = THREE.MathUtils.clamp(
      rounded,
      spec.min ?? -Infinity,
      spec.max ?? Infinity
    );
  }
  return clamped;
};

/**
 * Construct a fresh geometry from a (possibly edited) parameter object. The
 * caller disposes the previous geometry and assigns the result. Unedited keys
 * fall back to the geometry's defaults so partial parameter objects are safe,
 * and values outside a param's bounds are clamped to them.
 */
export const buildGeometry = (
  type: EditableGeometryType,
  rawParams: GeometryParams
): THREE.BufferGeometry => {
  const params = clampToSpecs(type, rawParams);
  switch (type) {
    case "BoxGeometry":
      return new THREE.BoxGeometry(
        num(params, "width", 1),
        num(params, "height", 1),
        num(params, "depth", 1),
        num(params, "widthSegments", 1),
        num(params, "heightSegments", 1),
        num(params, "depthSegments", 1)
      );
    case "SphereGeometry":
      return new THREE.SphereGeometry(
        num(params, "radius", 1),
        num(params, "widthSegments", 32),
        num(params, "heightSegments", 16),
        num(params, "phiStart", 0),
        num(params, "phiLength", TAU),
        num(params, "thetaStart", 0),
        num(params, "thetaLength", Math.PI)
      );
    case "PlaneGeometry":
      return new THREE.PlaneGeometry(
        num(params, "width", 1),
        num(params, "height", 1),
        num(params, "widthSegments", 1),
        num(params, "heightSegments", 1)
      );
    case "CylinderGeometry":
      return new THREE.CylinderGeometry(
        num(params, "radiusTop", 1),
        num(params, "radiusBottom", 1),
        num(params, "height", 1),
        num(params, "radialSegments", 32),
        num(params, "heightSegments", 1),
        params.openEnded === true,
        num(params, "thetaStart", 0),
        num(params, "thetaLength", TAU)
      );
    case "ConeGeometry":
      return new THREE.ConeGeometry(
        num(params, "radius", 1),
        num(params, "height", 1),
        num(params, "radialSegments", 32),
        num(params, "heightSegments", 1),
        params.openEnded === true,
        num(params, "thetaStart", 0),
        num(params, "thetaLength", TAU)
      );
    case "TorusGeometry":
      return new THREE.TorusGeometry(
        num(params, "radius", 1),
        num(params, "tube", 0.4),
        num(params, "radialSegments", 12),
        num(params, "tubularSegments", 48),
        num(params, "arc", TAU)
      );
  }
};
