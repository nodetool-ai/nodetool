/**
 * Named type predicates for the representation checks the runner makes on
 * values that arrive from a node's output, a graph descriptor, or a run
 * parameter — none of which the kernel parses at a schema boundary.
 */

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

/**
 * An object value. Arrays pass — the runner's own checks never excluded them,
 * and the sites that care test `Array.isArray` on their own.
 */
export const isObjectValue = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isCallable = (
  value: unknown
): value is (...args: never[]) => unknown => typeof value === "function";
