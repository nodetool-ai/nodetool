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

export const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
