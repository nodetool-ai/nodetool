/**
 * Named type predicates for the representation checks made on values that
 * arrive off the wire, out of storage, or from an agent — none of which pass a
 * schema boundary first.
 *
 * This is the one definition for the whole workspace: every package that used
 * to keep its own copy imports these from `@nodetool-ai/protocol`, so the
 * leniency each predicate encodes is the same at every call site.
 */

/** A string field. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string field carrying content. An empty string names nothing. */
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

/** A whole number. */
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** A boolean field. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** A non-null, non-array object: a keyed payload. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A non-null object, arrays included — the lenient check used where an array
 * is an acceptable payload or an earlier branch already handled it. Use
 * {@link isRecord} when array payloads must be rejected.
 */
export function isObjectLike(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A callable slot on an object whose shape is only partly known. */
export function isCallable(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}
