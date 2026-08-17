/**
 * Named type predicates for the representation checks the web app makes on
 * values that arrive from a workflow run, an asset payload, or a stored
 * document.
 */

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

/** A number that can be used in arithmetic — excludes NaN and the infinities. */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * An array whose elements stay `unknown`. `Array.isArray` narrows an `unknown`
 * argument to `any[]`, so every element read after it is an implicit `any`;
 * on an argument that already has a type it narrows correctly and stays right.
 */
export const isArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

/** A keyed object — never `null`, never an array. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Anything `typeof` calls an object, `null` aside — an array passes. */
export const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isFunction = (
  value: unknown
): value is (...args: never[]) => unknown => typeof value === "function";
