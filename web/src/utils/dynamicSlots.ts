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

export const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  if (typeof raw === "string") {
    return { ...ANY_TYPE, type: raw };
  }
  if (!isRecord(raw)) {
    return { ...ANY_TYPE };
  }
  const typeName = typeof raw.type === "string" ? raw.type : "any";
  const typeArgs = Array.isArray(raw.type_args)
    ? raw.type_args.map(normalizeTypeMetadata)
    : [];
  return {
    type: typeName,
    optional: raw.optional === true,
    // Resolvers emit JSON-schema `enum`; the editor reads `values`.
    values: asEnumValues(raw.values) ?? asEnumValues(raw.enum),
    type_args: typeArgs,
    type_name: typeof raw.type_name === "string" ? raw.type_name : null
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
  if (typeof raw.description === "string") {
    slot.description = raw.description;
  }
  if (raw.default !== undefined) {
    slot.default = raw.default;
  }
  if (typeof raw.required === "boolean") {
    slot.required = raw.required;
  }
  if (typeof raw.min === "number") {
    slot.min = raw.min;
  }
  if (typeof raw.max === "number") {
    slot.max = raw.max;
  }
  return slot;
};

/** Normalize a whole `dynamic_inputs` map. */
export const normalizeDynamicSlots = (
  raw: Record<string, unknown> | undefined | null
): Record<string, DynamicSlotDeclaration> => {
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
export const defaultValueForType = (type: TypeMetadata): unknown => {
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
