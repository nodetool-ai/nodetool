/**
 * Narrowing predicates for values whose static type does not describe what an
 * image node actually receives at runtime — a serialized property bag, a
 * persisted layer state, a media ref.
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

/** A number that is neither NaN nor infinite — a coordinate, a scale. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Anything `typeof` calls an object, `null` aside — an array passes. */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
