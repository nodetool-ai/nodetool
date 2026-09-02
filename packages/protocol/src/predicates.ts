/**
 * Named type predicates for the representation checks the protocol makes on
 * values that arrive off the wire, out of storage, or from an agent.
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

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * An object or an array — anything `typeof` calls "object" except `null`.
 * Use {@link isRecord} when array payloads must be rejected.
 */
export function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
