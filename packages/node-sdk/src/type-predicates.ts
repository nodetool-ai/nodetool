/**
 * The predicate set the node packages import from `@nodetool-ai/node-sdk`.
 *
 * The representation checks that behave identically everywhere come from
 * `@nodetool-ai/protocol`, the workspace's one definition. The three below stay
 * here because their narrowing differs from protocol's on purpose.
 */

export {
  isBoolean,
  isFiniteNumber,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString
} from "@nodetool-ai/protocol";

/** A number greater than zero — a sample rate, a channel count, a duration. */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && value > 0;
}

/**
 * An object or an array — anything `typeof` calls "object" except `null`.
 * Use {@link isRecord} when array payloads must be rejected.
 *
 * Unlike protocol's, the narrowed type keeps whatever the caller already knew
 * and adds index access, so `isObjectLike(raw) && isNumber(raw.x)` reads a
 * field off an `unknown` without collapsing a known type to a record.
 */
export function isObjectLike<T>(value: T): value is T & Record<string, unknown> {
  return value !== null && typeof value === "object";
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
