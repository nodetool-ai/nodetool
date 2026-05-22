import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";

export type ExposedInputPlacement = "handle" | "labeled";

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

/**
 * Resolve the set of properties that should appear as input handles on the
 * node body (left handle column). Combines metadata `input_fields` with
 * per-node `exposedInputs` — properties the user promoted as handle-only.
 */
export const resolveExposedInputNames = (
  metadata: NodeMetadata,
  data: NodeData
): string[] => {
  const inputs = metadata.input_fields ?? [];
  const exposed = data.exposedInputs ?? [];
  const labeled = new Set(data.exposedInputsLabeled ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of inputs) {
    if (!seen.has(n) && !labeled.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  for (const n of exposed) {
    if (!seen.has(n) && !labeled.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
};

/** Properties promoted to labeled input rows at the bottom of the node body. */
export const resolveExposedInputLabeledNames = (data: NodeData): string[] => [
  ...(data.exposedInputsLabeled ?? [])
];

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

/**
 * Pure helper: add `propertyName` to the exposed list if absent, preserving
 * order. Returns the same array reference when no change is needed so
 * callers can skip writes.
 */
export const addExposedInput = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (list.includes(propertyName)) {
    return list;
  }
  return [...list, propertyName];
};

export const addExposedInputLabeled = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (list.includes(propertyName)) {
    return list;
  }
  return [...list, propertyName];
};

/**
 * Pure helper: drop `propertyName` from the exposed list. Returns the same
 * array reference when no change is needed.
 */
export const removeExposedInput = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (!list.includes(propertyName)) {
    return list;
  }
  return list.filter((n) => n !== propertyName);
};

export const removeExposedInputLabeled = (
  current: string[] | undefined,
  propertyName: string
): string[] => {
  const list = current ?? [];
  if (!list.includes(propertyName)) {
    return list;
  }
  return list.filter((n) => n !== propertyName);
};

/** Remove from both placement lists (mutual exclusivity when re-adding). */
export const removeExposedInputEverywhere = (
  data: Pick<NodeData, "exposedInputs" | "exposedInputsLabeled">,
  propertyName: string
): {
  exposedInputs: string[];
  exposedInputsLabeled: string[];
} => ({
  exposedInputs: removeExposedInput(data.exposedInputs, propertyName),
  exposedInputsLabeled: removeExposedInputLabeled(
    data.exposedInputsLabeled,
    propertyName
  )
});

export type ExposedInputListsPatch = {
  exposedInputs?: string[];
  exposedInputsLabeled?: string[];
};

/**
 * Set placement for a property. `null` removes from both lists.
 * Switching placement removes the property from the other list.
 */
export const patchExposedInputPlacement = (
  data: Pick<NodeData, "exposedInputs" | "exposedInputsLabeled">,
  propertyName: string,
  placement: ExposedInputPlacement | null
): ExposedInputListsPatch => {
  const cleared = removeExposedInputEverywhere(data, propertyName);
  if (placement === null) {
    const patch: ExposedInputListsPatch = {};
    if (cleared.exposedInputs !== data.exposedInputs) {
      patch.exposedInputs = cleared.exposedInputs;
    }
    if (cleared.exposedInputsLabeled !== data.exposedInputsLabeled) {
      patch.exposedInputsLabeled = cleared.exposedInputsLabeled;
    }
    return patch;
  }
  if (placement === "handle") {
    const next = addExposedInput(cleared.exposedInputs, propertyName);
    const patch: ExposedInputListsPatch = { exposedInputs: next };
    if (cleared.exposedInputsLabeled !== data.exposedInputsLabeled) {
      patch.exposedInputsLabeled = cleared.exposedInputsLabeled;
    }
    return patch;
  }
  const nextLabeled = addExposedInputLabeled(
    cleared.exposedInputsLabeled,
    propertyName
  );
  const patch: ExposedInputListsPatch = { exposedInputsLabeled: nextLabeled };
  if (cleared.exposedInputs !== data.exposedInputs) {
    patch.exposedInputs = cleared.exposedInputs;
  }
  return patch;
};

/** True when the inspector / menu may promote this property to an input handle. */
export const canPromotePropertyToInputHandle = (
  metadata: NodeMetadata | undefined,
  propertyName: string
): boolean => {
  if (!metadata) {
    return false;
  }
  const fixedHandles = new Set([
    ...(metadata.inline_fields ?? []),
    ...(metadata.input_fields ?? [])
  ]);
  return !fixedHandles.has(propertyName);
};
