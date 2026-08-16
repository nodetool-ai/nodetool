/**
 * Type predicates for values that arrive over the WebSocket wire.
 *
 * Client frames are MsgPack/JSON, so every field reaches the runner as
 * `unknown` and has to be narrowed before use. These are the questions the
 * runner asks about such a value, each with one definition so the leniency
 * they encode (what counts as an object, whether arrays pass) is the same at
 * every call site.
 */

/** A string field. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string field carrying content. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A numeric field, `NaN` and infinities included. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** A numeric field safe to compute with. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
  return Boolean(value) && typeof value === "object";
}

/** A non-null, non-array object: a keyed payload. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A callable slot on an object whose shape the runner only partly knows. */
export function isFunctionValue(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}
