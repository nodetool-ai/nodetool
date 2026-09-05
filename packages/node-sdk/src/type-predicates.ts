/**
 * Named type predicates for the representation checks the SDK makes on values
 * that arrive as unparsed JSON — a stored graph, a package manifest, a node
 * property bag, an AST node from the code analyzer.
 *
 * These are the single home for the predicate set: the node packages import
 * them from `@nodetool-ai/node-sdk` rather than keeping their own copies.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string with at least one character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A number greater than zero — a sample rate, a channel count, a duration. */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && value > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * An object or an array — anything `typeof` calls "object" except `null`.
 * Use {@link isRecord} when array payloads must be rejected.
 *
 * The narrowed type keeps whatever the caller already knew and adds index
 * access, so `isObjectLike(raw) && isNumber(raw.x)` reads a field off an
 * `unknown` without a cast.
 */
export function isObjectLike<T>(value: T): value is T & Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Narrowing keeps the caller's own type, so a guarded optional method stays
 * callable with its real arguments instead of collapsing to `never[]`.
 */
export function isCallable<T>(
  value: T
): value is T & ((...args: never[]) => unknown) {
  return typeof value === "function";
}
