/**
 * Narrowing predicates for values whose static type does not describe what a
 * provider or an asset payload actually carries at runtime — JSON decoded from
 * an API response, a message content union, an optional SDK method.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

export function isCallable<T>(
  value: T
): value is T & ((...args: never[]) => unknown) {
  return typeof value === "function";
}
