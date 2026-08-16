/**
 * Typed dynamic slots — runner-side enforcement.
 *
 * A dynamic node stores user-added inputs as two parallel maps:
 *
 *   dynamic_inputs[name]     → DynamicSlotMeta (the declared type)
 *   dynamic_properties[name] → unknown        (the current value)
 *
 * A slot with no entry in `dynamic_inputs` is untyped (`any`): it is never
 * coerced and never an error — that is the legacy path and stays as it was.
 * A slot with a declaration is coerced where safe (scalar → `list[T]`,
 * numeric widening) and rejected with a node error when the value cannot
 * possibly fit.
 *
 * See docs/superpowers/specs/2026-07-26-typed-dynamic-slots-design.md.
 */

import type { DynamicSlotMeta, NodeDescriptor } from "@nodetool-ai/protocol";
import { TypeMetadata } from "@nodetool-ai/protocol";

/**
 * Render a slot declaration's type as a NodeTool type string
 * (`"image"`, `"list[str]"`, …), or `undefined` when the declaration
 * carries no usable type.
 *
 * Accepts every shape `DynamicSlotMeta.type` can take: a `TypeMetadata`
 * instance, the wire form (`{ type, type_args }`), or a bare type string.
 */
export function dynamicSlotTypeString(
  meta: DynamicSlotMeta | undefined
): string | undefined {
  if (!meta) return undefined;
  return typeToString(meta.type);
}

function typeToString(type: unknown): string | undefined {
  if (typeof type === "string") return type.length > 0 ? type : undefined;
  if (type instanceof TypeMetadata) return type.toString();
  if (!type || typeof type !== "object") return undefined;

  const record = type as Record<string, unknown>;
  const base = record.type;
  if (typeof base !== "string" || base.length === 0) return undefined;

  const rawArgs = Array.isArray(record.type_args)
    ? record.type_args
    : Array.isArray(record.args)
      ? record.args
      : [];
  const args = rawArgs
    .map((arg) => typeToString(arg))
    .filter((arg): arg is string => arg !== undefined);
  return args.length > 0 ? `${base}[${args.join(", ")}]` : base;
}

/**
 * Declared type string of a dynamic input handle, or `undefined` when the
 * node has no declaration for it (untyped legacy slot).
 */
export function getDynamicSlotTypeString(
  node: NodeDescriptor | undefined,
  handle: string
): string | undefined {
  const slots = node?.dynamic_inputs;
  if (!slots || !Object.hasOwn(slots, handle)) return undefined;
  return dynamicSlotTypeString(slots[handle]);
}

/**
 * The declared slot types of a node as a `propertyTypes`-shaped map, so
 * dynamic handles participate in the same type lookups as static ones.
 */
export function dynamicSlotPropertyTypes(
  slots: Record<string, DynamicSlotMeta> | undefined
) {
  const result: Record<string, string> = {};
  if (!slots) return result;
  for (const [name, meta] of Object.entries(slots)) {
    const typeStr = dynamicSlotTypeString(meta);
    if (typeStr) result[name] = typeStr;
  }
  return result;
}

/**
 * Best-effort type of a runtime value, as `TypeMetadata`.
 *
 * Returns `undefined` when nothing meaningful can be said (null/undefined,
 * functions), which callers treat as "no check possible".
 */
function inferValueType(value: unknown): TypeMetadata | undefined {
  if (value === null || value === undefined) return undefined;
  switch (typeof value) {
    case "string":
      return TypeMetadata.fromString("str");
    case "boolean":
      return TypeMetadata.fromString("bool");
    case "number":
      return TypeMetadata.fromString(Number.isInteger(value) ? "int" : "float");
    case "bigint":
      return TypeMetadata.fromString("int");
    case "object":
      break;
    default:
      return undefined;
  }

  if (Array.isArray(value)) {
    const element = value.length > 0 ? inferValueType(value[0]) : undefined;
    return TypeMetadata.fromString(
      `list[${element ? element.toString() : "any"}]`
    );
  }

  // Asset/model refs carry their NodeTool type inline (`{ type: "image", … }`).
  const tag = (value as Record<string, unknown>).type;
  if (typeof tag === "string" && tag.length > 0) {
    return TypeMetadata.fromString(tag);
  }
  return TypeMetadata.fromString("dict");
}

/**
 * Coerce a value toward a declared slot type, conservatively — mirrors
 * node-sdk's `coerceToDeclaredType`:
 *
 *   - a non-array scalar flowing into a `list[T]` slot is wrapped
 *   - numeric widening (`int` value into a `float`/`number` slot) needs no
 *     conversion, it is simply accepted by the compatibility check
 *
 * Anything else is returned untouched.
 */
function coerceToSlotType<TValue>(
  value: TValue,
  declared: TypeMetadata
): TValue | TValue[] {
  if (
    declared.isListType() &&
    value !== null &&
    value !== undefined &&
    !Array.isArray(value)
  ) {
    return [value];
  }
  return value;
}

/**
 * Error message for a value that cannot fit a declared slot type.
 * Kept in one place so the runner, the actor, and the tests agree.
 */
export function dynamicSlotTypeErrorMessage(params: {
  nodeId: string;
  nodeType: string;
  slot: string;
  expected: string;
  received: string;
}): string {
  return (
    `Dynamic input "${params.slot}" on node "${params.nodeId}" ` +
    `(${params.nodeType}) expects type ${params.expected} but received ` +
    `${params.received}`
  );
}

/**
 * Apply declared dynamic-slot types to a merged input bag.
 *
 * For every input key with a declaration in `node.dynamic_inputs`, coerce
 * the value toward the declared type and throw when it still does not fit.
 * Keys without a declaration (and nodes with no declarations at all) pass
 * through untouched — same object identity, so the legacy path is
 * unchanged.
 */
export function applyDynamicSlotTypes(
  node: NodeDescriptor,
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const slots = node.dynamic_inputs;
  if (!slots) return inputs;

  let result = inputs;
  for (const [slot, meta] of Object.entries(slots)) {
    if (!Object.hasOwn(inputs, slot)) continue;

    const declaredStr = dynamicSlotTypeString(meta);
    if (!declaredStr) continue;
    const declared = TypeMetadata.fromString(declaredStr);
    if (declared.isAny()) continue;

    const coerced = coerceToSlotType(inputs[slot], declared);
    const actual = inferValueType(coerced);
    if (actual && !actual.isCompatibleWith(declared)) {
      throw new Error(
        dynamicSlotTypeErrorMessage({
          nodeId: node.id,
          nodeType: node.type,
          slot,
          expected: declared.toString(),
          received: actual.toString()
        })
      );
    }

    if (coerced !== inputs[slot]) {
      if (result === inputs) result = { ...inputs };
      result[slot] = coerced;
    }
  }
  return result;
}
