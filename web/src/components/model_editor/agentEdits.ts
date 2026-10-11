import * as THREE from "three";

import type { EditorCommand } from "./editorHistory";
import {
  GEOMETRY_PARAM_SPECS,
  buildGeometry,
  isEditableGeometryType,
  readGeometryParams,
  type GeometryParams
} from "./geometryParams";
import { applyOpacity, toOpaqueHex } from "./PropertiesPanel";
import type {
  Model3DGeometryInfo,
  Model3DLightInfo,
  Model3DLightPatch,
  Model3DMaterialInfo,
  Model3DMaterialPatch
} from "./model3DToolBridge";

/**
 * Run `mutate` and return the command that reverses it. `capture` reads the
 * state `mutate` touches and returns a function that writes it back.
 */
export const snapshotCommand = (
  label: string,
  capture: () => () => void,
  mutate: () => void
): EditorCommand => {
  const restoreBefore = capture();
  mutate();
  const restoreAfter = capture();
  return { label, undo: restoreBefore, redo: restoreAfter };
};

type StandardLike = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
};

const hex = (color: THREE.Color): string => `#${color.getHexString()}`;

const round = (value: number): number => Math.round(value * 1000) / 1000;

export const materialsOf = (mesh: THREE.Mesh): THREE.Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

export const describeMaterial = (
  material: THREE.Material,
  slot: number
): Model3DMaterialInfo => {
  const m = material as StandardLike;
  const info: Model3DMaterialInfo = {
    slot,
    name: material.name,
    type: material.type,
    opacity: round(material.opacity),
    transparent: material.transparent
  };
  if (m.color) {
    info.color = hex(m.color);
  }
  if (m.emissive) {
    info.emissive = hex(m.emissive);
  }
  if (typeof m.emissiveIntensity === "number") {
    info.emissiveIntensity = round(m.emissiveIntensity);
  }
  if (typeof m.metalness === "number") {
    info.metalness = round(m.metalness);
  }
  if (typeof m.roughness === "number") {
    info.roughness = round(m.roughness);
  }
  return info;
};

export const describeLight = (light: THREE.Light): Model3DLightInfo => {
  const info: Model3DLightInfo = {
    type: light.type,
    color: hex(light.color),
    intensity: round(light.intensity)
  };
  if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
    info.distance = round(light.distance);
    info.decay = round(light.decay);
  }
  if (light instanceof THREE.SpotLight) {
    info.angle = round(THREE.MathUtils.radToDeg(light.angle));
    info.penumbra = round(light.penumbra);
  }
  return info;
};

const isAngleParam = (type: string, key: string): boolean => {
  if (!isEditableGeometryType(type)) {
    return false;
  }
  return GEOMETRY_PARAM_SPECS[type].some((spec) => spec.key === key && spec.kind === "angle");
};

/** Geometry parameters in the units the Inspector shows: angles in degrees. */
export const describeGeometry = (mesh: THREE.Mesh): Model3DGeometryInfo | null => {
  const type = mesh.geometry.type;
  if (!isEditableGeometryType(type)) {
    return null;
  }
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(readGeometryParams(mesh.geometry))) {
    if (typeof value === "number") {
      params[key] = round(isAngleParam(type, key) ? THREE.MathUtils.radToDeg(value) : value);
    }
  }
  return { type, params };
};

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Read a hex color or a CSS color name. `THREE.Color.set` only warns on a
 * string it cannot read and keeps its old value, so check the form first.
 */
const parseColor = (value: string, field: string): THREE.Color => {
  const text = toOpaqueHex(value.trim());
  if (!HEX_COLOR.test(text) && !(text.toLowerCase() in THREE.Color.NAMES)) {
    throw new Error(`${field} must be a hex color such as "#ff8800" or a CSS color name, got "${value}".`);
  }
  return new THREE.Color(text.toLowerCase());
};

const inRange = (value: number, min: number, max: number, field: string): number => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}, got ${value}.`);
  }
  return value;
};

const nonNegative = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a number of 0 or more, got ${value}.`);
  }
  return value;
};

/**
 * Apply a material patch to one slot, or to every slot when `patch.slot` is
 * left out, and return the command that reverses it. Throws before changing
 * anything when a field does not apply to the material.
 */
export const materialPatchCommand = (
  mesh: THREE.Mesh,
  patch: Model3DMaterialPatch
): EditorCommand => {
  const all = materialsOf(mesh);
  if (patch.slot !== undefined && (patch.slot < 0 || patch.slot >= all.length)) {
    throw new Error(
      `Material slot ${patch.slot} does not exist. This mesh has ${all.length} slot(s), numbered from 0.`
    );
  }
  const targets = (patch.slot === undefined ? all : [all[patch.slot]]) as StandardLike[];
  const color = patch.color === undefined ? undefined : parseColor(patch.color, "color");
  const emissive =
    patch.emissive === undefined ? undefined : parseColor(patch.emissive, "emissive");
  const metalness =
    patch.metalness === undefined ? undefined : inRange(patch.metalness, 0, 1, "metalness");
  const roughness =
    patch.roughness === undefined ? undefined : inRange(patch.roughness, 0, 1, "roughness");
  const opacity =
    patch.opacity === undefined ? undefined : inRange(patch.opacity, 0, 1, "opacity");
  const emissiveIntensity =
    patch.emissiveIntensity === undefined
      ? undefined
      : nonNegative(patch.emissiveIntensity, "emissive_intensity");

  for (const material of targets) {
    const missing = [
      color && !material.color ? "color" : null,
      (emissive || emissiveIntensity !== undefined) && !material.emissive ? "emissive" : null,
      metalness !== undefined && typeof material.metalness !== "number" ? "metalness" : null,
      roughness !== undefined && typeof material.roughness !== "number" ? "roughness" : null
    ].filter((field): field is string => field !== null);
    if (missing.length > 0) {
      throw new Error(
        `${material.type} has no ${missing.join(", ")}. Leave those fields out, or pick a slot with a standard material.`
      );
    }
  }

  const capture = (): (() => void) => {
    const saved = targets.map((material) => ({
      material,
      color: material.color?.clone(),
      emissive: material.emissive?.clone(),
      emissiveIntensity: material.emissiveIntensity,
      metalness: material.metalness,
      roughness: material.roughness,
      opacity: material.opacity,
      transparent: material.transparent
    }));
    return () => {
      for (const s of saved) {
        if (s.color) {
          s.material.color?.copy(s.color);
        }
        if (s.emissive) {
          s.material.emissive?.copy(s.emissive);
        }
        if (s.emissiveIntensity !== undefined) {
          s.material.emissiveIntensity = s.emissiveIntensity;
        }
        if (s.metalness !== undefined) {
          s.material.metalness = s.metalness;
        }
        if (s.roughness !== undefined) {
          s.material.roughness = s.roughness;
        }
        s.material.opacity = s.opacity;
        s.material.transparent = s.transparent;
        s.material.needsUpdate = true;
      }
    };
  };

  return snapshotCommand(`Edit material of ${mesh.name || mesh.type}`, capture, () => {
    for (const material of targets) {
      if (color) {
        material.color?.copy(color);
      }
      if (emissive) {
        material.emissive?.copy(emissive);
      }
      if (emissiveIntensity !== undefined) {
        material.emissiveIntensity = emissiveIntensity;
      }
      if (metalness !== undefined) {
        material.metalness = metalness;
      }
      if (roughness !== undefined) {
        material.roughness = roughness;
      }
      if (opacity !== undefined) {
        applyOpacity(material, opacity);
      }
    }
  });
};

/** Apply a light patch and return the command that reverses it. */
export const lightPatchCommand = (
  light: THREE.Light,
  patch: Model3DLightPatch
): EditorCommand => {
  const ranged = light instanceof THREE.PointLight || light instanceof THREE.SpotLight;
  const spot = light instanceof THREE.SpotLight ? light : null;
  if (!ranged && (patch.distance !== undefined || patch.decay !== undefined)) {
    throw new Error(`${light.type} has no distance or decay. Only point and spot lights do.`);
  }
  if (!spot && (patch.angle !== undefined || patch.penumbra !== undefined)) {
    throw new Error(`${light.type} has no angle or penumbra. Only spot lights do.`);
  }
  const color = patch.color === undefined ? undefined : parseColor(patch.color, "color");
  const intensity =
    patch.intensity === undefined ? undefined : nonNegative(patch.intensity, "intensity");
  const distance =
    patch.distance === undefined ? undefined : nonNegative(patch.distance, "distance");
  const decay = patch.decay === undefined ? undefined : nonNegative(patch.decay, "decay");
  const angle =
    patch.angle === undefined ? undefined : inRange(patch.angle, 1, 90, "angle");
  const penumbra =
    patch.penumbra === undefined ? undefined : inRange(patch.penumbra, 0, 1, "penumbra");

  const capture = (): (() => void) => {
    const savedColor = light.color.clone();
    const savedIntensity = light.intensity;
    const savedDistance = ranged ? light.distance : 0;
    const savedDecay = ranged ? light.decay : 0;
    const savedAngle = spot?.angle ?? 0;
    const savedPenumbra = spot?.penumbra ?? 0;
    return () => {
      light.color.copy(savedColor);
      light.intensity = savedIntensity;
      if (ranged) {
        light.distance = savedDistance;
        light.decay = savedDecay;
      }
      if (spot) {
        spot.angle = savedAngle;
        spot.penumbra = savedPenumbra;
      }
    };
  };

  return snapshotCommand(`Edit light ${light.name || light.type}`, capture, () => {
    if (color) {
      light.color.copy(color);
    }
    if (intensity !== undefined) {
      light.intensity = intensity;
    }
    if (ranged && distance !== undefined) {
      light.distance = distance;
    }
    if (ranged && decay !== undefined) {
      light.decay = decay;
    }
    if (spot && angle !== undefined) {
      spot.angle = THREE.MathUtils.degToRad(angle);
    }
    if (spot && penumbra !== undefined) {
      spot.penumbra = penumbra;
    }
  });
};

/**
 * Rebuild a primitive's geometry with some parameters changed, angles given
 * in degrees, and return the command that reverses it. The geometry the scene
 * no longer holds is disposed when the command is dropped.
 */
export const geometryPatchCommand = (
  mesh: THREE.Mesh,
  patch: Record<string, number>
): EditorCommand => {
  const type = mesh.geometry.type;
  if (!isEditableGeometryType(type)) {
    throw new Error(
      `${mesh.name || "This mesh"} has a ${type}, which has no editable parameters. Only shapes added from the editor's Add menu do.`
    );
  }
  const specs = GEOMETRY_PARAM_SPECS[type];
  const next: GeometryParams = readGeometryParams(mesh.geometry);
  for (const [key, value] of Object.entries(patch)) {
    const spec = specs.find((s) => s.key === key);
    if (!spec) {
      throw new Error(
        `${type} has no parameter "${key}". Its parameters are: ${specs.map((s) => s.key).join(", ")}.`
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(`${key} must be a number, got ${value}.`);
    }
    next[key] = spec.kind === "angle" ? THREE.MathUtils.degToRad(value) : value;
  }
  const before = mesh.geometry;
  const after = buildGeometry(type, next);
  mesh.geometry = after;
  return {
    label: `Edit geometry of ${mesh.name || mesh.type}`,
    undo: () => {
      mesh.geometry = before;
    },
    redo: () => {
      mesh.geometry = after;
    },
    dispose: (undone) => (undone ? after : before).dispose()
  };
};
