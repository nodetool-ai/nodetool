/**
 * Type predicates for values that reach the debug harnesses untyped.
 *
 * A workflow graph, an app document, a sketch, a timeline, and every message a
 * run emits arrive here as parsed JSON, so each field is `unknown` until
 * something narrows it. These are the questions the harnesses ask, each with
 * one definition so the leniency they encode is the same at every call site.
 */

/** A string field. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string field carrying content. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A string field carrying content that is not only whitespace. */
export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** A numeric field, `NaN` and infinities included. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** A numeric field safe to compute with. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A finite measurement above zero — a size, a duration, a limit. */
export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** A boolean field. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * A non-null object, arrays included — the lenient check used where an array
 * is an acceptable payload or has already been handled by an earlier branch.
 */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** A non-null, non-array object: a keyed payload. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A callable slot on an object whose shape is only partly known. */
export function isFunctionValue(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}
