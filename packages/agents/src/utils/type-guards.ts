/**
 * Named predicates for the shapes this package reads off its untrusted
 * boundaries: QuickJS guest results, tool call arguments, model output, and
 * media refs. Each one is the check the call sites used to inline, so the
 * leniency of a boundary stays exactly where it was — a value that passed
 * before passes now.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string with at least one character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** A string that holds something other than whitespace. */
export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** A number that is neither `NaN` nor an infinity. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isFunction(
  value: unknown
): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

/** A keyed object — never `null`, never an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Anything `typeof` calls an object, `null` aside — an array passes. The
 * looser sibling of {@link isRecord}, kept apart because the boundaries that
 * accept an array here must keep accepting it.
 */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
