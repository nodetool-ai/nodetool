/**
 * Named type predicates for the representation checks the app runtime makes on
 * stored application documents, which arrive as unparsed JSON.
 */

export const isString = (value: unknown): value is string =>
  typeof value === "string";

/** An id or name that is present — an empty string names nothing. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

export const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isCallable = (
  value: unknown
): value is (...args: never[]) => unknown => typeof value === "function";

/** Anything `typeof` calls an object, `null` aside — an array passes. */
export const isObjectLike = (value: unknown): value is object =>
  typeof value === "object" && value !== null;
