/**
 * Type-string helpers shared by the property validator, the graph validator
 * and the typed dynamic-slot machinery on BaseNode.
 *
 * Everything here works on the JSON type-metadata shape (`{ type, type_args }`)
 * that travels over the wire in node metadata, `dynamic_outputs` and
 * `dynamic_inputs`. The protocol's `TypeMetadata` *class* names its children
 * `args` instead of `type_args`, so both spellings are accepted.
 */
import {
  areTypeNamesCompatible,
  type DynamicSlotMeta
} from "@nodetool-ai/protocol";
import { isBoolean, isNumber, isString } from "./type-predicates.js";

/** Structural view of a type-metadata object, whatever produced it. */
export interface TypeMetaLike {
  type?: unknown;
  type_args?: unknown;
  args?: unknown;
}

/** Render type metadata as a NodeTool type string (`list[image]`, `str`, …). */
export function typeMetaToString(
  tm: TypeMetaLike | null | undefined
): string {
  if (!tm || !isString(tm.type) || !tm.type) return "";
  const rawArgs = Array.isArray(tm.type_args)
    ? tm.type_args
    : Array.isArray(tm.args)
      ? tm.args
      : [];
  const args = rawArgs
    .map((a) => typeMetaToString(a as TypeMetaLike))
    .filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
}

/** The declared type of a dynamic slot as a type string ("" when unknown). */
export function slotTypeToString(
  slot: DynamicSlotMeta | null | undefined
): string {
  if (!slot) return "";
  return typeMetaToString(slot.type);
}

/** Types that accept anything — never a mismatch on either side of an edge. */
const PERMISSIVE_TYPES: ReadonlySet<string> = new Set([
  "any",
  "object",
  "union",
  "list",
  "dict"
]);

function baseType(t: string): string {
  const i = t.indexOf("[");
  return i >= 0 ? t.slice(0, i) : t;
}

/**
 * Conservative type compatibility: only flag a mismatch when both sides are
 * known, concrete scalars that clearly differ. `any`/`object`/`union`/empty and
 * any generic container (type_args) are treated as compatible to avoid false
 * positives.
 */
export function typesIncompatible(
  sourceType: string,
  targetType: string
): boolean {
  if (!sourceType || !targetType) return false;
  if (sourceType === targetType) return false;
  const s = baseType(sourceType);
  const t = baseType(targetType);
  if (PERMISSIVE_TYPES.has(s) || PERMISSIVE_TYPES.has(t)) return false;
  if (s !== sourceType || t !== targetType) return false; // generic container — skip
  if (areTypeNamesCompatible(s, t)) return false;
  return s !== t;
}

/**
 * Conservative value/type check for an inline dynamic-slot value.
 *
 * Only clear scalar mismatches count. Anything null/undefined, any ref or
 * object type, and every container type passes — a scalar in a `list[T]` slot
 * is coerced by {@link coerceToDeclaredType}, not rejected.
 */
export function valueIncompatibleWithType(
  value: unknown,
  typeStr: string
): boolean {
  if (value === null || value === undefined) return false;
  if (!typeStr) return false;
  const base = baseType(typeStr);
  if (base !== typeStr) return false; // container — the element check is not ours
  if (PERMISSIVE_TYPES.has(base)) return false;
  switch (base) {
    case "str":
      return !isString(value);
    // NaN and ±Infinity are numbers to `typeof` but nothing downstream can use
    // them: they do not survive JSON, and an `int` slot holding 3.5 is the same
    // defect as one holding "3.5".
    case "int":
      return !Number.isInteger(value);
    case "float":
      return !isNumber(value) || !Number.isFinite(value);
    case "bool":
      return !isBoolean(value);
    default:
      return false;
  }
}
