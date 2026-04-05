/**
 * Wrap / unwrap primitives — T-MSG-7.
 *
 * Converts JS primitives to typed wrappers and back.
 */

export interface WrappedPrimitive {
  type: "int" | "float" | "str" | "bool";
  value: number | string | boolean;
}

/**
 * Wrap a JS primitive into a typed wrapper.
 */
export function wrapPrimitive(
  value: number | string | boolean
): WrappedPrimitive {
  if (typeof value === "string") {
    return { type: "str", value };
  }
  if (typeof value === "boolean") {
    return { type: "bool", value };
  }
  // number
  if (Number.isInteger(value)) {
    return { type: "int", value };
  }
  return { type: "float", value };
}

/**
 * Unwrap a typed wrapper back to a JS primitive.
 */
export function unwrapPrimitive(
  wrapped: WrappedPrimitive
): number | string | boolean {
  return wrapped.value;
}
