import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";

/**
 * Returns true when `propertyName` is part of the node's basic surface —
 * already rendered on the node body via metadata `inline_fields` or
 * `input_fields`. Anything outside this set is "advanced" and lives in
 * the inspector by default.
 */
export const isBasicProperty = (
  metadata: NodeMetadata,
  propertyName: string
): boolean => {
  const inline = metadata.inline_fields ?? [];
  const inputs = metadata.input_fields ?? [];
  return inline.includes(propertyName) || inputs.includes(propertyName);
};

/**
 * Resolve the set of properties that should appear as input handles on the
 * node body. Combines metadata `input_fields` with per-node `exposedInputs`
 * (plan §8.4) — user-promoted advanced properties.
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
