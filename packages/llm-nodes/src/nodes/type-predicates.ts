/**
 * Narrowing predicates for values whose static type does not describe what a
 * node actually receives at runtime — a serialized property bag, a provider
 * stream item, a tool payload.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * An object or an array — anything `typeof` calls "object" except `null`.
 * Use {@link isRecord} when array payloads must be rejected.
 */
export function isObjectLike(value: unknown): value is object {
  return !!value && typeof value === "object";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isCallable<T>(
  value: T
): value is T & ((...args: never[]) => unknown) {
  return typeof value === "function";
}
