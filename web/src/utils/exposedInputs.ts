import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";

/**
 * Resolve the set of properties that should appear as input handles on the
 * node body. Combines metadata `input_fields` with per-node `exposedInputs`
 * — properties the user has promoted via the inspector toggle.
 */
export const resolveExposedInputNames = (
  metadata: NodeMetadata,
  data: NodeData
): string[] => {
  const inputs = metadata.input_fields ?? [];
  const exposed = data.exposedInputs ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of inputs) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  for (const n of exposed) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
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
