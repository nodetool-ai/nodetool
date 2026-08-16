import { isBoolean, isObjectLike } from "../../../utils/typePredicates";
/**
 * Get the type string for a value.
 * Handles typed output values from nodes (e.g., {type: "image", uri: "..."}).
 */
export const typeFor = (value: unknown): string => {
  if (value === undefined || value === null) {return "null";}
  if (Array.isArray(value)) {return "array";}
  if (isBoolean(value)) {return "boolean";}
  if (isObjectLike(value) && "type" in value) {
    return (value as { type: string }).type;
  }
  return typeof value;
};
