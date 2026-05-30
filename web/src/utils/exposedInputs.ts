import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";

export type ExposedInputPlacement = "handle" | "labeled";

export type ExposedInputPlacementData = Pick<
  NodeData,
  "exposedInputs" | "exposedInputsLabeled" | "exposedInputsHidden"
>;

/** Inspector toggle cycle: off → top handle → bottom labeled → off. */
export const nextExposedInputPlacement = (
  current: ExposedInputPlacement | null
): ExposedInputPlacement | null => {
  if (current === null) {
    return "handle";
  }
  if (current === "handle") {
    return "labeled";
  }
  return null;
};

type ExposedPlacementMetadata = Pick<
  NodeMetadata,
  "input_fields" | "inline_fields"
>;

/** Metadata default before per-node overrides. */
export const getDefaultExposedPlacement = (
  metadata: ExposedPlacementMetadata,
  propertyName: string
): ExposedInputPlacement | null => {
  if ((metadata.input_fields ?? []).includes(propertyName)) {
    return "handle";
  }
  if ((metadata.inline_fields ?? []).includes(propertyName)) {
    return "labeled";
  }
  return null;
};

/** Effective placement including metadata defaults and per-node overrides. */
export const getEffectiveExposedPlacement = (
  metadata: NodeMetadata,
  data: NodeData,
  propertyName: string
): ExposedInputPlacement | null => {
  if ((data.exposedInputsHidden ?? []).includes(propertyName)) {
    return null;
  }
  if ((data.exposedInputsLabeled ?? []).includes(propertyName)) {
    return "labeled";
  }
  if ((data.exposedInputs ?? []).includes(propertyName)) {
    return "handle";
  }
  return getDefaultExposedPlacement(metadata, propertyName);
};

/** @deprecated Use getEffectiveExposedPlacement with metadata. */
export const getExposedInputPlacement = (
  data: NodeData,
  propertyName: string
): ExposedInputPlacement | null => {
  if ((data.exposedInputs ?? []).includes(propertyName)) {
    return "handle";
  }
  if ((data.exposedInputsLabeled ?? []).includes(propertyName)) {
    return "labeled";
  }
  return null;
};

const addToList = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (list.includes(propertyName)) {
    return list;
  }
  return [...list, propertyName];
};

const removeFromList = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (!list.includes(propertyName)) {
    return list;
  }
  return list.filter((n) => n !== propertyName);
};

/**
 * Resolve the set of properties that should appear as input handles on the
 * left handle column (top).
 */
export const resolveExposedInputNames = (
  metadata: NodeMetadata,
  data: NodeData
): string[] => {
  const hidden = new Set(data.exposedInputsHidden ?? []);
  const labeled = new Set(data.exposedInputsLabeled ?? []);
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (name: string) => {
    if (hidden.has(name) || labeled.has(name) || seen.has(name)) {
      return;
    }
    seen.add(name);
    out.push(name);
  };

  for (const n of metadata.input_fields ?? []) {
    push(n);
  }
  for (const n of data.exposedInputs ?? []) {
    push(n);
  }
  for (const n of metadata.inline_fields ?? []) {
    if ((data.exposedInputs ?? []).includes(n)) {
      push(n);
    }
  }
  return out;
};

/** Inline-field rows (editors under preview / in generic body). */
export const resolveInlineFieldNames = (
  metadata: NodeMetadata,
  data: NodeData
): string[] => {
  const hidden = new Set(data.exposedInputsHidden ?? []);
  const labeled = new Set(data.exposedInputsLabeled ?? []);
  const handleForced = new Set(data.exposedInputs ?? []);
  return (metadata.inline_fields ?? []).filter(
    (name) =>
      !hidden.has(name) && !labeled.has(name) && !handleForced.has(name)
  );
};

/** Bottom labeled section (explicit overrides only). */
export const resolveExposedInputLabeledNames = (data: NodeData): string[] => [
  ...(data.exposedInputsLabeled ?? [])
];

export const addExposedInput = (
  current: string[] | undefined,
  propertyName: string
): string[] => addToList(current, propertyName);

export const removeExposedInput = (
  current: string[] | undefined,
  propertyName: string
): string[] => removeFromList(current, propertyName);

export type ExposedInputListsPatch = {
  exposedInputs?: string[];
  exposedInputsLabeled?: string[];
  exposedInputsHidden?: string[];
};

/**
 * Apply target placement for any property (including metadata input_fields /
 * inline_fields). Uses override lists only when target differs from default.
 */
export const applyExposedPlacementTarget = (
  metadata: ExposedPlacementMetadata,
  data: ExposedInputPlacementData,
  propertyName: string,
  target: ExposedInputPlacement | null
): ExposedInputListsPatch => {
  const defaultPlacement = getDefaultExposedPlacement(metadata, propertyName);

  let exposedInputs = [...(data.exposedInputs ?? [])];
  let exposedInputsLabeled = [...(data.exposedInputsLabeled ?? [])];
  let exposedInputsHidden = [...(data.exposedInputsHidden ?? [])];

  exposedInputs = removeFromList(exposedInputs, propertyName);
  exposedInputsLabeled = removeFromList(exposedInputsLabeled, propertyName);
  exposedInputsHidden = removeFromList(exposedInputsHidden, propertyName);

  if (target === null) {
    if (defaultPlacement !== null) {
      exposedInputsHidden = addToList(exposedInputsHidden, propertyName);
    }
  } else if (target === "handle") {
    if (defaultPlacement !== "handle") {
      exposedInputs = addToList(exposedInputs, propertyName);
    }
  } else if (defaultPlacement !== "labeled") {
    exposedInputsLabeled = addToList(exposedInputsLabeled, propertyName);
  }

  const patch: ExposedInputListsPatch = {};
  const listChanged = (
    next: string[],
    prev: string[] | undefined
  ): boolean => {
    const previous = prev ?? [];
    if (next.length !== previous.length) {
      return true;
    }
    return next.some((name, index) => name !== previous[index]);
  };
  if (listChanged(exposedInputs, data.exposedInputs)) {
    patch.exposedInputs = exposedInputs;
  }
  if (listChanged(exposedInputsLabeled, data.exposedInputsLabeled)) {
    patch.exposedInputsLabeled = exposedInputsLabeled;
  }
  if (listChanged(exposedInputsHidden, data.exposedInputsHidden)) {
    patch.exposedInputsHidden = exposedInputsHidden;
  }
  return patch;
};

/** All inspector-listed properties may cycle placement (not only advanced). */
export const canConfigureExposedPlacement = (
  metadata: NodeMetadata | undefined,
  propertyName: string
): boolean => {
  if (!metadata) {
    return false;
  }
  return (metadata.properties ?? []).some((p) => p.name === propertyName);
};

