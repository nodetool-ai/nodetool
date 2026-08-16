/**
 * Wrap / unwrap primitives — T-MSG-7.
 *
 * Converts JS primitives to typed wrappers and back.
 */
import { isBoolean, isString } from "./predicates.js";

export interface WrappedPrimitive {
  type: "int" | "float" | "str" | "bool";
  value: number | string | boolean;
}

export function wrapPrimitive(
  value: number | string | boolean
): WrappedPrimitive {
  if (isString(value)) {
    return { type: "str", value };
  }
  if (isBoolean(value)) {
    return { type: "bool", value };
  }
  if (Number.isInteger(value)) {
    return { type: "int", value };
  }
  return { type: "float", value };
}

export function unwrapPrimitive(
  wrapped: WrappedPrimitive
): number | string | boolean {
  return wrapped.value;
}
