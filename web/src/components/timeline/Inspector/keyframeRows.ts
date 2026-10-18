/**
 * Keyframed inspector rows, Premiere's Effect Controls model.
 *
 * A row is one property as a user thinks of it (Position, Scale, Opacity),
 * backed by one or more keyframe curves. With its stopwatch off, the row edits
 * the clip's authored value. With it on, the row shows the value the viewer
 * sees at the playhead and every edit writes a keyframe there. Keyframe values
 * fold onto the authored value (`ANIMATED_PROPERTY_FOLD`), so the row converts
 * in both directions and the user only ever sees the composed number.
 *
 * Everything here is pure: the components call these and hand the patch to
 * `editClipKeyframes`, which makes each edit one undo step.
 */

import {
  clearKeyframes,
  composeKeyframeValue,
  hasKeyframeAt,
  isPropertyKeyframed,
  keyframeIdentity,
  keyframeTimesMs,
  keyframeValueAt,
  keyframeValueForComposed,
  model3dStyleWithPatch,
  removeKeyframes,
  setKeyframes,
  type ClipTransform,
  type KeyframeProperty,
  type TimelineClip
} from "@nodetool-ai/timeline";

export interface KeyframeInputSpec {
  property: KeyframeProperty;
  ariaLabel: string;
  /** The clip's authored value, in stored units. */
  base: (clip: TimelineClip) => number;
  /** The patch that writes a new authored value, in stored units. */
  basePatch: (clip: TimelineClip, value: number) => Partial<TimelineClip>;
  /** Stored → displayed (radians → degrees, 0..1 → percent). Default 1. */
  displayScale?: number;
  decimals: number;
  unit?: string;
  /** Bounds on the composed value, in stored units. */
  min?: number;
  max?: number;
  /** Drag-scrub step and range, in displayed units. */
  scrub: { step: number; min?: number; max?: number };
}

export interface KeyframeRowSpec {
  id: string;
  label: string;
  inputs: readonly KeyframeInputSpec[];
}

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

const transformOf = (clip: TimelineClip): ClipTransform =>
  clip.transform ?? IDENTITY_TRANSFORM;

const cameraOf = (clip: TimelineClip) =>
  model3dStyleWithPatch(clip.model3dStyle, undefined).camera;

export const OPACITY_ROW: KeyframeRowSpec = {
  id: "opacity",
  label: "Opacity",
  inputs: [
    {
      property: "opacity",
      ariaLabel: "Opacity",
      base: (clip) => clip.opacity ?? 1,
      basePatch: (_clip, value) => ({ opacity: value }),
      displayScale: 100,
      decimals: 0,
      unit: "%",
      min: 0,
      max: 1,
      scrub: { step: 1, min: 0, max: 100 }
    }
  ]
};

export const POSITION_ROW: KeyframeRowSpec = {
  id: "position",
  label: "Position",
  inputs: [
    {
      property: "offsetX",
      ariaLabel: "Position X",
      base: (clip) => transformOf(clip).position.x,
      basePatch: (clip, x) => {
        const t = transformOf(clip);
        return { transform: { ...t, position: { ...t.position, x } } };
      },
      decimals: 0,
      unit: "px",
      scrub: { step: 1 }
    },
    {
      property: "offsetY",
      ariaLabel: "Position Y",
      base: (clip) => transformOf(clip).position.y,
      basePatch: (clip, y) => {
        const t = transformOf(clip);
        return { transform: { ...t, position: { ...t.position, y } } };
      },
      decimals: 0,
      unit: "px",
      scrub: { step: 1 }
    }
  ]
};

/**
 * Scale keys one uniform curve, so an animated X and Y keep their ratio: the
 * same trade Premiere's Uniform Scale makes.
 */
export const SCALE_ROW: KeyframeRowSpec = {
  id: "scale",
  label: "Scale",
  inputs: [
    {
      property: "scale",
      ariaLabel: "Scale X",
      base: (clip) => transformOf(clip).scale.x,
      basePatch: (clip, x) => {
        const t = transformOf(clip);
        return { transform: { ...t, scale: { ...t.scale, x } } };
      },
      decimals: 2,
      unit: "×",
      min: 0.01,
      scrub: { step: 0.01, min: 0.01 }
    },
    {
      property: "scale",
      ariaLabel: "Scale Y",
      base: (clip) => transformOf(clip).scale.y,
      basePatch: (clip, y) => {
        const t = transformOf(clip);
        return { transform: { ...t, scale: { ...t.scale, y } } };
      },
      decimals: 2,
      unit: "×",
      min: 0.01,
      scrub: { step: 0.01, min: 0.01 }
    }
  ]
};

export const ROTATION_ROW: KeyframeRowSpec = {
  id: "rotation",
  label: "Rotation",
  inputs: [
    {
      property: "rotation",
      ariaLabel: "Rotation in degrees",
      base: (clip) => transformOf(clip).rotation,
      basePatch: (clip, rotation) => ({
        transform: { ...transformOf(clip), rotation }
      }),
      displayScale: 180 / Math.PI,
      decimals: 1,
      unit: "°",
      scrub: { step: 0.5 }
    }
  ]
};

export const CAMERA_ORBIT_ROW: KeyframeRowSpec = {
  id: "cameraOrbit",
  label: "Orbit",
  inputs: [
    {
      property: "cameraAzimuth",
      ariaLabel: "Camera azimuth",
      base: (clip) => cameraOf(clip).azimuthDeg,
      basePatch: (clip, azimuthDeg) => ({
        model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
          camera: { azimuthDeg }
        })
      }),
      decimals: 1,
      unit: "°",
      scrub: { step: 1 }
    },
    {
      property: "cameraElevation",
      ariaLabel: "Camera elevation",
      base: (clip) => cameraOf(clip).elevationDeg,
      basePatch: (clip, elevationDeg) => ({
        model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
          camera: { elevationDeg }
        })
      }),
      decimals: 1,
      unit: "°",
      scrub: { step: 1 }
    }
  ]
};

export const CAMERA_FOV_ROW: KeyframeRowSpec = {
  id: "cameraFov",
  label: "Field of view",
  inputs: [
    {
      property: "cameraFov",
      ariaLabel: "Camera field of view",
      base: (clip) => cameraOf(clip).fovDeg,
      basePatch: (clip, fovDeg) => ({
        model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
          camera: { fovDeg }
        })
      }),
      decimals: 1,
      unit: "°",
      min: 1,
      max: 170,
      scrub: { step: 1, min: 1, max: 170 }
    }
  ]
};

export const CAMERA_ZOOM_ROW: KeyframeRowSpec = {
  id: "cameraZoom",
  label: "Zoom",
  inputs: [
    {
      property: "cameraZoom",
      ariaLabel: "Camera zoom",
      base: (clip) => cameraOf(clip).zoom,
      basePatch: (clip, zoom) => ({
        model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
          camera: { zoom }
        })
      }),
      decimals: 2,
      unit: "×",
      min: 0.05,
      scrub: { step: 0.01, min: 0.05 }
    }
  ]
};

/** The rows whose stopwatch Alt+K presses, keyed by any of their curves. */
const ROWS_BY_PROPERTY = new Map<KeyframeProperty, KeyframeRowSpec>();
for (const row of [
  OPACITY_ROW,
  POSITION_ROW,
  SCALE_ROW,
  ROTATION_ROW,
  CAMERA_ORBIT_ROW,
  CAMERA_FOV_ROW,
  CAMERA_ZOOM_ROW
]) {
  for (const input of row.inputs) ROWS_BY_PROPERTY.set(input.property, row);
}

export function keyframeRowFor(property: KeyframeProperty): KeyframeRowSpec | undefined {
  return ROWS_BY_PROPERTY.get(property);
}

/** The distinct curves behind a row, in input order. */
export function rowProperties(row: KeyframeRowSpec): KeyframeProperty[] {
  return [...new Set(row.inputs.map((input) => input.property))];
}

export function isRowKeyframed(clip: TimelineClip, row: KeyframeRowSpec): boolean {
  return rowProperties(row).some((p) => isPropertyKeyframed(clip, p));
}

export function rowHasKeyframeAt(
  clip: TimelineClip,
  row: KeyframeRowSpec,
  atMs: number
): boolean {
  return rowProperties(row).some((p) => hasKeyframeAt(clip, p, atMs));
}

export function rowKeyframeTimesMs(clip: TimelineClip, row: KeyframeRowSpec): number[] {
  return keyframeTimesMs(clip, rowProperties(row));
}

/** The value an input shows: authored, or composed at the playhead when keyed. */
export function inputValueAt(
  clip: TimelineClip,
  input: KeyframeInputSpec,
  atMs: number
): number {
  const base = input.base(clip);
  if (!isPropertyKeyframed(clip, input.property)) return base;
  return composeKeyframeValue(
    input.property,
    base,
    keyframeValueAt(clip, input.property, atMs)
  );
}

function clampInput(input: KeyframeInputSpec, value: number): number {
  let v = value;
  if (input.min !== undefined) v = Math.max(input.min, v);
  if (input.max !== undefined) v = Math.min(input.max, v);
  return v;
}

/** Apply patches one after another, each reading the clip the last produced. */
function applyPatches(
  clip: TimelineClip,
  patches: ((working: TimelineClip) => Partial<TimelineClip>)[]
): { working: TimelineClip; patch: Partial<TimelineClip> } {
  let working = clip;
  let patch: Partial<TimelineClip> = {};
  for (const make of patches) {
    const next = make(working);
    working = { ...working, ...next };
    patch = { ...patch, ...next };
  }
  return { working, patch };
}

/**
 * Commit a typed or scrubbed value (stored units) for one input. Unkeyed, it
 * writes the authored value. Keyed, it writes a keyframe at `atMs` on every
 * curve of the row, so Position X and Y stay keyed together; null `atMs`
 * (playhead off the clip) writes nothing.
 */
export function commitInputValue(
  clip: TimelineClip,
  row: KeyframeRowSpec,
  input: KeyframeInputSpec,
  value: number,
  atMs: number | null
): Partial<TimelineClip> | null {
  if (!Number.isFinite(value)) return null;
  const composed = clampInput(input, value);
  if (!isRowKeyframed(clip, row)) return input.basePatch(clip, composed);
  if (atMs === null) return null;

  let working = clip;
  let patch: Partial<TimelineClip> = {};
  let kf = keyframeValueForComposed(input.property, input.base(clip), composed);
  if (kf === null) {
    // A multiplied curve on a zero base shows zero everywhere. Move the base
    // to 1 and re-key the existing keyframes at zero, so nothing else moves.
    const times = keyframeTimesMs(clip, [input.property]);
    const based = input.basePatch(working, 1);
    working = { ...working, ...based };
    for (const t of times) {
      working = {
        ...working,
        animations: setKeyframes(working, [{ property: input.property, value: 0 }], t)
      };
    }
    patch = { ...based };
    kf = composed;
  }
  const entries = rowProperties(row).map((property) => ({
    property,
    value:
      property === input.property
        ? (kf as number)
        : keyframeValueAt(working, property, atMs)
  }));
  return { ...patch, animations: setKeyframes(working, entries, atMs) };
}

/**
 * The stopwatch. Off → on keys every curve of the row at `atMs` with the
 * value showing now. On → off deletes the row's keyframes and keeps the value
 * showing at `atMs` as the authored value, the way Premiere does.
 */
export function toggleRowStopwatch(
  clip: TimelineClip,
  row: KeyframeRowSpec,
  atMs: number | null
): Partial<TimelineClip> | null {
  if (atMs === null) return null;
  const properties = rowProperties(row);
  if (!isRowKeyframed(clip, row)) {
    return {
      animations: setKeyframes(
        clip,
        properties.map((property) => ({
          property,
          value: isPropertyKeyframed(clip, property)
            ? keyframeValueAt(clip, property, atMs)
            : keyframeIdentity(property)
        })),
        atMs
      )
    };
  }
  const { working, patch } = applyPatches(
    clip,
    row.inputs.map((input) => {
      const value = inputValueAt(clip, input, atMs);
      return (c: TimelineClip) => input.basePatch(c, value);
    })
  );
  return { ...patch, animations: clearKeyframes(working, properties) };
}

/**
 * The diamond between the arrows: add a keyframe at `atMs` with the value
 * showing, or delete the one there. Deleting the last one turns the
 * stopwatch off and keeps the value, rather than jumping back to the base.
 */
export function toggleRowKeyframeAt(
  clip: TimelineClip,
  row: KeyframeRowSpec,
  atMs: number | null
): Partial<TimelineClip> | null {
  if (atMs === null) return null;
  const properties = rowProperties(row);
  if (!rowHasKeyframeAt(clip, row, atMs)) {
    return {
      animations: setKeyframes(
        clip,
        properties.map((property) => ({
          property,
          value: keyframeValueAt(clip, property, atMs)
        })),
        atMs
      )
    };
  }
  const remaining = rowKeyframeTimesMs(clip, row).filter(
    (t) => Math.abs(t - atMs) > 0.5
  );
  if (remaining.length === 0) return toggleRowStopwatch(clip, row, atMs);
  return { animations: removeKeyframes(clip, properties, atMs) };
}

/**
 * A preview-gizmo edit on a clip whose transform may be keyframed. The gizmo
 * hands back a new authored transform built from `startClip`'s; for a keyed
 * part (position, scale, rotation) the change lands as a keyframe at `atMs`
 * instead, measured from the value keyed there when the gesture began, and
 * the authored part stays put. Unkeyed parts patch the transform as before.
 */
export function gizmoTransformPatch(
  startClip: TimelineClip,
  next: ClipTransform,
  atMs: number | null
): Partial<TimelineClip> {
  const base = transformOf(startClip);
  if (atMs === null) return { transform: next };
  const keyed = (p: KeyframeProperty) => isPropertyKeyframed(startClip, p);
  const at = (p: KeyframeProperty) => keyframeValueAt(startClip, p, atMs);
  const transform: ClipTransform = { ...next };
  const entries: { property: KeyframeProperty; value: number }[] = [];

  if (keyed("offsetX") || keyed("offsetY")) {
    entries.push(
      { property: "offsetX", value: at("offsetX") + next.position.x - base.position.x },
      { property: "offsetY", value: at("offsetY") + next.position.y - base.position.y }
    );
    transform.position = base.position;
  }
  if (keyed("scale")) {
    const ratio =
      base.scale.x !== 0
        ? next.scale.x / base.scale.x
        : base.scale.y !== 0
          ? next.scale.y / base.scale.y
          : 1;
    entries.push({ property: "scale", value: at("scale") * ratio });
    transform.scale = base.scale;
  }
  if (keyed("rotation")) {
    entries.push({
      property: "rotation",
      value: at("rotation") + next.rotation - base.rotation
    });
    transform.rotation = base.rotation;
  }
  if (entries.length === 0) return { transform: next };
  return { transform, animations: setKeyframes(startClip, entries, atMs) };
}
