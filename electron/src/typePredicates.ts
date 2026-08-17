/**
 * Named type predicates for the representation checks the main process makes
 * on values it does not control — IPC arguments from the renderer, parsed
 * settings YAML, workflow JSON, socket frames.
 *
 * These are narrowing helpers only. Probes for whether a *global* exists
 * (`typeof process`, `typeof window`) must stay written inline: passing an
 * undeclared identifier to a function throws a ReferenceError.
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string with at least one character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Anything `typeof` calls an object, `null` aside — an array passes. */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
