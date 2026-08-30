/**
 * Narrowing predicates for values whose static type does not describe what a
 * text node actually receives at runtime — a serialized property bag, an
 * `any`-typed node property, a value read off a dynamic input.
 *
 * Each takes the caller's own type and returns it intersected with what the
 * check proved, so narrowing keeps the evidence the caller already had instead
 * of erasing it to `unknown`.
 */

export function isString<T>(value: T): value is T & string {
  return typeof value === "string";
}

/** A string with at least one character. */
export function isNonEmptyString<T>(value: T): value is T & string {
  return typeof value === "string" && value !== "";
}
