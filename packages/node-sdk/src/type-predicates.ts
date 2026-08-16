/**
 * Named type predicates for the representation checks the SDK makes on values
 * that arrive as unparsed JSON — a stored graph, a package manifest, a node
 * property bag, an AST node from the code analyzer.
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

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * An object or an array — anything `typeof` calls "object" except `null`.
 * Use {@link isRecord} when array payloads must be rejected.
 */
export function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCallable(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}
