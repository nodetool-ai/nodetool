/**
 * Fields whose items are structured model inputs (keyframes, elements, shots)
 * get the provider-neutral types the Keyframe, Element and Shot nodes output,
 * instead of the raw `list[<SchemaName>]` or the `str` the parser falls back
 * to for a union. The fal factory translates the values back into each
 * model's request shape.
 */

import type { FieldDef } from "./types.js";

const KEYFRAME_ITEM_TYPES = new Set(["list[flux3keyframe]"]);

const isKling = (endpointId: string): boolean =>
  endpointId.includes("/kling-video/") || endpointId.includes("/kling-image/");

/** The accessory prop type for a field, or `null` when it is not one. */
export function accessoryPropType(
  endpointId: string,
  field: Pick<FieldDef, "name" | "propType">
): string | null {
  const propType = field.propType.toLowerCase();
  if (KEYFRAME_ITEM_TYPES.has(propType)) return "list[keyframe]";
  if (isKling(endpointId) && propType === "str") {
    if (field.name === "elements") return "list[video_element]";
    if (field.name === "multi_prompt") return "list[shot]";
  }
  return null;
}

/** The field with its accessory type applied, or the field unchanged. */
export function withAccessoryType(endpointId: string, field: FieldDef): FieldDef {
  const propType = accessoryPropType(endpointId, field);
  if (!propType) return field;
  return { ...field, propType, tsType: "object[]", default: [] };
}
