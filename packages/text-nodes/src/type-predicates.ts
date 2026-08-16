/**
 * Narrowing predicates for values whose static type does not describe what a
 * text node actually receives at runtime — a serialized property bag, a
 * parsed SVG element, a term-frequency slot.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string with at least one character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** A number greater than zero — a term count, a measure. */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && value > 0;
}

export function isFunction(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

/** Anything `typeof` calls an object, `null` aside — an array passes. */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
