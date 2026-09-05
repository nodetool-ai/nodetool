/**
 * Typed dynamic slots — normalization and helpers.
 *
 * A dynamic slot is a pair:
 *   `dynamic_inputs[name]`     → declaration (type, description, default, …)
 *   `dynamic_properties[name]` → current inline value
 *
 * The store always holds declarations in the `DynamicSlotDeclaration` shape.
 * Schema resolvers (FAL, Kie, Replicate, Comfy) and older persisted data spread
 * the TypeMetadata at the top level instead (`{ type: "image", type_args: [],
 * description }`). `normalizeDynamicSlots` converts either shape at the
 * resolver boundary, so consumers never branch on it.
 */
import type { TypeMetadata } from "../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../stores/NodeData";
import { isBoolean, isNumber, isRecord, isString } from "./typePredicates";

export const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const asEnumValues = (value: unknown): Array<string | number> | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const filtered = value.filter(
    (entry): entry is string | number =>
      typeof entry === "string" || typeof entry === "number"
  );
  return filtered.length > 0 ? filtered : null;
};

/** Coerce anything resolver-shaped into a complete `TypeMetadata`. */
export const normalizeTypeMetadata = (raw: unknown): TypeMetadata => {
  if (isString(raw)) {
    return { ...ANY_TYPE, type: raw };
  }
  if (!isRecord(raw)) {
    return { ...ANY_TYPE };
  }
  const typeName = isString(raw.type) ? raw.type : "any";
  const typeArgs = Array.isArray(raw.type_args)
    ? raw.type_args.map(normalizeTypeMetadata)
    : [];
  return {
    type: typeName,
    optional: raw.optional === true,
    // Resolvers emit JSON-schema `enum`; the editor reads `values`.
    values: asEnumValues(raw.values) ?? asEnumValues(raw.enum),
    type_args: typeArgs,
    type_name: isString(raw.type_name) ? raw.type_name : null
  };
};

/**
 * Normalize one slot declaration. Accepts both the declaration shape
 * (`{ type: {...} }`) and the flat resolver shape (`{ type: "image", … }`).
 */
export const normalizeDynamicSlot = (raw: unknown): DynamicSlotDeclaration => {
  if (!isRecord(raw)) {
    return { type: normalizeTypeMetadata(raw) };
  }
  // `type` as an object means the declaration shape; anything else means the
  // TypeMetadata is spread across the slot object itself.
  const typeSource = isRecord(raw.type) ? raw.type : raw;
  const slot: DynamicSlotDeclaration = { type: normalizeTypeMetadata(typeSource) };
  if (isString(raw.description)) {
    slot.description = raw.description;
  }
  if (raw.default !== undefined) {
    slot.default = raw.default;
  }
  if (isBoolean(raw.required)) {
    slot.required = raw.required;
  }
  if (isNumber(raw.min)) {
    slot.min = raw.min;
  }
  if (isNumber(raw.max)) {
    slot.max = raw.max;
  }
  return slot;
};

/** Normalize a whole `dynamic_inputs` map. */
export const normalizeDynamicSlots = (
  raw: Record<string, unknown> | undefined | null
) => {
  const out: Record<string, DynamicSlotDeclaration> = {};
  for (const [name, slot] of Object.entries(raw ?? {})) {
    out[name] = normalizeDynamicSlot(slot);
  }
  return out;
};

/** Declared type of a slot, or `any` when there is no declaration. */
export const slotType = (
  slot: DynamicSlotDeclaration | undefined
): TypeMetadata => slot?.type ?? ANY_TYPE;

/**
 * True when the slot carries a real (non-`any`) declared type — the condition
 * under which connection gating applies. Untyped slots stay promiscuous.
 */
export const isTypedSlot = (slot: unknown): boolean =>
  slot !== undefined &&
  slot !== null &&
  normalizeDynamicSlot(slot).type.type !== "any";

/** Inline value a freshly created slot of `type` starts with. */
export const defaultValueForType = (
  type: TypeMetadata
): string | number | boolean | unknown[] | object | null => {
  switch (type.type) {
    case "str":
    case "text":
    case "any":
      return "";
    case "int":
    case "float":
    case "number":
      return 0;
    case "bool":
      return false;
    case "list":
      return [];
    case "dict":
      return {};
    default:
      return null;
  }
};

const NUMERIC_TYPES: ReadonlySet<string> = new Set(["int", "float", "number"]);

/**
 * Type of a runtime value, as the runner sees it. Mirrors `inferValueType` in
 * `packages/kernel/src/dynamic-slots.ts` — notably, a tagged ref carries its
 * NodeTool type inline (`{ type: "image", … }`), so an image ref is an
 * `image`, not an anonymous object.
 *
 * `undefined` means nothing can be said (null/undefined), which callers read
 * as "no check possible".
 */
const inferValueType = (value: unknown): TypeMetadata | undefined => {
  if (value === null || value === undefined) return undefined;
  switch (typeof value) {
    case "string":
      return { ...ANY_TYPE, type: "str" };
    case "boolean":
      return { ...ANY_TYPE, type: "bool" };
    case "number":
      return { ...ANY_TYPE, type: Number.isInteger(value) ? "int" : "float" };
    case "object":
      break;
    default:
      return undefined;
  }

  if (Array.isArray(value)) {
    const element = value.length > 0 ? inferValueType(value[0]) : undefined;
    return {
      ...ANY_TYPE,
      type: "list",
      type_args: element ? [element] : []
    };
  }

  const tag = (value as Record<string, unknown>).type;
  if (isString(tag) && tag.length > 0) {
    return { ...ANY_TYPE, type: tag };
  }
  return { ...ANY_TYPE, type: "dict" };
};

/** Mirrors `TypeMetadata.isCompatibleWith` in `@nodetool-ai/protocol`. */
const typesCompatible = (a: TypeMetadata, b: TypeMetadata): boolean => {
  if (a.type === "any" || b.type === "any") return true;

  const aArgs = a.type_args ?? [];
  const bArgs = b.type_args ?? [];
  if (a.type === b.type) {
    if (aArgs.length === 0 && bArgs.length === 0) return true;
    // Different arities stay a loose match, as the runner does.
    if (aArgs.length !== bArgs.length) return true;
    return aArgs.every((arg, i) => typesCompatible(arg, bArgs[i]));
  }

  if (NUMERIC_TYPES.has(a.type) && NUMERIC_TYPES.has(b.type)) return true;
  if (a.type === "union") return aArgs.some((arg) => typesCompatible(arg, b));
  if (b.type === "union") return bArgs.some((arg) => typesCompatible(arg, a));
  return false;
};

/**
 * Whether an inline slot value can still be a value of `type`, judged the way
 * the runner judges it. `false` means keeping the value would make the node
 * throw on its next run, so the caller must reseed.
 *
 * A value the runner cannot type at all (null/undefined) fits everything —
 * it is the empty state of every slot.
 */
export const valueFitsType = (value: unknown, type: TypeMetadata): boolean => {
  const actual = inferValueType(value);
  if (!actual) return true;
  return typesCompatible(actual, type);
};
